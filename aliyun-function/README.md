# DeepSeek 阿里云函数计算代理

创建 Node.js 20 函数，处理程序填写 `index.handler`。控制台默认文件为 `index.mjs`，可直接将本目录的 `index.js` 全文复制进去。创建 HTTP 触发器时允许 `POST, OPTIONS`，认证方式选“无需认证”。

函数环境变量：

- `DEEPSEEK_API_KEY`：你的 DeepSeek API Key
- `DEEPSEEK_BASE_URL`：`https://api.deepseek.com`
- `DEEPSEEK_MODEL`：`deepseek-v4-flash`
- `ALLOWED_ORIGIN`：`https://ai-campus-resume-assistant-super-kg.vercel.app`

部署后复制 HTTP 触发器的 HTTPS 地址，在 Vercel 设置 `AI_ANALYSIS_URL` 为该地址（Production 和 Preview），然后重新部署 Vercel。

DeepSeek Key 只能保存在阿里云函数环境变量中。公开产品还应增加登录和限流，避免 API 被滥用。
