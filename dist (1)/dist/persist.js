"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const DIR = path.join(process.env.HOME || __dirname, "pagecrew-data");

function ser(v) {
  return JSON.stringify(v, function (k, x) {
    const raw = this[k];
    if (raw instanceof Map) return { __map: [...raw] };
    if (raw instanceof Date) return { __date: raw.toISOString() };
    return x;
  });
}
function de(s) {
  return JSON.parse(s, (k, x) => {
    if (x && typeof x === "object" && Array.isArray(x.__map)) return new Map(x.__map);
    if (x && typeof x === "object" && typeof x.__date === "string") return new Date(x.__date);
    return x;
  });
}
module.exports = function persist(name, getState, loadState) {
  setImmediate(() => {
    const secret = process.env.ENCRYPTION_KEY;
    if (!secret) { console.log(`[persist:${name}] ENCRYPTION_KEY missing, persistence off`); return; }
    const key = crypto.createHash("sha256").update(secret).digest();
    const file = path.join(DIR, `${name}.enc`);
    fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });

    try {
      if (fs.existsSync(file)) {
        const buf = fs.readFileSync(file);
        const d = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
        d.setAuthTag(buf.subarray(12, 28));
        const plain = Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
        loadState(de(plain));
        console.log(`[persist:${name}] loaded`);
      }
    } catch (e) { console.log(`[persist:${name}] load failed: ${e.message}`); }

    let last = "";
    const save = () => {
      try {
        const s = ser(getState());
        if (s === last) return;
        const iv = crypto.randomBytes(12);
        const c = crypto.createCipheriv("aes-256-gcm", key, iv);
        const enc = Buffer.concat([c.update(s, "utf8"), c.final()]);
        const out = Buffer.concat([iv, c.getAuthTag(), enc]);
        fs.writeFileSync(file + ".tmp", out, { mode: 0o600 });
        fs.renameSync(file + ".tmp", file);
        last = s;
      } catch (e) { console.log(`[persist:${name}] save failed: ${e.message}`); }
    };
    setInterval(save, 5000).unref();
    process.on("SIGTERM", () => { save(); process.exit(0); });
    process.on("exit", save);
  });
};
