const MAX_RESUME_LENGTH = 12000;
const MAX_JD_LENGTH = 6000;
const https = require('https');

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body));
}

function extractJson(content) {
  const text = Array.isArray(content) ? content.map((part) => part.text || '').join('') : String(content || '');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('模型没有返回可解析的结构化结果。');
  return JSON.parse(match[0]);
}

function clampScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}

function getProviderConfig() {
  const selectedProvider = String(process.env.AI_PROVIDER || '').trim().toLowerCase();
  const directApiKey = String(process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  const gatewayApiKey = String(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || '').trim();
  const baseUrl = String(process.env.AI_BASE_URL || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
  const model = String(process.env.AI_MODEL || 'gpt-4o-mini').trim();
  if (gatewayApiKey && selectedProvider !== 'aliyun') {
    const gatewayModel = model.includes('/') ? model : `deepseek/${model}`;
    return {
      apiKey: gatewayApiKey,
      endpoint: 'https://ai-gateway.vercel.sh/v1/chat/completions',
      model: gatewayModel,
      provider: 'vercel-ai-gateway'
    };
  }
  let endpoint;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('unsupported protocol');
    endpoint = `${url.toString().replace(/\/$/, '')}/chat/completions`;
  } catch {
    throw new Error('AI_BASE_URL 必须是以 https:// 开头的 API 基地址。');
  }
  return { apiKey: directApiKey, endpoint, model, provider: selectedProvider || 'direct' };
}

function postJsonWithHttps(endpoint, headers, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const body = JSON.stringify(payload);
    const request = https.request(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      timeout: 25000
    }, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => {
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
        resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode || 502, data });
      });
    });
    request.on('timeout', () => request.destroy(new Error('AI provider connection timed out')));
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

function normaliseReport(report) {
  return {
    scores: {
      match: clampScore(report?.scores?.match),
      competitiveness: clampScore(report?.scores?.competitiveness),
      clarity: clampScore(report?.scores?.clarity)
    },
    summary: String(report?.summary || '').slice(0, 800),
    strengths: Array.isArray(report?.strengths) ? report.strengths.map(String).slice(0, 4) : [],
    risks: Array.isArray(report?.risks) ? report.risks.map(String).slice(0, 4) : [],
    rewrite: String(report?.rewrite || '').slice(0, 1800),
    nextActions: Array.isArray(report?.nextActions) ? report.nextActions.map(String).slice(0, 4) : []
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

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: '仅支持 POST 请求。' });
  const { targetRole, jobDescription = '', resume, mode = 'both' } = req.body || {};
  if (typeof targetRole !== 'string' || !targetRole.trim() || typeof resume !== 'string' || !resume.trim()) {
    return send(res, 400, { error: '请填写目标岗位和简历内容。' });
  }
  if (resume.length > MAX_RESUME_LENGTH || String(jobDescription).length > MAX_JD_LENGTH) {
    return send(res, 400, { error: '输入内容过长，请缩短后重试。' });
  }

  let config;
  try {
    config = getProviderConfig();
  } catch (error) {
    return send(res, 503, { error: error.message });
  }
  const { apiKey, endpoint, model, provider: providerName } = config;
  if (!apiKey) return send(res, 503, { error: 'AI 服务尚未配置。请在 Vercel Environment Variables 中设置 AI_API_KEY。' });

  const system = `你是一名专业、审慎的中国校招简历顾问。基于提供的信息生成中文报告。${getModeContract(mode)} 不杜撰用户没有提供的经历、数据、奖项或技能；不承诺 offer；建议必须具体、可执行。只输出合法 JSON，不要 Markdown。严格使用此 JSON schema: {"scores":{"match":0,"competitiveness":0,"clarity":0},"summary":"...","strengths":["..."],"risks":["..."],"rewrite":"...","nextActions":["..."]}`;
  const user = `目标岗位：${targetRole.trim()}\n\n岗位描述：${String(jobDescription).trim() || '未提供'}\n\n简历内容：\n${resume.trim()}`;
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  };
  const payload = { model, temperature: 0.35, max_tokens: 1800, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };

  try {
    let provider;
    try {
      const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(25000) });
      provider = { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
    } catch (fetchError) {
      console.error('Fetch transport failed; retrying with Node https', fetchError?.cause?.code || fetchError?.message);
      provider = await postJsonWithHttps(endpoint, headers, payload);
    }
    if (!provider.ok) {
      const providerMessage = String(provider.data?.error?.message || provider.data?.message || '').slice(0, 240);
      console.error('AI provider error', provider.status, providerMessage);
      if (providerName === 'vercel-ai-gateway' && (provider.status === 401 || provider.status === 403)) {
        return send(res, 503, { error: 'Vercel AI Gateway 尚未启用。请在项目 Settings → AI Gateway 中启用后重试。', diagnostic: `GATEWAY_${provider.status}` });
      }
      return send(res, 502, { error: providerMessage ? `AI 服务返回错误：${providerMessage}` : 'AI 服务暂时无法响应，请稍后重试。', diagnostic: `HTTP_${provider.status}` });
    }
    return send(res, 200, normaliseReport(extractJson(provider.data?.choices?.[0]?.message?.content)));
  } catch (error) {
    const code = error?.cause?.code || error?.code || error?.name || 'UNKNOWN';
    console.error('AI request failed', { endpoint, model, provider: providerName, code, message: error?.message });
    return send(res, 502, {
      error: '无法连接到 AI 服务。已清理变量中的首尾空格；请确认 AI_BASE_URL 为 https://api.deepseek.com，且变量已同时勾选 Production 与 Preview。',
      diagnostic: code
    });
  }
};
