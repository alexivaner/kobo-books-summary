import { readdir, readFile, writeFile, cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url)),
  staticRoot = path.join(root, "apps/web/.next/static"),
  assets = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (/\.(js|css|woff2?|ttf|otf|png|svg|ico)$/.test(e.name))
      assets.push(
        "/_next/static/" +
          path.relative(staticRoot, p).replaceAll(path.sep, "/"),
      );
  }
}
await walk(staticRoot);
assets.sort();
const version = createHash("sha256")
  .update(JSON.stringify(assets))
  .digest("hex")
  .slice(0, 16);
const exportRoot = path.join(root, "apps/web/out");
await writeFile(
  path.join(exportRoot, "offline-assets.json"),
  JSON.stringify({ version, assets }),
);
const template = await readFile(
  path.join(root, "apps/web/workers/service-worker.js"),
  "utf8",
);
await writeFile(
  path.join(exportRoot, "sw.js"),
  template.replaceAll("__BUILD_HASH__", version),
);
await rm(path.join(root, "out"), { recursive: true, force: true });
await cp(exportRoot, path.join(root, "out"), { recursive: true });
console.log(`Prepared offline shell with ${assets.length} production assets.`);
