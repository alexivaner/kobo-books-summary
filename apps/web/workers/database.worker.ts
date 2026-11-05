/// <reference lib="webworker" />
import initSqlJs from "sql.js";
import { appPath } from "../lib/paths";
import { Store } from "../../../packages/storage";
import {
  discover,
  attachCovers,
  type InputFile,
} from "../../../packages/importers";
import type {
  Knowledge,
  Preview,
  Reflection,
  Enrichment,
} from "../../../packages/core";
postMessage({ asset: self.location.href });
let store: Store;
let storage = "IndexedDB";
let opfs: FileSystemDirectoryHandle | undefined;
let idb: IDBDatabase;
let releaseLock: (() => void) | undefined;
async function openIdb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("kobo-books-summary", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("snapshots");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbRead() {
  return new Promise<Uint8Array | undefined>((resolve, reject) => {
    const r = idb
      .transaction("snapshots")
      .objectStore("snapshots")
      .get("database");
    r.onsuccess = () =>
      resolve(r.result ? new Uint8Array(r.result) : undefined);
    r.onerror = () => reject(r.error);
  });
}
async function save(bytes: Uint8Array) {
  if (opfs) {
    const h = await opfs.getFileHandle("library.sqlite", { create: true });
    const writer = await h.createWritable();
    try {
      await writer.write(bytes as Uint8Array<ArrayBuffer>);
      await writer.close();
    } catch (e) {
      await writer.abort();
      throw e;
    }
  } else
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction("snapshots", "readwrite");
      tx.objectStore("snapshots").put(bytes, "database");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
}
async function initialize() {
  if (navigator.locks) {
    await new Promise<void>((resolve, reject) => {
      navigator.locks
        .request("kobo-library-writer", { ifAvailable: true }, async (lock) => {
          if (!lock) {
            reject(
              Error(
                "Your library is open in another tab. Close that tab and reload.",
              ),
            );
            return;
          }
          resolve();
          await new Promise<void>((r) => {
            releaseLock = r;
          });
        })
        .catch(reject);
    });
  }
  idb = await openIdb();
  let bytes: Uint8Array | undefined;
  try {
    opfs = await navigator.storage.getDirectory();
    storage = "OPFS · SQLite WASM";
    try {
      const f = await (await opfs.getFileHandle("library.sqlite")).getFile();
      bytes = new Uint8Array(await f.arrayBuffer());
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "NotFoundError")) throw e;
    }
  } catch (e) {
    if (opfs) throw e;
    storage = "IndexedDB · SQLite WASM";
    bytes = await idbRead();
  }
  if (opfs && !bytes) bytes = await idbRead();
  const SQL = await initSqlJs({
    locateFile: () => appPath("/vendor/sql-wasm.wasm"),
  });
  store = new Store(SQL, bytes);
  if (!bytes) await save(store.bytes());
  return store.library(storage);
}
async function request(m: { type: string; payload: unknown; id: number }) {
  if (m.type === "init") return initialize();
  if (!store) throw Error("Database is not ready. Reload the app.");
  if (m.type === "preview") {
    const p = m.payload as { files: InputFile[]; deviceId: string };
    return discover(store.SQL, p.files, p.deviceId, (text) =>
      postMessage({ progress: text, id: m.id }),
    );
  }
  if (m.type === "covers") {
    const p = m.payload as { preview: Preview; files: InputFile[] };
    return attachCovers(p.preview, p.files);
  }
  if (m.type === "backup") return store.backup();
  if (m.type === "read") return store.library(storage);
  const before = store.bytes();
  try {
    if (m.type === "commit") store.commit(m.payload as Preview);
    else if (m.type === "restore") store.restore(m.payload);
    else if (m.type === "knowledge") store.knowledge(m.payload as Knowledge);
    else if (m.type === "reflection") store.reflect(m.payload as Reflection);
    else if (m.type === "enrich")
      store.enrich(
        m.payload as { bookId: string; record: Enrichment; cover?: string }[],
      );
    else if (m.type === "group")
      store.group(m.payload as { ids: string[]; split?: boolean });
    else if (m.type === "cover")
      store.cover(
        m.payload as { bookId: string; cover: string; pageUrl: string },
      );
    else if (m.type === "clear") store.clear();
    else throw Error("Unknown operation");
    await save(store.bytes());
    return store.library(storage);
  } catch (e) {
    store.db.close();
    store = new Store(store.SQL, before);
    throw e;
  }
}
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent) => {
  const m = event.data;
  queue = queue.then(async () => {
    try {
      postMessage({ id: m.id, result: await request(m) });
    } catch (e) {
      postMessage({
        id: m.id,
        error: e instanceof Error ? e.message : "Operation failed",
      });
    }
  });
};
self.onclose = () => releaseLock?.();
