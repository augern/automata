// Light/dark theme. Load synchronously in <head> so the page never flashes the
// wrong theme. The choice is "light", "dark" or none (follow the system); a
// click on the top-bar button stores an explicit choice.
//
// Tokens for the dark theme live in shared.css under :root[data-theme="dark"].
(function () {
  const KEY = "parser-tools-theme";
  const root = document.documentElement;
  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function stored() {
    try {
      const v = localStorage.getItem(KEY);
      return v === "light" || v === "dark" ? v : null;
    } catch (e) {
      return null;
    }
  }

  function current() {
    return stored() || (media && media.matches ? "dark" : "light");
  }

  function apply() {
    root.setAttribute("data-theme", current());
    const btn = document.getElementById("btn-theme");
    if (btn) {
      const dark = current() === "dark";
      btn.textContent = dark ? "Light" : "Dark";
      btn.title = dark ? "Switch to the light theme" : "Switch to the dark theme";
    }
  }

  function toggle() {
    const next = current() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch (e) {
      /* private mode: the choice just lasts until reload */
    }
    root.setAttribute("data-theme", next);
    apply();
  }

  function installButton() {
    const bar = document.getElementById("topbar");
    if (!bar || document.getElementById("btn-theme")) return;
    const btn = document.createElement("button");
    btn.id = "btn-theme";
    btn.className = "theme-btn";
    btn.onclick = toggle;
    bar.appendChild(btn);
    apply();
  }

  apply(); // before first paint
  if (media && media.addEventListener) media.addEventListener("change", () => { if (!stored()) apply(); });
  document.addEventListener("DOMContentLoaded", installButton);

  window.themeToggle = toggle;
})();
