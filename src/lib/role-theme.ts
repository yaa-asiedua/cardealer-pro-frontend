import type { RoleCode } from "../types";

interface RoleTheme {
  primary: string; // "R G B" — sidebar background, headings
  action: string; // "R G B" — buttons, links, active nav highlight
}

// Sampled directly from the five original mockups in Images/ (pixel-averaged
// sidebar background + active-nav-item color per role), then rounded to
// clean values — restores the Design Brief's original per-role palette that
// v1.1 of the Design Spec had deliberately unified. See PROGRESS.md for the
// full reasoning and the one known tradeoff (Sales' green and Mechanic's
// orange each visually resemble an existing status color used throughout
// that same role's own screens).
export const ROLE_THEMES: Record<RoleCode, RoleTheme> = {
  ADMIN: { primary: "20 33 61", action: "47 111 228" }, // navy + royal blue
  SALES_SALESPERSON: { primary: "22 52 32", action: "46 125 50" }, // dark green + success green
  RENTAL_SALESPERSON: { primary: "36 25 52", action: "124 58 237" }, // dark purple + violet
  FINANCE_MANAGER: { primary: "22 50 74", action: "14 165 233" }, // dark blue + azure
  MECHANIC: { primary: "36 32 29", action: "234 88 12" }, // dark charcoal + burnt orange
};

export function applyRoleTheme(role: RoleCode): void {
  const theme = ROLE_THEMES[role];
  const root = document.documentElement.style;
  root.setProperty("--color-primary", theme.primary);
  root.setProperty("--color-action", theme.action);
}

// Called when AppShell unmounts (logout) — without this, the inline style
// set above would outlive the session and the Login screen would show
// whichever role last logged in instead of the default navy/blue.
export function resetRoleTheme(): void {
  const root = document.documentElement.style;
  root.removeProperty("--color-primary");
  root.removeProperty("--color-action");
}
