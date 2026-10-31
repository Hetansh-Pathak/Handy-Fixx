/**
 * "Problem closing the job?" (HandyFix-complete.pdf p.9-10): when the customer has not shared the code 2 hours
 * after the pro started the work, both sides see a prompt and the admin can step in. Pure rule on data the
 * booking already has (`status`, `started_at`); no database change.
 */
export const CLOSING_PROBLEM_AFTER_HOURS = 2;
export const CLOSING_PROBLEM_AFTER_MS = CLOSING_PROBLEM_AFTER_HOURS * 3_600_000;

type DateLike = string | Date | null | undefined;

const toMs = (v: DateLike): number | null => {
  if (!v) return null;
  const ms = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
};

export type ClosingProblem = { active: false } | { active: true; minutesOver: number; hoursSinceStart: number };

/** Active only for a job still in progress whose start is at least 2 hours ago. A future or unreadable start is never active. */
export function closingProblem(input: { status: string; startedAt: DateLike; now: Date }): ClosingProblem {
  if (input.status !== "in_progress") return { active: false };
  const started = toMs(input.startedAt);
  if (started === null) return { active: false };
  const elapsed = input.now.getTime() - started;
  if (!Number.isFinite(elapsed) || elapsed < CLOSING_PROBLEM_AFTER_MS) return { active: false };
  return {
    active: true,
    minutesOver: Math.floor((elapsed - CLOSING_PROBLEM_AFTER_MS) / 60_000),
    hoursSinceStart: Math.floor(elapsed / 3_600_000),
  };
}

export type ClosingPrompt = { title: string; body: string };

/** Plain words for each side. Nobody is blamed: the prompt only says what to do next. */
export function closingPrompt(role: "customer" | "provider", otherName?: string | null): ClosingPrompt {
  const other = (otherName ?? "").trim();
  if (role === "customer") {
    const pro = other || "your pro";
    return {
      title: "Problem closing the job?",
      body: `It has been over ${CLOSING_PROBLEM_AFTER_HOURS} hours since ${pro} started. If the work is finished and you are happy, share your code with ${pro}. If it is not finished or something is wrong, contact apnabanda and we will help. Never share the code before the work is done.`,
    };
  }
  const customer = other || "the customer";
  return {
    title: "Problem closing the job?",
    body: `It has been over ${CLOSING_PROBLEM_AFTER_HOURS} hours since you started. Ask ${customer} for the 4-digit code once the work is done. If they cannot be reached or will not share it, contact apnabanda and the team will help. Do not ask for the code before the work is finished.`,
  };
}

/** ISO time before which a job that started is "stuck": the admin list filters on `started_at` older than this. */
export function closingProblemCutoff(now: Date): string {
  return new Date(now.getTime() - CLOSING_PROBLEM_AFTER_MS).toISOString();
}
