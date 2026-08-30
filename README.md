# CARDEALER PRO — Frontend

React + TypeScript + Vite, styled with Tailwind CSS using the tokens locked in
`04_Design_Brief.docx` and the Design Spec Reconciliation (v1.1): one shared
Navy/Blue theme across all five roles, role identity carried by the panel
label rather than a per-role color scheme.

## Setup

```bash
npm install
cp .env.example .env    # points VITE_API_URL at the backend
npm run dev              # http://localhost:5173
```

Requires the backend running on `http://localhost:4000` (see
`cardealer-pro-backend/README.md`) for anything beyond the placeholder shell.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check and production build |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | ESLint |

## Structure

```
src/
  app/          App shell, routing, role-based layout (Phase 2+)
  components/    Shared UI components (KPI Card, Status Badge, Data Table, ...)
  lib/            API client, formatting helpers (currency, dates)
  styles/         Tailwind entry point
```

## Design tokens

Colors and type scale are wired into `tailwind.config.js` directly from the
Design Brief — use `bg-primary`, `text-action`, `bg-success`, `bg-warning`,
`bg-danger`, `bg-surface`, `border-border`, `text-ink`, `text-muted` rather
than raw hex values, so a future palette change is a one-file edit.

Currency formatting: always GHS via `Intl.NumberFormat('en-GH', { style:
'currency', currency: 'GHS' })` — see `lib/` once the formatting helper lands.
