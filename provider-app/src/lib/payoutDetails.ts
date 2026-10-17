export type PayoutInput = { bank_account_name: string; bank_account_number: string; bank_ifsc: string; upi_id: string };

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT = /^\d{9,18}$/;
const UPI = /^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,63}$/i;

/** Returns a plain-language problem, or null when the details can be saved. Either a full bank account or a UPI id is enough. */
export function validatePayout(v: PayoutInput): string | null {
  const name = v.bank_account_name.trim();
  const acct = v.bank_account_number.replace(/\s+/g, '');
  const ifsc = v.bank_ifsc.trim().toUpperCase();
  const upi = v.upi_id.trim();
  const anyBank = Boolean(name || acct || ifsc);

  if (!anyBank && !upi) return 'Add a bank account or a UPI ID so we can pay you.';
  if (anyBank) {
    if (!name) return 'Enter the account holder name exactly as on your bank account.';
    if (!ACCOUNT.test(acct)) return 'Account number should be 9 to 18 digits.';
    if (!IFSC.test(ifsc)) return 'IFSC looks wrong. It is 4 letters, a zero, then 6 letters or digits (for example HDFC0001234).';
  }
  if (upi && !UPI.test(upi)) return 'UPI ID looks wrong. It should look like name@bank.';
  return null;
}

export const cleanPayout = (v: PayoutInput) => ({
  bank_account_name: v.bank_account_name.trim() || null,
  bank_account_number: v.bank_account_number.replace(/\s+/g, '') || null,
  bank_ifsc: v.bank_ifsc.trim().toUpperCase() || null,
  upi_id: v.upi_id.trim() || null,
});
