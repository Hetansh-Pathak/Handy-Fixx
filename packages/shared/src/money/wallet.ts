import { feeForServiceBill } from "./fee";
import { roundMoney, type Rupees } from "./money";

/** Minimum wallet top-up. */
export const MIN_TOPUP: Rupees = 100;

/** `balance` is prepaid money; `due` is fees owed after a job completed on an empty wallet. */
export type WalletState = { balance: Rupees; due: Rupees };

export type AcceptCheck =
  | { ok: true; fee: Rupees; feeWaived: boolean }
  | {
      ok: false;
      reason: "due_outstanding" | "insufficient_wallet";
      fee: Rupees;
      /** How much more is needed in the wallet to accept. */
      shortfall: Rupees;
      /** Amount to put on the "Top up ₹X to accept" button. */
      suggestedTopUp: Rupees;
    };

/**
 * Can the provider tap Accept? During the launch period the wallet check is skipped.
 * Otherwise any outstanding due blocks accepting, and the wallet must cover the fee.
 */
export function checkCanAccept(input: {
  wallet: WalletState;
  /** The provider's locked rate for this booking (fee is picked from it). */
  estimatedServiceBill: Rupees;
  launchActive: boolean;
}): AcceptCheck {
  const fee = feeForServiceBill(input.estimatedServiceBill);
  if (input.launchActive) return { ok: true, fee, feeWaived: true };
  const { balance, due } = input.wallet;
  const needed = roundMoney(due + fee);
  if (due > 0 || balance < fee) {
    const shortfall = roundMoney(Math.max(0, needed - balance));
    return {
      ok: false,
      reason: due > 0 ? "due_outstanding" : "insufficient_wallet",
      fee,
      shortfall,
      suggestedTopUp: Math.max(MIN_TOPUP, Math.ceil(shortfall)),
    };
  }
  return { ok: true, fee, feeWaived: false };
}

export type JobOutcome = "completed" | "cancelled" | "disputed_refunded";

export type Settlement = {
  outcome: JobOutcome;
  /** The real slab fee for this job (shown as "₹15 waived" in launch). 0 for fee-free outcomes. */
  slabFee: Rupees;
  /** Taken from the prepaid wallet. */
  deducted: Rupees;
  /** Moved to the due balance because the wallet could not cover it. */
  addedToDue: Rupees;
  /** Fee not charged because of the launch period. */
  waived: Rupees;
  wallet: WalletState;
  /** Customer total minus whatever fee the provider actually owes. */
  providerNet: Rupees;
};

/**
 * Fee outcome of a finished job (HandyFix-complete.pdf, p.8). The fee is only ever
 * taken when the job completes: cancelled and disputed-and-refunded jobs never touch
 * the wallet. If the wallet cannot cover the fee, the WHOLE fee moves to `due`
 * (the job still completes) and new accepts stay blocked until it is paid.
 */
export function settleJob(input: {
  outcome: JobOutcome;
  serviceBill: Rupees;
  customerTotal: Rupees;
  wallet: WalletState;
  launchActive: boolean;
}): Settlement {
  const { outcome, wallet } = input;
  const base = { outcome, wallet, providerNet: input.customerTotal, deducted: 0, addedToDue: 0, waived: 0 };

  if (outcome !== "completed") return { ...base, slabFee: 0 };

  const slabFee = feeForServiceBill(input.serviceBill);
  if (slabFee === 0) return { ...base, slabFee };
  if (input.launchActive) return { ...base, slabFee, waived: slabFee };

  if (wallet.balance >= slabFee) {
    return {
      ...base,
      slabFee,
      deducted: slabFee,
      wallet: { balance: roundMoney(wallet.balance - slabFee), due: wallet.due },
      providerNet: roundMoney(input.customerTotal - slabFee),
    };
  }
  return {
    ...base,
    slabFee,
    addedToDue: slabFee,
    wallet: { balance: wallet.balance, due: roundMoney(wallet.due + slabFee) },
    providerNet: roundMoney(input.customerTotal - slabFee),
  };
}

export type TopUpValidation = { ok: true } | { ok: false; error: string };

export function validateTopUp(amount: number): TopUpValidation {
  if (!Number.isFinite(amount)) return { ok: false, error: "Enter a valid amount." };
  if (amount < MIN_TOPUP) return { ok: false, error: `Minimum top-up is ₹${MIN_TOPUP}.` };
  return { ok: true };
}

/** A top-up clears the due balance first; the rest becomes prepaid balance. */
export function applyTopUp(wallet: WalletState, amount: Rupees): WalletState {
  const clearsDue = Math.min(wallet.due, amount);
  return {
    balance: roundMoney(wallet.balance + amount - clearsDue),
    due: roundMoney(wallet.due - clearsDue),
  };
}
