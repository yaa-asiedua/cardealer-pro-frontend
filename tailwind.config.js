/** @type {import('tailwindcss').Config} */
// Design Spec v1.2 supersedes v1.1's "single shared theme" decision — each
// role now carries its own brand pair (sidebar + accent), matching the five
// original mockups again (see lib/role-theme.ts for the exact per-role
// values). `primary`/`action` are CSS-variable-driven so every existing
// `bg-action`/`text-primary`/etc. class across the app repaints per role
// without touching each call site — the variables themselves are set once,
// in AppShell, from the logged-in user's role.
// `success`/`warning`/`danger` stay fixed hex, deliberately NOT themeable —
// they're status semantics (Completed/Pending/Overdue), not brand identity,
// and must mean the same thing in every portal (including dark mode — mid-
// saturation status colors read fine on both light and dark surfaces).
// `surface`/`border`/`ink`/`muted`/`card` are CSS-variable-driven the same
// way primary/action are, but flipped by a plain `.dark` class on <html>
// (see lib/theme.ts) rather than by role — see styles/index.css for both
// value sets. `card` is a new token (2026-09-13, dark mode) standing in for
// what was literal `bg-white` everywhere — every raw "card/modal/dropdown
// background" usage across the app was converted to it so dark mode doesn't
// leave floating white panels; deliberately NOT used for the handful of
// `bg-white/10` sidebar-tint or `bg-white/90` photo-overlay-button usages,
// which are correct as literal white in both themes (they sit on an
// already-dark sidebar, or float over an arbitrary photo, not the page).
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "rgb(var(--color-primary) / <alpha-value>)", // sidebar, headings — role-themed
        action: "rgb(var(--color-action) / <alpha-value>)", // buttons, links, active nav — role-themed
        success: "#2E7D32", // Completed, paid, approved, available
        warning: "#E67E22", // Pending, upcoming, attention
        danger: "#C0392B", // Rejected, overdue, destructive actions
        surface: "rgb(var(--color-surface) / <alpha-value>)", // Page backgrounds and secondary panels
        border: "rgb(var(--color-border) / <alpha-value>)", // Cards, tables, form controls
        ink: "rgb(var(--color-ink) / <alpha-value>)", // Primary text
        muted: "rgb(var(--color-muted) / <alpha-value>)", // Secondary text and metadata
        card: "rgb(var(--color-card) / <alpha-value>)", // Card/modal/dropdown backgrounds (was literal white)
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
