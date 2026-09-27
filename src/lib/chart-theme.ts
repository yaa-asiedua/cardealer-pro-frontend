import { useTheme } from "../context/ThemeContext";

// Recharts needs literal color strings (not Tailwind classes) for its SVG
// props, so grid/axis colors can't ride the CSS-variable token system the
// rest of the app uses for dark mode — these are the dark-mode equivalents
// of the `border`/`muted` tokens (see styles/index.css's `.dark` block),
// picked by hand since chart props take a single fixed value per render.
export function useChartTheme() {
  const { theme } = useTheme();
  return theme === "dark"
    ? { gridStroke: "#334155", tickFill: "#94A3B8", tickFillStrong: "#E2E8F0" }
    : { gridStroke: "#D9E1E8", tickFill: "#6B7280", tickFillStrong: "#111827" };
}
