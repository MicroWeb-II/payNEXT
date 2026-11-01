const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.resolve(__dirname, "../../../client/public");
const apiPort = Number(process.env.API_PORT || 3000);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    const headers = { ...req.headers, host: `127.0.0.1:${apiPort}` };
    delete headers.origin;
    const proxy = http.request(
      { hostname: "127.0.0.1", port: apiPort, path: req.url, method: req.method, headers },
      (apiResponse) => {
        res.writeHead(apiResponse.statusCode, apiResponse.headers);
        apiResponse.pipe(res);
      },
    );
    proxy.on("error", () => {
      res.writeHead(502);
      res.end("API unavailable");
    });
    req.pipe(proxy);
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const filePath = path.resolve(root, `.${pathname}`);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    res.writeHead(403).end();
    return;
  }
  const target = filePath === root ? path.join(root, "index.html") : filePath;
  fs.stat(target, (error, stats) => {
    if (error || !stats.isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader("Content-Type", mimeTypes[path.extname(target)] || "application/octet-stream");
    fs.createReadStream(target).pipe(res);
  });
}).listen(4173, "127.0.0.1");