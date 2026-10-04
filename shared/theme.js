// Light/dark theme. Load synchronously in <head> so the page never flashes the
// wrong theme. The choice is "light", "dark" or none (follow the system); the
// View menu's theme item (themeToggle) stores an explicit choice.
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

  apply(); // before first paint
  if (media && media.addEventListener) media.addEventListener("change", () => { if (!stored()) apply(); });

  window.themeToggle = toggle;
  window.themeIsDark = () => current() === "dark";
})();
