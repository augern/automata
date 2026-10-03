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

// Adds a "Share" button to #topbar that copies the current link.
function installShareButton() {
  const bar = document.getElementById("topbar");
  if (!bar || document.getElementById("btn-share")) return;
  const btn = document.createElement("button");
  btn.id = "btn-share";
  btn.className = "share-btn";
  btn.textContent = "Share";
  btn.title = "Copy a link to this tool with its current input";
  btn.onclick = async () => {
    let msg = "Copied!";
    if (location.hash === "" && location.search === "") msg = "Nothing to share yet";
    else {
      try {
        await navigator.clipboard.writeText(location.href);
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = location.href;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch (e2) { msg = "Copy failed"; }
        ta.remove();
      }
    }
    btn.textContent = msg;
    setTimeout(() => (btn.textContent = "Share"), 1500);
  };
  const keyNav = document.getElementById("key-nav");
  if (keyNav) bar.insertBefore(btn, keyNav);
  else bar.appendChild(btn);
}
