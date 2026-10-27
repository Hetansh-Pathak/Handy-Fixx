export type Rupees = number;

/** Round to 2 decimals (paise), safe for values like 1.005. */
export const roundMoney = (n: number): Rupees => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Formats rupees with Indian digit grouping (₹12,34,567). Implemented by hand so it
 * behaves the same on Hermes/Android as on the web (no reliance on Intl locale data).
 */
export function formatInr(value: number | string | null | undefined): string {
  const parsed = Number(value ?? 0);
  const n = Number.isFinite(parsed) ? parsed : 0;
  const abs = roundMoney(Math.abs(n));
  const [intPart = "0", decPart = "00"] = abs.toFixed(2).split(".");
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  const decimals = decPart.replace(/0+$/, "");
  const sign = n < 0 && abs > 0 ? "-" : "";
  return `${sign}₹${grouped}${decimals ? `.${decimals}` : ""}`;
}
