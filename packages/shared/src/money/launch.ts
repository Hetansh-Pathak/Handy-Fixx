/** Fee-free launch for a provider: ends at whichever limit is reached first. */
export const LAUNCH_PERIOD = { months: 3, jobs: 10 } as const;

export type LaunchConfig = { months: number; jobs: number };

export type LaunchStatus =
  | { active: true; endsAt: Date; jobsLeft: number; daysLeft: number }
  | { active: false; reason: "not_started" | "time_over" | "jobs_over" };

/** Calendar month addition in UTC (clamps e.g. 31 Jan + 1 month to 28/29 Feb). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/**
 * @param launchStartedAt when the provider was approved (launch clock start); null = not approved yet
 * @param completedJobs   jobs completed BEFORE the job being evaluated
 */
export function launchStatus(
  input: { launchStartedAt: Date | null; completedJobs: number; now: Date },
  config: LaunchConfig = LAUNCH_PERIOD,
): LaunchStatus {
  if (!input.launchStartedAt) return { active: false, reason: "not_started" };
  const endsAt = addMonths(input.launchStartedAt, config.months);
  if (input.now.getTime() >= endsAt.getTime()) return { active: false, reason: "time_over" };
  if (input.completedJobs >= config.jobs) return { active: false, reason: "jobs_over" };
  return {
    active: true,
    endsAt,
    jobsLeft: config.jobs - input.completedJobs,
    daysLeft: Math.ceil((endsAt.getTime() - input.now.getTime()) / 86_400_000),
  };
}
