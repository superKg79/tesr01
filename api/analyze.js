const MAX_RESUME_LENGTH = 12000;
const MAX_JD_LENGTH = 6000;

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
  const apiKey = String(process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  const baseUrl = String(process.env.AI_BASE_URL || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
  const model = String(process.env.AI_MODEL || 'gpt-4o-mini').trim();
  let endpoint;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('unsupported protocol');
    endpoint = `${url.toString().replace(/\/$/, '')}/chat/completions`;
  } catch {
    throw new Error('AI_BASE_URL 必须是以 https:// 开头的 API 基地址。');
  }
  return { apiKey, baseUrl, endpoint, model };
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
  const { apiKey, endpoint, model } = config;
  if (!apiKey) return send(res, 503, { error: 'AI 服务尚未配置。请在 Vercel Environment Variables 中设置 AI_API_KEY。' });

  const focus = { both: '完整诊断、评分和润色', score: '以岗位匹配和竞争力评分为主，同时给出必要建议', polish: '以经历表达润色和关键词优化为主，同时给出必要评分' }[mode] || '完整诊断、评分和润色';
  const system = `你是一名专业、审慎的中国校招简历顾问。基于提供的信息生成中文报告。重点：${focus}。不杜撰用户没有提供的经历、数据、奖项或技能；不承诺 offer；建议应具体、可执行。只输出合法 JSON，不要 Markdown。JSON schema: {"scores":{"match":0,"competitiveness":0,"clarity":0},"summary":"...","strengths":["..."],"risks":["..."],"rewrite":"一段可直接替换的表达；如果信息不足，明确给出可替换模板","nextActions":["..."]}`;
  const user = `目标岗位：${targetRole.trim()}\n\n岗位描述：${String(jobDescription).trim() || '未提供'}\n\n简历内容：\n${resume.trim()}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, temperature: 0.35, max_tokens: 1800, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('AI provider error', response.status, data?.error?.message);
      return send(res, 502, { error: 'AI 服务暂时无法响应，请稍后重试。' });
    }
    return send(res, 200, normaliseReport(extractJson(data?.choices?.[0]?.message?.content)));
  } catch (error) {
    const code = error?.cause?.code || error?.code || error?.name || 'UNKNOWN';
    console.error('AI request failed', { endpoint, model, code, message: error?.message });
    return send(res, 502, {
      error: '无法连接到 AI 服务。已清理变量中的首尾空格；请确认 AI_BASE_URL 为 https://api.deepseek.com，且变量已同时勾选 Production 与 Preview。',
      diagnostic: code
    });
  }
};
