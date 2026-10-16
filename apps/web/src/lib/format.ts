import { formatMoney, type Currency, type Money } from "@workpay/shared";

export function formatMinorMoney(m: { amountMinor: number; currency: string }) {
  return formatMoney({ amountMinor: m.amountMinor, currency: m.currency as Currency });
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export type { Money };
