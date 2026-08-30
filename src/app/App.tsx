import { Routes, Route } from "react-router-dom";

function ShellPlaceholder() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-8 shadow-sm">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-action">
          Phase 0
        </div>
        <h1 className="mb-2 text-2xl font-bold text-primary">CARDEALER PRO</h1>
        <p className="text-sm text-muted">
          Frontend shell is running. The Login screen and role-based dashboards land in
          Engineering Plan Phase 2 (ENG-08 onward).
        </p>
      </div>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<ShellPlaceholder />} />
    </Routes>
  );
}
