/** Inline script applied before paint to avoid theme flash (matches ThemeContext storage key). */
export default function ThemeScript() {
  const script = `
(function () {
  try {
    var key = "admeasy-theme";
    var stored = localStorage.getItem(key);
    var resolved =
      stored === "light" ? "light" :
      stored === "dark" ? "dark" :
      window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    var root = document.documentElement;
    if (resolved === "light") root.classList.add("light");
    else root.classList.remove("light");
    root.style.colorScheme = resolved;
  } catch (e) {}
})();
`;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}
