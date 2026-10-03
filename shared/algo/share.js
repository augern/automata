// Encoding and validation of tool state for shareable links. No DOM access.
//
// A link carries one JSON object, UTF-8 encoded and base64url-encoded, in the
// URL fragment. The data comes from the URL, so it is untrusted: decode never
// throws, and each shareValidate* function returns a normalised copy (bounded
// sizes, no prototype-polluting keys, only references to known states/symbols)
// or null when the shape is wrong.

const SHARE_MAX_ENCODED = 60000;
const SHARE_MAX_TEXT = 20000;
const SHARE_MAX_INPUT = 2000;
const SHARE_BLANK = "□";
const SHARE_UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// ── Codec (pure JS: no btoa/TextEncoder, so it also runs under Node's vm) ──

const SHARE_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function shareUtf8Bytes(str) {
  const bytes = [];
  for (const ch of str) {
    let c = ch.codePointAt(0);
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd; // lone surrogate
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return bytes;
}

function shareUtf8Decode(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    let c, extra;
    if (b < 0x80) { c = b; extra = 0; }
    else if (b >= 0xc2 && b < 0xe0) { c = b & 31; extra = 1; }
    else if (b >= 0xe0 && b < 0xf0) { c = b & 15; extra = 2; }
    else if (b >= 0xf0 && b < 0xf5) { c = b & 7; extra = 3; }
    else throw new Error("bad utf-8");
    for (let k = 0; k < extra; k++) {
      const n = bytes[i++];
      if (n === undefined || (n & 0xc0) !== 0x80) throw new Error("bad utf-8");
      c = (c << 6) | (n & 63);
    }
    if (c > 0x10ffff || (c >= 0xd800 && c <= 0xdfff)) throw new Error("bad utf-8");
    out += String.fromCodePoint(c);
  }
  return out;
}

function shareBase64urlEncode(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    out += SHARE_B64[(n >> 18) & 63] + SHARE_B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += SHARE_B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += SHARE_B64[n & 63];
  }
  return out;
}

function shareBase64urlDecode(str) {
  if (!/^[A-Za-z0-9_-]*$/.test(str) || str.length % 4 === 1) throw new Error("bad base64url");
  const bytes = [];
  for (let i = 0; i < str.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => (i + k < str.length ? SHARE_B64.indexOf(str[i + k]) : 0));
    const n = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
    bytes.push((n >> 16) & 255);
    if (i + 2 < str.length) bytes.push((n >> 8) & 255);
    if (i + 3 < str.length) bytes.push(n & 255);
  }
  return bytes;
}

function shareEncode(obj) {
  return shareBase64urlEncode(shareUtf8Bytes(JSON.stringify(obj)));
}

// Returns the decoded plain object, or null for anything malformed or oversized.
function shareDecode(str) {
  try {
    if (typeof str !== "string" || str.length === 0 || str.length > SHARE_MAX_ENCODED) return null;
    const obj = JSON.parse(shareUtf8Decode(shareBase64urlDecode(str)));
    return obj !== null && typeof obj === "object" && !Array.isArray(obj) ? obj : null;
  } catch (e) {
    return null;
  }
}

// ── Validation helpers ────────────────────────────────────────────────

const shareIsStr = (x) => typeof x === "string";
const shareText = (x, max) => (shareIsStr(x) && x.length <= max ? x : null);
const shareIsPlain = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const shareIsName = (s) => shareIsStr(s) && s.length >= 1 && s.length <= 16 && !/[\s,]/.test(s) && !SHARE_UNSAFE_KEYS.has(s);
const shareIsSym = (s) => shareIsStr(s) && s.length >= 1 && s.length <= 4 && !/\s/.test(s) && !SHARE_UNSAFE_KEYS.has(s);

function shareOwnKeys(o) {
  return shareIsPlain(o) ? Object.keys(o).filter((k) => !SHARE_UNSAFE_KEYS.has(k)) : [];
}

function shareStateList(x) {
  if (!Array.isArray(x) || x.length < 1 || x.length > 40) return null;
  if (!x.every(shareIsName) || new Set(x).size !== x.length) return null;
  return [...x];
}

function shareSymList(x, extraBanned = []) {
  if (!Array.isArray(x) || x.length > 20) return null;
  if (!x.every((s) => shareIsSym(s) && !extraBanned.includes(s)) || new Set(x).size !== x.length) return null;
  return [...x];
}

function shareIndexIn(n, i) {
  return Number.isInteger(i) && i >= 0 && i < n ? i : null;
}

// Optional simulation input string carried along with a definition.
function shareSimInput(s) {
  return s === undefined ? "" : shareText(s, SHARE_MAX_INPUT);
}

// ── Per-tool state ────────────────────────────────────────────────────

// Grammar-based tools and the regex tool: { g | re, m?, s? } -> normalised copy.
function shareValidateTextState(obj, field, modes) {
  if (!shareIsPlain(obj)) return null;
  const t = shareText(obj[field], SHARE_MAX_TEXT);
  const s = shareSimInput(obj.s);
  if (t === null || s === null) return null;
  const out = { [field]: t, s };
  if (obj.m !== undefined) {
    if (!shareIsStr(obj.m) || (modes && !modes.includes(obj.m))) return null;
    out.m = obj.m;
  }
  return out;
}

// { nfa: { states, alphabet, start, accepts, trans: {state: {sym: [state]}} }, s? }
function shareValidateNFA(obj) {
  if (!shareIsPlain(obj) || !shareIsPlain(obj.nfa)) return null;
  const d = obj.nfa;
  const states = shareStateList(d.states);
  const alphabet = shareSymList(d.alphabet, ["ε"]);
  const s = shareSimInput(obj.s);
  if (!states || !alphabet || s === null) return null;
  const start = shareIndexIn(states.length, d.start);
  if (start === null || !Array.isArray(d.accepts)) return null;
  const accepts = [...new Set(d.accepts.map((i) => shareIndexIn(states.length, i)).filter((i) => i !== null))];
  const trans = {};
  for (const st of states) {
    trans[st] = {};
    for (const sym of [...alphabet, "ε"]) {
      const raw = shareIsPlain(d.trans) && shareIsPlain(d.trans[st]) ? d.trans[st][sym] : [];
      trans[st][sym] = Array.isArray(raw) ? [...new Set(raw.filter((t) => shareIsStr(t) && states.includes(t)))] : [];
    }
  }
  return { nfa: { states, alphabet, start, accepts, trans }, s };
}

// { pda: { states, start, accepts, initStack, acceptMode, rules }, s? }
function shareValidatePDA(obj) {
  if (!shareIsPlain(obj) || !shareIsPlain(obj.pda)) return null;
  const d = obj.pda;
  const states = shareStateList(d.states);
  const s = shareSimInput(obj.s);
  if (!states || s === null) return null;
  const start = shareIndexIn(states.length, d.start);
  if (start === null || !Array.isArray(d.accepts) || !Array.isArray(d.rules) || d.rules.length > 200) return null;
  const accepts = [...new Set(d.accepts.map((i) => shareIndexIn(states.length, i)).filter((i) => i !== null))];
  const initStack = d.initStack === undefined ? "" : shareText(d.initStack, 8);
  const acceptMode = d.acceptMode === undefined ? "final-state" : d.acceptMode;
  if (initStack === null || (acceptMode !== "final-state" && acceptMode !== "empty-stack")) return null;
  const rules = [];
  for (const r of d.rules) {
    if (!shareIsPlain(r)) return null;
    const f = { from: shareText(r.from, 16), input: shareText(r.input, 8), pop: shareText(r.pop, 8), to: shareText(r.to, 16), push: shareText(r.push, 16) };
    if (Object.values(f).some((v) => v === null)) return null;
    rules.push(f);
  }
  return { pda: { states, start, accepts, initStack, acceptMode, rules }, s };
}

// { tm: { states, alphabet, start, accept, reject, trans: {state: {sym: {next, write, dir}}} }, s? }
function shareValidateTM(obj) {
  if (!shareIsPlain(obj) || !shareIsPlain(obj.tm)) return null;
  const d = obj.tm;
  const states = shareStateList(d.states);
  const alphabet = shareSymList(d.alphabet, [SHARE_BLANK, "_"]);
  const s = shareSimInput(obj.s);
  if (!states || !alphabet || s === null) return null;
  const start = shareIndexIn(states.length, d.start);
  const accept = shareIndexIn(states.length, d.accept);
  const reject = shareIndexIn(states.length, d.reject);
  if (start === null || accept === null || reject === null) return null;
  const tape = [...alphabet, SHARE_BLANK];
  const trans = {};
  for (const st of states) {
    trans[st] = {};
    const row = shareIsPlain(d.trans) && shareIsPlain(d.trans[st]) ? d.trans[st] : {};
    for (const sym of shareOwnKeys(row)) {
      const c = row[sym];
      if (!tape.includes(sym) || !shareIsPlain(c)) continue;
      if (!states.includes(c.next) || !tape.includes(c.write) || (c.dir !== "L" && c.dir !== "R")) continue;
      trans[st][sym] = { next: c.next, write: c.write, dir: c.dir };
    }
  }
  return { tm: { states, alphabet, start, accept, reject, trans }, s };
}
