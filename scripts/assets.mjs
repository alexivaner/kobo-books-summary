import { mkdir, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
await mkdir("apps/web/public/vendor", { recursive: true });
await copyFile(
  require.resolve("sql.js/dist/sql-wasm.wasm"),
  "apps/web/public/vendor/sql-wasm.wasm",
);
