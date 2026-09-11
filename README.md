# AI 校招简历助手

面向校招生的岗位匹配、简历诊断与表达优化工具。前端为静态页面，`/api/analyze` 是 Vercel Serverless Function，使用 OpenAI 兼容的 Chat Completions API。

## 配置

在 Vercel 项目的 **Settings → Environment Variables** 中添加：

- `AI_API_KEY`：模型服务商 API Key
- `AI_BASE_URL`：API 基地址，默认 `https://api.openai.com/v1`
- `AI_MODEL`：模型名称，默认 `gpt-4o-mini`

不要把真实 Key 放入 `.env.example`、前端代码或 Git 仓库。

部署后，访问页面填写岗位与简历内容即可调用真实模型生成报告。

## 简历文件导入

工作台支持上传 `.pdf` 和 `.docx` 简历（单个文件最大 3MB）。文件在服务端内存中提取文字后立即返回到可编辑输入框，不会保存到项目或 Git 仓库。扫描件 PDF 没有可复制文字时，请使用可检索文本版或先进行 OCR。
