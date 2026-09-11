# AI 校招简历助手

面向校招生的岗位匹配、简历诊断与表达优化工具。前端为静态页面，`/api/analyze` 是 Vercel Serverless Function，使用 OpenAI 兼容的 Chat Completions API。

如需继续使用 DeepSeek 但绕开 Vercel 到 DeepSeek 的连接问题，可将 `aliyun-function/index.js` 部署到阿里云函数计算，再把 HTTP 触发器地址设置为 Vercel 环境变量 `AI_ANALYSIS_URL`。详细步骤见 [aliyun-function/README.md](aliyun-function/README.md)。

## 配置

默认可通过 **Vercel AI Gateway** 调用 DeepSeek V4 Flash。若不想为 AI Gateway 绑定支付方式，可以改用阿里云百炼直连：在 Vercel 的环境变量中设置 `AI_PROVIDER=aliyun`，后端会绕过 AI Gateway，直接调用通义千问。

阿里云百炼配置如下（均选择 Production 与 Preview）：

- `AI_PROVIDER`：`aliyun`
- `AI_API_KEY`：阿里云百炼 API Key
- `AI_BASE_URL`：`https://dashscope.aliyuncs.com/compatible-mode/v1`，或百炼控制台显示的业务空间专属 API Host
- `AI_MODEL`：`qwen-plus`

三个变量都必须同时勾选 **Production** 与 **Preview**。修改环境变量后，需要触发一次新的部署才会生效。变量只在服务端读取，不会发送到浏览器。

不要把真实 Key 放入 `.env.example`、前端代码或 Git 仓库。

部署后，访问页面填写岗位与简历内容即可调用真实模型生成报告。

## 简历文件导入

工作台支持上传 `.pdf` 和 `.docx` 简历（单个文件最大 3MB）。文件在服务端内存中提取文字后立即返回到可编辑输入框，不会保存到项目或 Git 仓库。扫描件 PDF 没有可复制文字时，请使用可检索文本版或先进行 OCR。
