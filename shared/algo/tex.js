// Pure: a small subset of LaTeX math to MathML, for the formulas of the Definitions pop-ups. No DOM access.
//   texToMathML(src) -> '<math>…</math>'
// Supported: \overset{above}{base}, letters (italic) and digits, { } groups, ^ and _, \mathrm{…}, \text{…}, \bigcup with limits, \{ \} \$, the spaces
// \, \; \quad \qquad and the symbol names of TEX_SYMBOLS. Anything else is an error: a formula must not render wrongly.
const TEX_SYMBOLS = {
  alpha: ["i", "α"], beta: ["i", "β"], gamma: ["i", "γ"], delta: ["i", "δ"], eta: ["i", "η"], varepsilon: ["i", "ε"], Sigma: ["i", "Σ"],
  in: ["o", "∈"], subseteq: ["o", "⊆"], Rightarrow: ["o", "⇒"], Longrightarrow: ["o", "⟹"], to: ["o", "→"], cup: ["o", "∪"],
  setminus: ["o", "∖"], times: ["o", "×"], mid: ["o", "|"], ne: ["o", "≠"], ast: ["o", "∗"], ldots: ["o", "…"], bigcup: ["l", "⋃"],
  emptyset: ["i", "∅"],
};
const TEX_SPACE = { ",": "0.17em", ";": "0.28em", quad: "1em", qquad: "2em" };

function texToMathML(src) {
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let pos = 0;
  const fail = (why) => { throw new Error(`tex: ${why} at ${pos} in ${JSON.stringify(src)}`); };
  const nbsp = (t) => t.replace(/^ | $/g, "\u00a0"); // mtext drops the white space at its ends
  const word = () => { // the argument of \mathrm and \text: a group, read as plain text
    if (src[pos] !== "{") fail("{ expected");
    const end = src.indexOf("}", pos);
    if (end < 0) fail("} missing");
    const t = src.slice(pos + 1, end);
    pos = end + 1;
    return t;
  };
  const command = () => {
    let name = "";
    if (/[A-Za-z]/.test(src[pos])) while (/[A-Za-z]/.test(src[pos] || "")) name += src[pos++];
    else name = src[pos++];
    if (name === "mathrm") return { ml: `<mi mathvariant="normal">${esc(word())}</mi>` };
    if (name === "text") return { ml: `<mtext>${nbsp(esc(word()))}</mtext>` };
    if (name in TEX_SPACE) return { ml: `<mspace width="${TEX_SPACE[name]}"/>` };
    // the font's gap above the base is wide: the mark is pulled down to it
    if (name === "overset") { const over = atom().ml, base = atom().ml; return { ml: `<mover>${base}<mpadded voffset="-0.2em" height="0.5em">${over}</mpadded></mover>` }; }
    if (name === "{" || name === "}") return { ml: `<mo>${name}</mo>` };
    if (name === "$") return { ml: `<mi mathvariant="normal">$</mi>` };
    const s = TEX_SYMBOLS[name];
    if (!s) fail(`unknown \\${name}`);
    return s[0] === "i" ? { ml: `<mi>${s[1]}</mi>` } : s[0] === "l" ? { ml: `<mo largeop="true">${s[1]}</mo>`, limits: true } : { ml: `<mo>${s[1]}</mo>` };
  };
  const atom = () => {
    const c = src[pos];
    if (c === undefined) fail("atom expected");
    if (c === "{") { pos++; const inner = seq("}"); pos++; return { ml: `<mrow>${inner}</mrow>` }; }
    if (c === "\\") { pos++; return command(); }
    pos++;
    if (/[A-Za-z]/.test(c)) return { ml: `<mi>${c}</mi>` };
    if (/[0-9]/.test(c)) return { ml: `<mn>${c}</mn>` };
    if (c === " ") return { ml: "" };
    return { ml: `<mo>${esc(c)}</mo>` };
  };
  function seq(close) {
    let out = "";
    while (pos < src.length && src[pos] !== close) {
      const a = atom();
      let sub = "", sup = "";
      for (; src[pos] === "^" || src[pos] === "_"; ) {
        const which = src[pos++];
        const s = atom().ml;
        if (which === "^") sup = s; else sub = s;
      }
      out += sub && sup ? `<msubsup>${a.ml}${sub}${sup}</msubsup>` : sub ? (a.limits ? `<munder>${a.ml}${sub}</munder>` : `<msub>${a.ml}${sub}</msub>`) : sup ? `<msup>${a.ml}${sup}</msup>` : a.ml;
    }
    if (close && src[pos] !== close) fail(`${close} missing`);
    return out;
  }
  const body = seq("");
  return `<math><mrow>${body}</mrow></math>`;
}
