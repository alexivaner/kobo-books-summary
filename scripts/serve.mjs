import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
const root = path.resolve("out");
const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH || process.env.E2E_BASE_PATH || "";
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
};
const headers = await readFile(path.join(root, "_headers"), "utf8");
const csp = headers
  .split("\n")
  .find((l) => l.trim().startsWith("Content-Security-Policy:"))
  ?.trim()
  .slice("Content-Security-Policy:".length)
  .trim();
http
  .createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (
        basePath &&
        pathname !== basePath &&
        !pathname.startsWith(basePath + "/")
      )
        throw Error("Outside deployment path");
      const p = basePath ? pathname.slice(basePath.length) || "/" : pathname;
      let f = path.resolve(root, "." + p);
      if (!f.startsWith(root + path.sep) && f !== root)
        throw Error("Invalid path");
      if ((await stat(f)).isDirectory()) f = path.join(f, "index.html");
      const bytes = await readFile(f);
      res.writeHead(200, {
        "Content-Type": mime[path.extname(f)] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        ...(csp ? { "Content-Security-Policy": csp } : {}),
        "Cache-Control": "no-cache",
      });
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(Number(process.env.PORT || 3000), "127.0.0.1", () =>
    console.log(
      `Kobo Books Summary: http://127.0.0.1:${process.env.PORT || 3000}`,
    ),
  );
