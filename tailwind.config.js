/** @type {import('tailwindcss').Config} */
// Colors match 04_Design_Brief.docx §2 and the reconciled Design Spec v1.1
// (single shared theme across all five roles — no per-role color scheme).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#17324D", // Primary Navy — header, sidebar, headings
        action: "#2F6690", // Action Blue — primary buttons, links, active nav
        success: "#2E7D32", // Completed, paid, approved, available
        warning: "#E67E22", // Pending, upcoming, attention
        danger: "#C0392B", // Rejected, overdue, destructive actions
        surface: "#F8FAFC", // Page backgrounds and secondary panels
        border: "#D9E1E8", // Cards, tables, form controls
        ink: "#1F2937", // Primary text
        muted: "#6B7280", // Secondary text and metadata
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
