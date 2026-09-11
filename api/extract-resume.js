const mammoth = require('mammoth');
const pdf = require('pdf-parse');

const MAX_FILE_SIZE = 3 * 1024 * 1024;
const MAX_OUTPUT_LENGTH = 12000;

function reply(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body));
}

function normaliseText(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return reply(res, 405, { error: '仅支持 POST 请求。' });
  const { fileName, mimeType, content } = req.body || {};
  if (typeof fileName !== 'string' || typeof content !== 'string' || !content) {
    return reply(res, 400, { error: '未收到有效文件。' });
  }
  const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!['pdf', 'docx'].includes(extension)) return reply(res, 400, { error: '仅支持 PDF 或 DOCX 格式。' });

  let buffer;
  try { buffer = Buffer.from(content, 'base64'); } catch { return reply(res, 400, { error: '文件编码无效。' }); }
  if (!buffer.length || buffer.length > MAX_FILE_SIZE) return reply(res, 413, { error: '文件不能为空，且不能超过 3MB。' });
  if (extension === 'pdf' && buffer.subarray(0, 4).toString() !== '%PDF') return reply(res, 400, { error: '文件内容不是有效的 PDF。' });
  if (extension === 'docx' && buffer.subarray(0, 2).toString() !== 'PK') return reply(res, 400, { error: '文件内容不是有效的 DOCX。' });

  try {
    const extracted = extension === 'pdf'
      ? (await pdf(buffer)).text
      : (await mammoth.extractRawText({ buffer })).value;
    const text = normaliseText(extracted);
    if (!text) return reply(res, 422, { error: '未从文档中提取到文字。若 PDF 为扫描件，请先使用可复制文字的版本。' });
    return reply(res, 200, { text: text.slice(0, MAX_OUTPUT_LENGTH), truncated: text.length > MAX_OUTPUT_LENGTH, fileName, mimeType: String(mimeType || '') });
  } catch (error) {
    console.error('Resume extraction failed', extension, error.message);
    return reply(res, 422, { error: '无法读取该文档。请确认文件未加密、未损坏，并重新导出为 PDF 或 DOCX。' });
  }
};
