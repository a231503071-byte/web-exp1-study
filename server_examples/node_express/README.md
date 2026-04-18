# Node.js 自动收数示例

```bash
npm install
npm start
```

接口地址：
- http://localhost:3000/health
- http://localhost:3000/submit

把前端 `config.js` 中的 `webhookUrl` 改成：
```js
webhookUrl: "http://localhost:3000/submit"
```
