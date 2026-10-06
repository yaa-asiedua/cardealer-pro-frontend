import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Key, Plus, RotateCcw, User as UserIcon, Users } from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { EmployeeFormModal } from "../components/employees/EmployeeFormModal";
import { EmployeeStatusBadge } from "../components/employees/EmployeeStatusBadge";
import { ResetPasswordDialog } from "../components/employees/ResetPasswordDialog";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api, ApiError } from "../lib/api-client";
import { downloadCsv } from "../lib/csv";
import { DEPARTMENT_OPTIONS } from "../lib/employee-helpers";
import { ROLE_LABELS } from "../lib/nav-config";
import type { RoleCode } from "../types";
import type { Employee, EmployeeListResult, EmploymentStatus } from "../types/employee";

interface Kpis {
  total: number;
  active: number;
  onLeave: number;
  inactive: number;
}

async function fetchEmployeeCount(params: Record<string, string>): Promise<number> {
  const query = new URLSearchParams({ ...params, pageSize: "1" }).toString();
  const res = await api.get<EmployeeListResult>(`/admin/users?${query}`);
  return res.meta.total;
}

export function EmployeesPage() {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();

  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<EmploymentStatus | "">("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<EmployeeListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formModal, setFormModal] = useState<{ mode: "create" } | { mode: "edit"; id: string } | null>(null);
  const [resetTarget, setResetTarget] = useState<Employee | null>(null);

  const loadKpis = useCallback(() => {
    Promise.all([
      fetchEmployeeCount({}),
      fetchEmployeeCount({ status: "ACTIVE" }),
      fetchEmployeeCount({ status: "ON_LEAVE" }),
      fetchEmployeeCount({ status: "INACTIVE" }),
    ]).then(([total, active, onLeave, inactive]) => {
      setKpis({ total, active, onLeave, inactive });
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, departmentFilter, statusFilter]);

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter) params.set("status", statusFilter);

    api
      .get<EmployeeListResult>(`/admin/users?${params.toString()}`)
      .then((res) => {
        // department has no backend filter (free text, no enum) — filtered
        // client-side on the current page, same tradeoff as other small-
        // scale free-text fields elsewhere in this app.
        const filtered = departmentFilter ? { ...res, data: res.data.filter((e) => e.department === departmentFilter) } : res;
        setResult(filtered);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load employees"))
      .finally(() => setIsLoading(false));
  }, [page, debouncedSearch, statusFilter, departmentFilter]);

  useEffect(() => {
    loadKpis();
  }, [loadKpis]);
  useEffect(loadList, [loadList]);

  function refreshAll() {
    loadKpis();
    loadList();
  }

  function handleExport() {
    if (!result || result.data.length === 0) {
      showToast("No employees to export", "error");
      return;
    }
    const headers = ["Username", "Full Name", "Role", "Department", "Phone", "Email", "Status"];
    const rows = result.data.map((e) => [
      e.username,
      e.fullName,
      ROLE_LABELS[e.role.code as RoleCode],
      e.department ?? "",
      e.phone ?? "",
      e.email ?? "",
      e.status,
    ]);
    downloadCsv(`employees-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    showToast("Employees exported");
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Employees" value={kpis ? String(kpis.total) : "—"} icon={Users} />
        <KpiCard label="Active" value={kpis ? String(kpis.active) : "—"} icon={CheckCircle2} tone="success" />
        <KpiCard label="On Leave" value={kpis ? String(kpis.onLeave) : "—"} icon={UserIcon} tone="warning" />
        <KpiCard label="Inactive" value={kpis ? String(kpis.inactive) : "—"} icon={AlertTriangle} tone="danger" />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search by name, username, or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          />
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          >
            <option value="">All Departments</option>
            {DEPARTMENT_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as EmploymentStatus | "")}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="ON_LEAVE">On Leave</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setDepartmentFilter("");
              setStatusFilter("");
            }}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-ink hover:bg-surface"
          >
            <RotateCcw size={14} />
            Reset
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface"
          >
            <Download size={16} />
            Export
          </button>
          <button
            type="button"
            onClick={() => setFormModal({ mode: "create" })}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
          >
            <Plus size={16} />
            New Employee
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="sticky-actions w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Username</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Department</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-danger">
                    {error}
                  </td>
                </tr>
              ) : !result || result.data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    No employees match these filters.
                  </td>
                </tr>
              ) : (
                result.data.map((emp) => (
                  <tr key={emp.id} className="border-b border-border last:border-0 hover:bg-surface">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setFormModal({ mode: "edit", id: emp.id })}
                        className="flex items-center gap-2 text-left text-ink hover:underline"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-xs font-semibold text-muted">
                          {emp.profilePhotoUrl ? (
                            <img src={emp.profilePhotoUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            emp.fullName.charAt(0).toUpperCase()
                          )}
                        </span>
                        {emp.fullName}
                        {emp.id === currentUser?.id && <span className="text-xs text-muted">(you)</span>}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{emp.username}</td>
                    <td className="px-4 py-3 text-ink">{ROLE_LABELS[emp.role.code as RoleCode]}</td>
                    <td className="px-4 py-3 text-ink">{emp.department ?? "—"}</td>
                    <td className="px-4 py-3">
                      <EmployeeStatusBadge status={emp.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setFormModal({ mode: "edit", id: emp.id })}
                          className="text-xs font-medium text-action hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setResetTarget(emp)}
                          className="flex items-center gap-1 text-xs font-medium text-muted hover:underline"
                        >
                          <Key size={12} /> Reset Password
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {result && result.meta.pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
            <span className="text-muted">
              Showing {(result.meta.page - 1) * result.meta.pageSize + 1}–
              {Math.min(result.meta.page * result.meta.pageSize, result.meta.total)} of {result.meta.total} employees
            </span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40">
                Previous
              </button>
              <button
                type="button"
                disabled={page >= result.meta.pageCount}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {formModal && (
        <EmployeeFormModal
          employeeId={formModal.mode === "edit" ? formModal.id : undefined}
          onClose={() => setFormModal(null)}
          onSaved={() => {
            showToast(formModal.mode === "create" ? "Employee created" : "Employee updated");
            setFormModal(null);
            refreshAll();
          }}
        />
      )}

      {resetTarget && (
        <ResetPasswordDialog
          employeeId={resetTarget.id}
          employeeName={resetTarget.fullName}
          onClose={() => setResetTarget(null)}
          onReset={() => {
            showToast("Password reset");
            setResetTarget(null);
          }}
        />
      )}
    </div>
  );
}
