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
