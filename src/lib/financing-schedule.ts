import { paidSoFar } from "../types/financing";
import type { Financing } from "../types/financing";

export interface Installment {
  number: number;
  dueDate: Date;
  amount: number;
}

// A real amortization schedule derived from already-stored loan terms
// (termMonths, monthlyPayment, firstPaymentDue) — not a new stored
// concept. No per-installment row exists anywhere in the schema (only
// the payment ledger, FinancingPayment, which isn't tied to an
// installment number), so this is computed fresh each time, the same
// "derived over stored duplicate" principle used throughout this app.
export function generateInstallments(f: Financing): Installment[] {
  if (!f.firstPaymentDue) return [];
  const start = new Date(f.firstPaymentDue);
  const amount = Number(f.monthlyPayment);
  const installments: Installment[] = [];
  for (let i = 0; i < f.termMonths; i++) {
    const due = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, start.getUTCDate()));
    installments.push({ number: i + 1, dueDate: due, amount });
  }
  return installments;
}

// The next installment not yet covered by cumulative payments — approximated
// as floor(paidSoFar / monthlyPayment), same tolerance for partial-payment
// rounding as every other "derived from a payment ledger" figure in this
// app. Null means every installment is covered (the loan is effectively
// paid off, regardless of whether its status has been flipped to
// COMPLETED yet).
export function currentInstallment(f: Financing): Installment | null {
  const installments = generateInstallments(f);
  if (installments.length === 0) return null;
  const monthly = Number(f.monthlyPayment);
  const paidCount = monthly > 0 ? Math.min(installments.length, Math.floor(paidSoFar(f) / monthly)) : 0;
  if (paidCount >= installments.length) return null;
  return installments[paidCount];
}

// Every NOT-YET-COVERED installment (any loan, any month) whose due date
// falls in a given range — used for period-scoped figures (e.g.
// "installments due this month" across the whole portfolio), distinct
// from currentInstallment() which only ever looks at "the next unpaid
// one". Excludes installments already covered by payments-to-date (same
// paidCount cutoff as currentInstallment) — otherwise a loan that's paid
// ahead of schedule, or fully COMPLETED, would still project future
// calendar installments as "expected," double-booking money already
// received.
export function installmentsDueInRange(f: Financing, from: Date, to: Date): Installment[] {
  const installments = generateInstallments(f);
  const monthly = Number(f.monthlyPayment);
  const paidCount = monthly > 0 ? Math.min(installments.length, Math.floor(paidSoFar(f) / monthly)) : 0;
  return installments.slice(paidCount).filter((i) => i.dueDate >= from && i.dueDate <= to);
}

export type InstallmentStatus = "PAID" | "OVERDUE" | "DUE_SOON" | "UPCOMING";

// Deliberately more precise than the overdue=true flag used elsewhere in
// this app (Dashboard/Financing/Payments & Receipts), which only checks
// whether a loan's very first due date has passed — on a loan that's
// been paying normally, that's always true after month one, regardless
// of whether the CURRENT installment is actually late. This page is
// specifically about installment-level tracking, so it checks the
// current installment's own due date instead. The two can legitimately
// disagree on the same loan — flagged, not a bug.
export function installmentStatus(installment: Installment | null, now: Date = new Date()): InstallmentStatus {
  if (!installment) return "PAID";
  if (installment.dueDate < now) return "OVERDUE";
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (installment.dueDate <= sevenDaysOut) return "DUE_SOON";
  return "UPCOMING";
}

export function daysOverdue(dueDate: Date, now: Date = new Date()): number {
  return Math.max(1, Math.round((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000)));
}

export function daysUntil(dueDate: Date, now: Date = new Date()): number {
  return Math.max(0, Math.round((dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}

export const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus, string> = {
  PAID: "Paid",
  OVERDUE: "Overdue",
  DUE_SOON: "Due Soon",
  UPCOMING: "Upcoming",
};

export const INSTALLMENT_STATUS_STYLES: Record<InstallmentStatus, string> = {
  PAID: "bg-success/10 text-success",
  OVERDUE: "bg-danger/10 text-danger",
  DUE_SOON: "bg-warning/10 text-warning",
  UPCOMING: "bg-action/10 text-action",
};
