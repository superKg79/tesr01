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
    body: JSON.stringify(data)
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

exports.handler = async (event) => {
  const request = JSON.parse(Buffer.isBuffer(event) ? event.toString('utf8') : event);
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
  const focus = { both: '完整诊断、评分和润色', score: '以岗位匹配和竞争力评分为主，同时给出必要建议', polish: '以经历表达润色和关键词优化为主，同时给出必要评分' }[mode] || '完整诊断、评分和润色';
  const system = `你是一名专业、审慎的中国校招简历顾问。基于提供的信息生成中文报告。重点：${focus}。不杜撰用户没有提供的经历、数据、奖项或技能；不承诺 offer；建议应具体、可执行。只输出合法 JSON，不要 Markdown。JSON schema: {"scores":{"match":0,"competitiveness":0,"clarity":0},"summary":"...","strengths":["..."],"risks":["..."],"rewrite":"一段可直接替换的表达；如果信息不足，明确给出可替换模板","nextActions":["..."]}`;
  const user = `目标岗位：${targetRole.trim()}\n\n岗位描述：${String(jobDescription).trim() || '未提供'}\n\n简历内容：\n${resume.trim()}`;
  try {
    const result = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, temperature: 0.35, max_tokens: 1800, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }), signal: AbortSignal.timeout(55000)
    });
    const data = await result.json().catch(() => ({}));
    if (!result.ok) return send(502, { error: data?.error?.message || `DeepSeek 请求失败（HTTP ${result.status}）。` }, corsOrigin);
    return send(200, normalise(data?.choices?.[0]?.message?.content), corsOrigin);
  } catch (error) {
    console.error('DeepSeek connection failed', error?.message);
    return send(502, { error: '阿里云函数无法连接 DeepSeek，请检查函数日志。' }, corsOrigin);
  }
};
