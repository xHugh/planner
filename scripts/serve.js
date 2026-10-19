/* 本地静态服务器（零依赖，仅用 Node 内置模块）
   用法：
     node scripts/serve.js            # http://127.0.0.1:8765/
     node scripts/serve.js 3000       # 换端口
     node scripts/serve.js --host     # 监听 0.0.0.0，供手机同 Wi-Fi 访问

   必须走 HTTP：app.js 是 ES Module，file:// 下 import 会被浏览器拦截；
   Service Worker 也只在 secure context（localhost 或 HTTPS）生效。 */
const http = require("http");
const { readFile, stat } = require("fs").promises;
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const port = Number(args.find(a => /^\d+$/.test(a))) || 8765;
const allInterfaces = args.includes("--host");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(req.url.split("?")[0]);
  } catch {
    // 非法 percent-encoding（如 GET /%）：URIError 必须拦在这里，
    // 抛出去会成为未捕获异常，整个服务进程直接退出
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("400 Bad Request");
    return;
  }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(ROOT, rel);

  // 防止路径穿越：按目录边界判定，不能用裸 startsWith——
  // 同前缀的兄弟目录（如 gym-pwa-backup/）会被裸前缀匹配放行
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { "Content-Type": "text/plain" }).end("403");
    return;
  }
  try {
    const st = await stat(file);
    if (st.isDirectory()) throw new Error("dir");
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404 Not Found");
  }
});

server.listen(port, allInterfaces ? "0.0.0.0" : "127.0.0.1", () => {
  const shown = allInterfaces ? "0.0.0.0" : "127.0.0.1";
  console.log(`\n  铁馆计划 · 本地服务已启动`);
  console.log(`  →  http://${shown}:${port}/\n`);
  if (allInterfaces) {
    for (const list of Object.values(os.networkInterfaces()).flat()) {
      if (list && list.family === "IPv4" && !list.internal) {
        console.log(`  手机访问（同一 Wi-Fi）：http://${list.address}:${port}/\n`);
      }
    }
  }
  console.log("  Ctrl+C 停止\n");
});
