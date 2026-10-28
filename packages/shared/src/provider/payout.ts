import { z } from "zod";

/**
 * Where a pro's wallet withdrawals are sent: a UPI ID, a bank account, or both. The same four columns on
 * `service_providers` are read by the `request_payout` function, which refuses a withdrawal with none saved.
 */

export const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const ACCOUNT_REGEX = /^\d{9,18}$/;

export const upiIdField = z.string().trim().transform((v, ctx) => {
  if (v === "") return null;
  if (!UPI_REGEX.test(v)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a UPI ID like name@bank" });
    return z.NEVER;
  }
  return v;
});

/** Bank details are all-or-nothing: a half-filled account cannot receive a payout. */
export function checkBankGroup(
  v: { bankAccountName: string | null; bankAccountNumber: string; bankIfsc: string },
  ctx: z.RefinementCtx,
): void {
  const anyBank = !!v.bankAccountName || v.bankAccountNumber !== "" || v.bankIfsc !== "";
  if (!anyBank) return;
  if (!v.bankAccountName) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bankAccountName"], message: "Enter the account holder's name" });
  if (!ACCOUNT_REGEX.test(v.bankAccountNumber)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bankAccountNumber"], message: "Enter the 9-18 digit account number" });
  }
  if (!IFSC_REGEX.test(v.bankIfsc)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bankIfsc"], message: "Enter an 11-character IFSC like SBIN0001234" });
}

export const payoutDetailsSchema = z
  .object({
    upiId: upiIdField,
    bankAccountName: z.string().trim().max(100, "Too long").transform((v) => (v === "" ? null : v)),
    bankAccountNumber: z.string().transform((v) => v.replace(/\s/g, "")),
    bankIfsc: z.string().transform((v) => v.trim().toUpperCase()),
  })
  .superRefine((v, ctx) => {
    checkBankGroup(v, ctx);
    const anyBank = !!v.bankAccountName || v.bankAccountNumber !== "" || v.bankIfsc !== "";
    if (!v.upiId && !anyBank) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["upiId"], message: "Add a UPI ID or your bank account so we know where to send your money" });
    }
  });

export type PayoutDetailsInput = z.input<typeof payoutDetailsSchema>;
export type PayoutDetails = z.output<typeof payoutDetailsSchema>;

export type PayoutPatch = {
  upi_id: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
};

export const toPayoutPatch = (p: PayoutDetails): PayoutPatch => ({
  upi_id: p.upiId,
  bank_account_name: p.bankAccountName,
  bank_account_number: p.bankAccountNumber || null,
  bank_ifsc: p.bankIfsc || null,
});

type PayoutRow = { upi_id: string | null; bank_account_name: string | null; bank_account_number: string | null; bank_ifsc: string | null };

const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

/** What is saved, written for the screen. Half a bank account does not count. */
export function payoutSummary(row: PayoutRow): { upi: string | null; bank: string | null; ready: boolean } {
  const upi = clean(row.upi_id);
  const name = clean(row.bank_account_name);
  const number = clean(row.bank_account_number);
  const ifsc = clean(row.bank_ifsc);
  const bank = name && number && ifsc && number.length >= 4 ? `${name} · ••••${number.slice(-4)} · ${ifsc}` : null;
  return { upi, bank, ready: !!upi || !!bank };
}
