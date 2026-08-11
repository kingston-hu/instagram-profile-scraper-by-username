# Instagram Profile Scraper(by UserName)

一个纯静态网页，用来调用 CoreClaw 的 `instagram-profile-data-scraper` worker。

## 功能

- 输入 CoreClaw API Token
- 输入一个或多个 Instagram 用户名
- 创建异步抓取任务
- 轮询任务状态
- 展示抓取摘要和完整 JSON

## 为什么不把 token 写死

因为你要求把代码上传到公开 GitHub 仓库。
如果把真实 token 写进前端代码，任何人都能直接拿到并滥用它。
所以当前实现改成：

- token 由用户在页面里手动输入
- 请求直接从浏览器发到 CoreClaw API
- 仓库里不保存任何真实密钥

## 本地打开

直接双击 `index.html` 即可，或者用任意静态服务器打开。

## CoreClaw Worker

- Worker ID: `01KPD6M5YVHWCNQCRK3W1JD9W2`
- Worker Name: `instagram-profile-data-scraper`

## 接口流程

1. `POST /api/v2/workers/{workerId}/runs`
2. `GET /api/v2/worker-runs/{runId}`
3. `GET /api/v2/worker-runs/{runId}/result`

## 注意

这是前端直连模式，因此：

- token 会暴露给当前使用页面的人自己
- 不适合做多人共享的公开生产环境
- 如果要做正式线上产品，建议改成后端代理模式
