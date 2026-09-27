// Real client-side CSV export (no backend PDF/export service exists) —
// used by Payments & Revenue's "Generate Revenue Report" and "Export
// Transactions" quick actions, matching the "no fake affordances" pattern:
// a Quick Action button always does something real when clicked, even if
// smaller in scope than the mockup's implied "report generator".
function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
