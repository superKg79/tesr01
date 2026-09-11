# AI 校招简历助手

面向校招生的岗位匹配、简历诊断与表达优化工具。前端为静态页面，`/api/analyze` 是 Vercel Serverless Function，使用 OpenAI 兼容的 Chat Completions API。

## 配置

生产部署优先通过 **Vercel AI Gateway** 调用 DeepSeek V4 Flash，以获得更稳定的路由与调用日志。首次使用时，在 Vercel 项目的 **Settings → AI Gateway** 中点击启用；Vercel 会为函数自动注入安全的 OIDC 身份令牌，不需要在前端保存任何 Key。

`AI_API_KEY` 等环境变量仍可保留，作为网关不可用时的直连备用配置：

- `AI_API_KEY`：DeepSeek API Key
- `AI_BASE_URL`：`https://api.deepseek.com`（也兼容带 `/v1` 的地址；不要填完整的 `/chat/completions` 路径）
- `AI_MODEL`：`deepseek-v4-flash`

三个变量都必须同时勾选 **Production** 与 **Preview**。修改环境变量后，需要触发一次新的部署才会生效。变量只在服务端读取，不会发送到浏览器。

不要把真实 Key 放入 `.env.example`、前端代码或 Git 仓库。

部署后，访问页面填写岗位与简历内容即可调用真实模型生成报告。

## 简历文件导入

工作台支持上传 `.pdf` 和 `.docx` 简历（单个文件最大 3MB）。文件在服务端内存中提取文字后立即返回到可编辑输入框，不会保存到项目或 Git 仓库。扫描件 PDF 没有可复制文字时，请使用可检索文本版或先进行 OCR。
