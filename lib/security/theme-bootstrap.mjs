// Kept byte-for-byte identical between rendered HTML and the CSP hash.
export const THEME_BOOTSTRAP = `try {
  var theme = localStorage.getItem("marteo-theme");
  if (theme === "light" || theme === "dark") {
    document.documentElement.setAttribute("data-theme", theme);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
} catch {}`;
