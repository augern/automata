// The QR button of every tool's top bar: shows the tool, its loaded example and its panel set as a large
// QR code (a short address, see quickEncode in algo/share.js). Needs algo/qr.js, qr-modal.js, ui.css and
// shared.js (quickLinkUrl).
(function () {
  function open() {
    const name = document.title.split("|")[0].trim();
    const ex = typeof EXAMPLES !== "undefined" && typeof _currentExampleKey !== "undefined" && EXAMPLES[_currentExampleKey];
    QRModal.show({ title: ex && ex.label ? name + " · " + ex.label : name, url: quickLinkUrl() });
  }

  function install() {
    const bar = document.getElementById("topbar");
    if (!bar || typeof QRModal === "undefined" || typeof quickLinkUrl !== "function" || document.getElementById("btn-qr")) return;
    const btn = document.createElement("button");
    btn.id = "btn-qr";
    btn.type = "button";
    btn.className = "qr-btn";
    btn.textContent = "QR";
    btn.title = "Show a QR code for this tool, example and panel set";
    btn.addEventListener("click", open);
    bar.insertBefore(btn, document.getElementById("btn-guide") || document.getElementById("btn-view") || null);
  }
  document.addEventListener("DOMContentLoaded", install);
})();
