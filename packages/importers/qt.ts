/** Bounded reader for the Qt QDataStream QVariantMap subset used by Kobo Event.ExtraData.
 * Big-endian primitives; QString lengths are UTF-16 byte counts. Unsupported types
 * reject that payload rather than guessing offsets or scanning arbitrary binary data.
 */
export function readQtMap(bytes: Uint8Array): Record<string, unknown> {
  if (bytes.length > 2_000_000) throw Error("Kobo event payload exceeds limit");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0,
    items = 0;
  const take = (n: number) => {
    if (!Number.isSafeInteger(n) || n < 0 || at + n > bytes.length)
      throw Error("Truncated Kobo event payload");
    const old = at;
    at += n;
    return old;
  };
  const u32 = () => view.getUint32(take(4));
  const count = () => {
    const n = u32();
    if ((items += n) > 100_000)
      throw Error("Kobo event collection exceeds limit");
    return n;
  };
  const qstring = () => {
    const n = u32();
    if (n === 0xffffffff) return null;
    if (n % 2) throw Error("Invalid Qt string length");
    const start = take(n);
    return new TextDecoder("utf-16be", { fatal: true }).decode(
      bytes.subarray(start, start + n),
    );
  };
  const map = (depth: number): Record<string, unknown> => {
    if (depth > 8) throw Error("Kobo event nesting exceeds limit");
    const n = count(),
      out: Record<string, unknown> = Object.create(null);
    for (let i = 0; i < n; i++) {
      const key = qstring();
      if (key === null) throw Error("Invalid Qt map key");
      out[key] = variant(depth + 1);
    }
    return out;
  };
  const variant = (depth: number): unknown => {
    if (depth > 8) throw Error("Kobo event nesting exceeds limit");
    const type = u32();
    take(1); // QVariant null flag (Qt >= 4.2).
    switch (type) {
      case 0:
        if (u32() !== 0xffffffff) throw Error("Invalid null QVariant");
        return null;
      case 1:
        return !!view.getUint8(take(1));
      case 2:
        return view.getInt32(take(4));
      case 3:
        return u32();
      case 4:
      case 5: {
        const p = take(8),
          n = Number(type === 4 ? view.getBigInt64(p) : view.getBigUint64(p));
        if (!Number.isSafeInteger(n)) throw Error("Unsafe Qt integer");
        return n;
      }
      case 6: {
        const n = view.getFloat64(take(8));
        if (!Number.isFinite(n)) throw Error("Invalid Qt number");
        return n;
      }
      case 8:
        return map(depth + 1);
      case 9: {
        const n = count();
        return Array.from({ length: n }, () => variant(depth + 1));
      }
      case 10:
        return qstring();
      case 11: {
        const n = count();
        return Array.from({ length: n }, () => qstring());
      }
      case 12: {
        const n = u32();
        if (n === 0xffffffff) return new Uint8Array();
        const start = take(n);
        return bytes.subarray(start, start + n);
      }
      default:
        throw Error("Unsupported Qt variant type");
    }
  };
  const out = map(0);
  if (at !== bytes.length) throw Error("Trailing Kobo event bytes");
  return out;
}
