let worker: Worker;
let nextId = 0;
const pending = new Map<
  number,
  {
    resolve: (x: unknown) => void;
    reject: (x: Error) => void;
    progress?: (s: string) => void;
  }
>();
export function call<T>(
  type: string,
  payload?: unknown,
  progress?: (s: string) => void,
): Promise<T> {
  if (!worker) {
    worker = new Worker(
      new URL("../workers/database.worker.ts", import.meta.url),
    );
    worker.onmessage = (e) => {
      if (e.data.asset && "serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then((r) =>
          r.active?.postMessage({ type: "CACHE_URLS", urls: [e.data.asset] }),
        );
        return;
      }
      const p = pending.get(e.data.id);
      if (!p) return;
      if (e.data.progress) {
        p.progress?.(e.data.progress);
        return;
      }
      pending.delete(e.data.id);
      if (e.data.error) p.reject(Error(e.data.error));
      else p.resolve(e.data.result);
    };
    worker.onerror = (e) => {
      for (const p of pending.values())
        p.reject(Error(e.message || "Storage worker failed"));
      pending.clear();
    };
  }
  return new Promise<T>((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, {
      resolve: resolve as (x: unknown) => void,
      reject,
      progress,
    });
    worker.postMessage({ id, type, payload });
  });
}
let init: ReturnType<typeof call> | undefined;
export function initialize<T>(): Promise<T> {
  init ??= call("init");
  return init as Promise<T>;
}
export function download(
  name: string,
  data: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function readFiles(
  files: { path: string; file: File }[],
  progress: (s: string) => void,
) {
  if (files.length > 15000)
    throw Error("Too many files. Select databases and sidecars separately.");
  let total = 0;
  const selected = [];
  for (const f of files) {
    if (
      !/(KoboReader\.sqlite(?:-wal|-shm|-journal)?|statistics\.sqlite3(?:-wal|-shm|-journal)?|kobalt\.sqlite(?:-wal|-shm|-journal)?|metadata\.[\w]+\.lua|\.epub|\.parsed|\.(?:jpg|jpeg|png))$/i.test(
        f.path,
      )
    )
      continue;
    const max = /\.epub$/i.test(f.path)
      ? 64_000_000
      : /\.lua$/i.test(f.path)
        ? 8_000_000
        : /\.(?:parsed|jpg|jpeg|png)$/i.test(f.path)
          ? 4_000_000
          : 128_000_000;
    if (f.file.size > max) {
      if (/\.(?:epub|parsed|jpg|jpeg|png)$/i.test(f.path)) continue;
      throw Error(`${f.file.name} exceeds its safe size limit.`);
    }
    total += f.file.size;
    if (total > 500_000_000)
      throw Error(
        "Selection exceeds 500 MB. Select just databases and sidecars, or import in batches.",
      );
    selected.push(f);
  }
  const result = [];
  for (let i = 0; i < selected.length; i++) {
    progress(`Reading selected files · ${i + 1} of ${selected.length}`);
    result.push({
      path: selected[i].path,
      bytes: new Uint8Array(await selected[i].file.arrayBuffer()),
    });
  }
  return result;
}
