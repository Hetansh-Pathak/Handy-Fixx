import { feeForServiceBill } from "./fee";
import { roundMoney, type Rupees } from "./money";

/**
 * Wallet recharge packs (owner decision 2026-10-29). The app offers only these; the top-up function
 * checks the same list on the server. No free-amount top-up.
 */
export const RECHARGE_PACKS = [
  { amount: 49, popular: false },
  { amount: 99, popular: true },
  { amount: 199, popular: false },
] as const satisfies readonly { amount: Rupees; popular: boolean }[];

export type RechargePack = (typeof RECHARGE_PACKS)[number]["amount"];

export const RECHARGE_PACK_AMOUNTS: readonly RechargePack[] = RECHARGE_PACKS.map((p) => p.amount);

export function isRechargePack(amount: unknown): amount is RechargePack {
  return typeof amount === "number" && (RECHARGE_PACK_AMOUNTS as readonly number[]).includes(amount);
}

/** The bill used for "covers about N jobs" when nothing better is known. */
export const TYPICAL_BILL: Rupees = 400;

/** How many jobs of a typical bill the spendable balance pays the fee for. */
export function jobsCovered(balance: Rupees, typicalBill: Rupees = TYPICAL_BILL): number {
  const fee = feeForServiceBill(typicalBill);
  if (fee <= 0 || !Number.isFinite(balance) || balance <= 0) return 0;
  return Math.floor(roundMoney(balance) / fee);
}

/** Smallest pack that covers `needed`, else the biggest (a large old due takes more than one recharge). */
export function packFor(needed: Rupees): RechargePack {
  const last = RECHARGE_PACK_AMOUNTS[RECHARGE_PACK_AMOUNTS.length - 1]!;
  return RECHARGE_PACK_AMOUNTS.find((a) => a >= needed) ?? last;
}

/**
 * `balance` is SPENDABLE money (`available` from get_wallet_summary: fees held for accepted jobs are
 * already taken out). `due` is money owed from the old model (fee charged on an empty wallet); the new
 * model never creates it, but old dues still block until a recharge clears them.
 */
export type WalletState = { balance: Rupees; due: Rupees };

export type AcceptCheck =
  | { ok: true; fee: Rupees; feeWaived: boolean }
  | {
      ok: false;
      reason: "due_outstanding" | "insufficient_wallet";
      fee: Rupees;
      /** How much more is needed in the wallet to accept. */
      shortfall: Rupees;
      /** Pack to put on the "Recharge ₹X to accept" button. */
      suggestedTopUp: RechargePack;
    };

/**
 * Can the provider tap Accept? During the launch period the wallet check is skipped. Otherwise any old
 * due blocks accepting, and the spendable balance must cover the fee (accepting holds it).
 */
export function checkCanAccept(input: {
  wallet: WalletState;
  /** The provider's locked rate for this booking (the fee is worked out from it). */
  estimatedServiceBill: Rupees;
  launchActive: boolean;
}): AcceptCheck {
  const fee = feeForServiceBill(input.estimatedServiceBill);
  if (input.launchActive) return { ok: true, fee, feeWaived: true };
  const { balance, due } = input.wallet;
  if (due > 0 || balance < fee) {
    const shortfall = roundMoney(Math.max(0, due + fee - balance));
    return { ok: false, reason: due > 0 ? "due_outstanding" : "insufficient_wallet", fee, shortfall, suggestedTopUp: packFor(shortfall) };
  }
  return { ok: true, fee, feeWaived: false };
}

/** A recharge clears any old due first; the rest becomes spendable balance. */
export function applyTopUp(wallet: WalletState, amount: Rupees): WalletState {
  const clearsDue = Math.min(wallet.due, amount);
  return {
    balance: roundMoney(wallet.balance + amount - clearsDue),
    due: roundMoney(wallet.due - clearsDue),
  };
}

export type JobOutcome ="completed" | "cancelled" | "disputed_refunded";

export type Settlement = {
  outcome: JobOutcome;
  /** The fee for the final bill (shown as "₹12 waived" in launch). 0 for fee-free outcomes. */
  fee: Rupees;
  /** Actually charged: from the hold first, then the spendable balance. */
  deducted: Rupees;
  /** Held money given back to the spendable balance. */
  released: Rupees;
  /** Only for jobs accepted before holds existed (no hold): the part the wallet could not cover. */
  addedToDue: Rupees;
  /** A hold existed but the final fee grew past hold + balance: this part is not charged (never a due). */
  uncollected: Rupees;
  /** Fee not charged because of the launch period. */
  waived: Rupees;
  wallet: WalletState;
  /** Customer total minus the fee actually charged. */
  providerNet: Rupees;
};

/**
 * Fee outcome of a finished job; mirrors `settle_booking_fee` in proposal 20261114000000.
 * Accepting holds the fee for the locked price (`held`). Completion charges the fee for the FINAL bill:
 * from the hold first, then from the balance, and releases what is left of the hold. With a hold this never
 * creates a due. Cancelled, declined and refunded jobs cost ₹0 and release the whole hold.
 */
export function settleJob(input: {
  outcome: JobOutcome;
  serviceBill: Rupees;
  customerTotal: Rupees;
  wallet: WalletState;
  /** Fee held at accept for this job (0 in launch or for jobs accepted before holds). */
  held?: Rupees;
  launchActive: boolean;
}): Settlement {
  const held = Math.max(0, input.held ?? 0);
  const { wallet } = input;
  const base = { outcome: input.outcome, deducted: 0, released: held, addedToDue: 0, uncollected: 0, waived: 0, providerNet: input.customerTotal };
  const releasedWallet = { balance: roundMoney(wallet.balance + held), due: wallet.due };

  if (input.outcome !== "completed") return { ...base, fee: 0, wallet: releasedWallet };
  const fee = feeForServiceBill(input.serviceBill);
  if (fee === 0) return { ...base, fee, wallet: releasedWallet };
  if (input.launchActive) return { ...base, fee, waived: fee, wallet: releasedWallet };

  const fromHold = Math.min(fee, held);
  const rest = roundMoney(fee - fromHold);
  const fromBalance = Math.min(rest, Math.max(0, wallet.balance));
  const short = roundMoney(rest - fromBalance);
  const deducted = held > 0 ? roundMoney(fromHold + fromBalance) : fee;
  return {
    ...base,
    fee,
    deducted,
    released: roundMoney(held - fromHold),
    addedToDue: held > 0 ? 0 : short,
    uncollected: held > 0 ? short : 0,
    wallet: {
      balance: roundMoney(wallet.balance - fromBalance + (held - fromHold)),
      due: roundMoney(wallet.due + (held > 0 ? 0 : short)),
    },
    providerNet: roundMoney(input.customerTotal - deducted),
  };
}
