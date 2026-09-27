const currencyFormatter = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyFormatterNoDecimals = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

// Table/receipt/detail precision — two decimal places (Design Spec v1.1 §05).
export function formatCurrency(amount: number | string): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return currencyFormatter.format(value);
}

// KPI-scale figures — no decimals (Design Spec v1.1 §05).
export function formatCurrencyCompact(amount: number | string): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return currencyFormatterNoDecimals.format(value);
}

const dateFormatter = new Intl.DateTimeFormat("en-GH", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GH", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDate(value: string | Date): string {
  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value: string | Date): string {
  return dateTimeFormatter.format(new Date(value));
}

// "UNDER_MAINTENANCE" -> "Under Maintenance"
export function formatEnumLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
