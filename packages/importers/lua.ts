/** A bounded parser for Lua serialized values. No eval, VM, or Lua runtime. */
export function parseLua(input: string): unknown {
  if (input.length > 8_000_000) throw Error("Lua exceeds 8 MB limit");
  let i = 0,
    tokens = 0;
  const fail = (): never => {
    throw Error(`Unsupported Lua syntax at character ${i}`);
  };
  function skip() {
    for (;;) {
      while (/\s/.test(input[i] || "") && i < input.length) i++;
      if (input.slice(i, i + 2) !== "--") break;
      i += 2;
      const m = input.slice(i).match(/^\[(=*)\[/);
      if (m) {
        const end = input.indexOf("]" + m[1] + "]", i + m[0].length);
        if (end < 0) fail();
        i = end + m[1].length + 2;
      } else {
        while (i < input.length && input[i] !== "\n") i++;
      }
    }
  }
  function str(): string {
    const q = input[i++];
    let out = "";
    while (i < input.length) {
      const c = input[i++];
      if (c === q) return out;
      if (c !== "\\") {
        out += c;
        continue;
      }
      const e = input[i++];
      const escapes: Record<string, string> = {
        n: "\n",
        r: "\r",
        t: "\t",
        a: "\x07",
        b: "\b",
        f: "\f",
        v: "\v",
        "\\": "\\",
        '"': '"',
        "'": "'",
      };
      if (e in escapes) out += escapes[e];
      else if (/\d/.test(e)) {
        let n = e;
        for (let k = 0; k < 2 && /\d/.test(input[i] || ""); k++)
          n += input[i++];
        if (+n > 255) fail();
        out += String.fromCharCode(+n);
      } else if (e === "\n") out += "\n";
      else if (e === "z") {
        while (/\s/.test(input[i] || "") && i < input.length) i++;
      } else fail();
    }
    return fail();
  }
  function value(depth: number): unknown {
    if (depth > 48 || ++tokens > 300000)
      throw Error("Lua resource limit exceeded");
    skip();
    const c = input[i];
    if (c === '"' || c === "'") return str();
    const long = input.slice(i).match(/^\[(=*)\[/);
    if (long) {
      i += long[0].length;
      const end = input.indexOf("]" + long[1] + "]", i);
      if (end < 0) fail();
      const s = input.slice(i, end).replace(/^\r?\n/, "");
      i = end + long[1].length + 2;
      return s;
    }
    if (c === "{") {
      i++;
      const out: Record<string, unknown> = Object.create(null);
      let index = 1;
      skip();
      while (input[i] !== "}") {
        if (i >= input.length) fail();
        let key: string;
        skip();
        if (input[i] === "[") {
          i++;
          const k = value(depth + 1);
          if (typeof k !== "string" && typeof k !== "number") fail();
          key = String(k);
          skip();
          if (input[i++] !== "]") fail();
          skip();
          if (input[i++] !== "=") fail();
        } else {
          const m = input.slice(i).match(/^([A-Za-z_]\w*)\s*=/);
          if (m) {
            key = m[1];
            i += m[0].length;
          } else key = String(index++);
        }
        if (["__proto__", "constructor", "prototype"].includes(key))
          throw Error("Unsafe Lua key");
        out[key] = value(depth + 1);
        skip();
        if (input[i] === "," || input[i] === ";") {
          i++;
          skip();
        } else if (input[i] !== "}") fail();
      }
      i++;
      return out;
    }
    const n = input
      .slice(i)
      .match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
    if (n) {
      i += n[0].length;
      const v = Number(n[0]);
      if (!Number.isFinite(v)) fail();
      return v;
    }
    for (const [s, v] of [
      ["true", true],
      ["false", false],
      ["nil", null],
    ] as const) {
      if (
        input.slice(i, i + s.length) === s &&
        !/\w/.test(input[i + s.length] || "")
      ) {
        i += s.length;
        return v;
      }
    }
    return fail();
  }
  skip();
  if (input.slice(i, i + 6) === "return") {
    i += 6;
  }
  const result = value(0);
  skip();
  if (i !== input.length) fail();
  return result;
}
