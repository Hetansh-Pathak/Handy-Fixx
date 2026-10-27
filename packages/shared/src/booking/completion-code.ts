/** Shape of the `complete_booking_with_code` RPC reply. Fields beyond `ok` depend on `reason`. */
export type CompletionResult = {
  ok: boolean;
  reason?: "wrong_code" | "locked" | "invalid_status" | "unauthorized" | "no_code" | string;
  attempts_left?: number;
  locked?: boolean;
  locked_until?: string | null;
};

export const COMPLETION_CODE_LENGTH = 4;

export const isCompletionCode = (v: string) => new RegExp(`^\\d{${COMPLETION_CODE_LENGTH}}$`).test(v);

export function formatLockTime(lockedUntil: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.ceil((new Date(lockedUntil).getTime() - now.getTime()) / 60_000));
  return minutes <= 1 ? "less than a minute" : `${minutes} minutes`;
}

export type CompletionOutcome =
  | { kind: "completed" }
  | { kind: "error"; message: string; clearCode: boolean; attemptsLeft: number | null; lockedUntil: string | null };

/** Turns the RPC reply into one UI-ready outcome so every screen shows the same messages. */
export function interpretCompletion(result: CompletionResult, now: Date = new Date()): CompletionOutcome {
  if (result.ok) return { kind: "completed" };
  const lockedUntil = result.locked_until ?? null;
  switch (result.reason) {
    case "wrong_code": {
      const left = result.attempts_left ?? 0;
      if (result.locked && lockedUntil) {
        return {
          kind: "error", clearCode: true, attemptsLeft: 0, lockedUntil,
          message: `Too many wrong attempts. Try again in ${formatLockTime(lockedUntil, now)}.`,
        };
      }
      return {
        kind: "error", clearCode: true, attemptsLeft: left, lockedUntil: null,
        message: `Incorrect code.${left > 0 ? ` ${left} attempt${left === 1 ? "" : "s"} left.` : " No attempts left."}`,
      };
    }
    case "locked":
      return {
        kind: "error", clearCode: false, attemptsLeft: null, lockedUntil,
        message: `Locked. Try again in ${lockedUntil ? formatLockTime(lockedUntil, now) : "a few minutes"}.`,
      };
    case "invalid_status":
      return { kind: "error", clearCode: false, attemptsLeft: null, lockedUntil: null, message: "This booking is not in progress, so it cannot be completed." };
    case "unauthorized":
      return { kind: "error", clearCode: false, attemptsLeft: null, lockedUntil: null, message: "You are not allowed to complete this booking." };
    default:
      return { kind: "error", clearCode: false, attemptsLeft: null, lockedUntil: null, message: "An error occurred. Please try again." };
  }
}
