const form = document.querySelector('#resumeForm');
const resume = document.querySelector('#resume');
const count = document.querySelector('#resumeCount');
const button = document.querySelector('#submitButton');
const empty = document.querySelector('#emptyState');
const loading = document.querySelector('#loadingState');
const report = document.querySelector('#report');
const errorState = document.querySelector('#errorState');
const errorMessage = document.querySelector('#errorMessage');
const subtitle = document.querySelector('#resultSubtitle');
const state = document.querySelector('#resultState');

resume.addEventListener('input', () => { count.textContent = resume.value.length.toLocaleString('zh-CN'); });
document.querySelector('#retryButton').addEventListener('click', () => form.requestSubmit());

const uploadStyles = document.createElement('link');
uploadStyles.rel = 'stylesheet';
uploadStyles.href = './upload.css';
document.head.appendChild(uploadStyles);

const uploadBox = document.createElement('div');
uploadBox.className = 'upload-box';
uploadBox.innerHTML = `<input id="resumeFile" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden /><div class="upload-copy"><span class="upload-icon">↑</span><div><strong>从文件导入简历</strong><span>支持 PDF / DOCX，最大 3MB；内容不会被保存</span></div><button id="uploadButton" class="upload-trigger" type="button">选择文件</button></div><span id="fileStatus" class="file-status" aria-live="polite"></span>`;
resume.parentElement.before(uploadBox);

const fileInput = uploadBox.querySelector('#resumeFile');
const uploadButton = uploadBox.querySelector('#uploadButton');
const fileStatus = uploadBox.querySelector('#fileStatus');
const showFileStatus = (message, type = '') => { fileStatus.textContent = message; fileStatus.className = `file-status ${type}`; };

uploadButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const validName = /\.(pdf|docx)$/i.test(file.name);
  if (!validName) return showFileStatus('请选择 PDF 或 DOCX 格式的简历。', 'error');
  if (file.size > 3 * 1024 * 1024) return showFileStatus('文件超过 3MB，请压缩或导出更小的版本。', 'error');
  uploadButton.disabled = true;
  uploadButton.textContent = '正在读取…';
  showFileStatus(`正在提取「${file.name}」中的文字…`);
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('读取文件失败，请重新选择。'));
      reader.readAsDataURL(file);
    });
    const response = await fetch('/api/extract-resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, mimeType: file.type, content: String(dataUrl).split(',')[1] })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || '文档解析失败。');
    resume.value = result.text;
    resume.dispatchEvent(new Event('input'));
    showFileStatus(result.truncated ? '已导入前 12,000 个字符，请检查并补充关键信息。' : `已导入「${file.name}」，你可以继续编辑。`, 'success');
  } catch (error) {
    showFileStatus(error.message || '文档解析失败，请重试。', 'error');
  } finally {
    uploadButton.disabled = false;
    uploadButton.textContent = '选择文件';
    fileInput.value = '';
  }
});

function setView(view) {
  [empty, loading, report, errorState].forEach((element) => element.classList.add('hidden'));
  view.classList.remove('hidden');
}

function listInto(id, values) {
  const element = document.querySelector(id);
  element.replaceChildren();
  (values || []).slice(0, 4).forEach((value) => {
    const item = document.createElement('li');
    item.textContent = value;
    element.appendChild(item);
  });
}

function renderReport(data) {
  document.querySelector('#matchScore').textContent = data.scores?.match ?? '--';
  document.querySelector('#resumeScore').textContent = data.scores?.competitiveness ?? '--';
  document.querySelector('#clarityScore').textContent = data.scores?.clarity ?? '--';
  document.querySelector('#summary').textContent = data.summary || '模型未返回摘要。';
  document.querySelector('#rewrite').textContent = data.rewrite || '模型未返回改写建议。';
  listInto('#strengths', data.strengths);
  listInto('#risks', data.risks);
  listInto('#actions', data.nextActions);
  subtitle.textContent = `已根据「${document.querySelector('#targetRole').value.trim()}」生成`;
  state.textContent = 'COMPLETE';
  setView(report);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const payload = {
    targetRole: document.querySelector('#targetRole').value.trim(),
    jobDescription: document.querySelector('#jobDescription').value.trim(),
    resume: resume.value.trim(),
    mode: new FormData(form).get('mode')
  };
  button.disabled = true;
  button.querySelector('span').textContent = 'AI 正在分析…';
  subtitle.textContent = '模型正在阅读岗位与简历信息';
  state.textContent = 'PROCESSING';
  setView(loading);
  try {
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || '服务暂时不可用，请稍后再试。');
    renderReport(result);
  } catch (error) {
    errorMessage.textContent = error.message || '网络连接异常，请检查后重试。';
    subtitle.textContent = '本次请求未完成';
    state.textContent = 'ERROR';
    setView(errorState);
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = '生成 AI 优化报告';
  }
});
