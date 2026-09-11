const MAX_RESUME_LENGTH = 12000;
const MAX_JD_LENGTH = 6000;

function send(statusCode, data, origin) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    },
    body: statusCode === 204 ? '' : JSON.stringify(data)
  };
}

function normalise(content) {
  const text = Array.isArray(content) ? content.map((item) => item.text || '').join('') : String(content || '');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('模型没有返回可解析的结构化结果。');
  const value = JSON.parse(match[0]);
  const score = (item) => Number.isFinite(Number(item)) ? Math.max(0, Math.min(100, Math.round(Number(item)))) : 0;
  return {
    scores: { match: score(value?.scores?.match), competitiveness: score(value?.scores?.competitiveness), clarity: score(value?.scores?.clarity) },
    summary: String(value?.summary || '').slice(0, 800),
    strengths: Array.isArray(value?.strengths) ? value.strengths.map(String).slice(0, 4) : [],
    risks: Array.isArray(value?.risks) ? value.risks.map(String).slice(0, 4) : [],
    rewrite: String(value?.rewrite || '').slice(0, 1800),
    nextActions: Array.isArray(value?.nextActions) ? value.nextActions.map(String).slice(0, 4) : []
  };
}

function getModeContract(mode) {
  const contracts = {
    both: `任务是“综合诊断”。scores 依次代表岗位匹配度、简历竞争力和表达清晰度。summary 用 2 至 3 句给出总体结论；strengths 写 3 至 4 条优势；risks 写 3 至 4 条最重要的改进点；rewrite 只挑选一条最值得优化的经历，给出一段可直接替换的 STAR 式表达；nextActions 按优先级给出 3 至 4 个行动。`,
    score: `任务是“竞争力评分”，请完全以招聘者的初筛决策来完成，而不是润色简历。scores 依次代表岗位匹配度、竞争力评分和筛选通过度。summary 必须明确写出“建议投递 / 补强后投递 / 暂不建议投递”之一，并说明原因；strengths 必须是能支持通过筛选的岗位匹配证据；risks 必须是可能导致淘汰的硬伤或信息缺口；rewrite 不是改写经历，而是一段“招聘视角判定”，说明候选人与同届候选人的主要差距；nextActions 只输出按影响程度排序的补强优先级。`,
    polish: `任务是“简历润色”，请集中产出可复制进简历的表达，不要写泛泛的竞争力结论。scores 依次代表关键词匹配、成果表达和语言清晰度。summary 说明整份简历最突出的表达问题；strengths 是建议保留的事实、经历或措辞；risks 是需要重写的具体句子类型或信息缺口；rewrite 必须选择简历中一条真实经历，按三行输出“原信息概括：…\\n润色版本：…\\n可补充的量化信息：…”，不得编造数字；nextActions 是 3 至 4 条润色执行清单。`
  };
  return contracts[mode] || contracts.both;
}

export const handler = async (event) => {
  const rawEvent = Buffer.isBuffer(event) ? event.toString('utf8') : event;
  const request = typeof rawEvent === 'string' ? JSON.parse(rawEvent) : rawEvent;
  const method = request.requestContext?.http?.method || '';
  const origin = request.headers?.Origin || request.headers?.origin || '';
  const allowedOrigin = String(process.env.ALLOWED_ORIGIN || '').replace(/\/$/, '');
  const corsOrigin = allowedOrigin || origin || '*';
  if (method === 'OPTIONS') return send(204, {}, corsOrigin);
  if (method !== 'POST') return send(405, { error: '仅支持 POST 请求。' }, corsOrigin);
  if (allowedOrigin && origin !== allowedOrigin) return send(403, { error: '不允许的来源。' }, corsOrigin);
  let input;
  try {
    const body = request.isBase64Encoded ? Buffer.from(request.body || '', 'base64').toString('utf8') : request.body || '{}';
    input = JSON.parse(body);
  } catch { return send(400, { error: '请求数据格式不正确。' }, corsOrigin); }
  const { targetRole, jobDescription = '', resume, mode = 'both' } = input;
  if (typeof targetRole !== 'string' || !targetRole.trim() || typeof resume !== 'string' || !resume.trim()) return send(400, { error: '请填写目标岗位和简历内容。' }, corsOrigin);
  if (resume.length > MAX_RESUME_LENGTH || String(jobDescription).length > MAX_JD_LENGTH) return send(400, { error: '输入内容过长，请缩短后重试。' }, corsOrigin);
  const apiKey = String(process.env.DEEPSEEK_API_KEY || '').trim();
  const baseUrl = String(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').trim().replace(/\/+$/, '');
  const model = String(process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash').trim();
  if (!apiKey) return send(503, { error: '阿里云函数尚未配置 DEEPSEEK_API_KEY。' }, corsOrigin);
  const system = `你是一名专业、审慎的中国校招简历顾问。基于提供的信息生成中文报告。${getModeContract(mode)} 不杜撰用户没有提供的经历、数据、奖项或技能；不承诺 offer；建议必须具体、可执行。只输出合法 JSON，不要 Markdown。严格使用此 JSON schema: {"scores":{"match":0,"competitiveness":0,"clarity":0},"summary":"...","strengths":["..."],"risks":["..."],"rewrite":"...","nextActions":["..."]}`;
  const user = `目标岗位：${targetRole.trim()}\n\n岗位描述：${String(jobDescription).trim() || '未提供'}\n\n简历内容：\n${resume.trim()}`;
  try {
    const result = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, temperature: 0.35, max_tokens: 2200, response_format: { type: 'json_object' }, thinking: { type: 'disabled' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }), signal: AbortSignal.timeout(55000)
    });
    const data = await result.json().catch(() => ({}));
    if (!result.ok) return send(502, { error: data?.error?.message || `DeepSeek 请求失败（HTTP ${result.status}）。` }, corsOrigin);
    try {
      return send(200, normalise(data?.choices?.[0]?.message?.content), corsOrigin);
    } catch (error) {
      console.error('DeepSeek JSON parse failed', error?.message);
      return send(502, { error: 'DeepSeek 返回的报告格式不完整，请重新尝试。' }, corsOrigin);
    }
  } catch (error) {
    console.error('DeepSeek connection failed', error?.message);
    return send(502, { error: '阿里云函数无法连接 DeepSeek，请检查函数日志。' }, corsOrigin);
  }
};
