module.exports = (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: '仅支持 GET 请求。' });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ analysisUrl: String(process.env.AI_ANALYSIS_URL || '').trim() });
};
