// Shareable links: tool state lives in the URL fragment as #s=<encoded JSON>
// (encoding and validation are in algo/share.js, which must be loaded first).
// The fragment is never sent to a server and replaceState adds no history entries.
// Old LR-tool links used ?g=<base64 grammar>; readShareState still understands them.

const SHARE_MAX_LINK = 8000; // longer states are not written (links that long break in chats and mail)

function readShareState() {
  const m = /^#s=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (m) return shareDecode(m[1]);
  try {
    const legacy = new URLSearchParams(location.search).get("g");
    if (legacy) {
      const bin = atob(legacy);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return { g: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
    }
  } catch (e) {
    /* malformed legacy link: ignore */
  }
  return null;
}

// Returns true when the state was written to the address bar.
function writeShareState(obj) {
  try {
    const enc = shareEncode(obj);
    const ok = enc.length <= SHARE_MAX_LINK;
    history.replaceState(null, "", location.pathname + (ok ? "#s=" + enc : ""));
    return ok;
  } catch (e) {
    return false;
  }
}

// save() writes getState() to the URL after `delay` ms of quiet.
function createShareSaver(getState, delay = 300) {
  let timer = null;
  return function save() {
    clearTimeout(timer);
    timer = setTimeout(() => writeShareState(getState()), delay);
  };
}

// Copy the current address (which carries the tool's state) to the clipboard.
// Resolves false when there is no state in the URL yet.
async function copyShareLink() {
  if (location.hash === "" && location.search === "") return false;
  try {
    await navigator.clipboard.writeText(location.href);
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = location.href;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e2) { ta.remove(); return false; }
    ta.remove();
  }
  return true;
}
