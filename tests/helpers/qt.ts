/** Synthetic Qt data-stream encoder for tests; never contains a device payload. */
export function qtMap(values: Record<string, unknown>): Uint8Array {
  const u32 = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
  };
  const str = (s: string) => {
    const b = Buffer.from(s, "utf16le");
    b.swap16();
    return Buffer.concat([u32(b.length), b]);
  };
  const map = (v: Record<string, unknown>): Buffer =>
    Buffer.concat([
      u32(Object.keys(v).length),
      ...Object.entries(v).flatMap(([k, v]) => [str(k), variant(v)]),
    ]);
  const variant = (v: unknown): Buffer => {
    if (v === null)
      return Buffer.concat([u32(0), Buffer.from([1]), u32(0xffffffff)]);
    let type: number, body: Buffer;
    if (typeof v === "number") {
      type = 4;
      body = Buffer.alloc(8);
      body.writeBigInt64BE(BigInt(v));
    } else if (typeof v === "string") {
      type = 10;
      body = str(v);
    } else if (typeof v === "boolean") {
      type = 1;
      body = Buffer.from([+v]);
    } else if (v instanceof Uint8Array) {
      type = 12;
      body = Buffer.concat([u32(v.length), Buffer.from(v)]);
    } else if (Array.isArray(v)) {
      type = 9;
      body = Buffer.concat([u32(v.length), ...v.map(variant)]);
    } else if (v && typeof v === "object") {
      type = 8;
      body = map(v as Record<string, unknown>);
    } else throw Error("Unsupported synthetic Qt value");
    return Buffer.concat([u32(type), Buffer.from([0]), body]);
  };
  return map(values);
}
