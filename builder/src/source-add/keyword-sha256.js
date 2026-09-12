// SHA-256 fallback for local HTTP LAN previews, where SubtleCrypto is unavailable.
// Production HTTPS uses the browser implementation. Both run off the UI thread.
export function sha256Bytes(buffer) {
 const bytes = new Uint8Array(buffer), words = new Uint32Array(64);
 const constants = [], initial = [];
 for (let candidate = 2; constants.length < 64; candidate++) {
  let prime = true;
  for (let divisor = 2; divisor * divisor <= candidate; divisor++) if (candidate % divisor === 0) { prime = false; break; }
  if (!prime) continue;
  if (initial.length < 8) initial.push((Math.sqrt(candidate) % 1 * 4294967296) >>> 0);
  constants.push((Math.cbrt(candidate) % 1 * 4294967296) >>> 0);
 }
 const length = Math.ceil((bytes.length + 9) / 64) * 64, padded = new Uint8Array(length);
 padded.set(bytes); padded[bytes.length] = 128;
 const view = new DataView(padded.buffer);
 view.setUint32(length - 8, Math.floor(bytes.length * 8 / 4294967296));
 view.setUint32(length - 4, bytes.length * 8 >>> 0);
 const rotate = (value, n) => (value >>> n) | (value << (32 - n));
 for (let offset = 0; offset < length; offset += 64) {
  for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
  for (let i = 16; i < 64; i++) {
   const a = words[i - 15], b = words[i - 2];
   words[i] = (words[i - 16] + (rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3)) + words[i - 7] + (rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10))) >>> 0;
  }
  let [a, b, c, d, e, f, g, h] = initial;
  for (let i = 0; i < 64; i++) {
   const t1 = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + constants[i] + words[i]) >>> 0;
   const t2 = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
   h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
  }
  [a, b, c, d, e, f, g, h].forEach((v, i) => { initial[i] = (initial[i] + v) >>> 0; });
 }
 return initial.map((v) => v.toString(16).padStart(8, "0")).join("");
}
export async function digestKeywordBytes(bytes) {
 if (!globalThis.crypto?.subtle) return sha256Bytes(bytes);
 return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((v) => v.toString(16).padStart(2, "0")).join("");
}
