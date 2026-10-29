import { isCheckupVisit } from "./sections";

type Item = { name: string; description?: string | null; section?: string | null };

/** Said wherever a check-up visit is chosen (owner decision 2026-10-29: the visit fee is always charged). */
export const CHECKUP_FEE_NOTE =
  "The visit fee is always charged. If you want the repair, the pro adds it as extra work and you approve it before anything is added.";

const GENERIC_DESCRIPTION = /any (job|problem|work)|all jobs/i;
const GENERIC_SECTION = /consultation/i;

/**
 * The one visit a customer can book when they do not know what is wrong ("Plumber Visit: inspection and quote for
 * any job"). It is the check-up whose description says it covers any job, or that sits in a "Book a consultation"
 * section. A service whose only check-up is a single item (pest, painting) uses that one. A service with several
 * specific check-ups and no general one (washing machine, TV …) has none: each section shows its own, first.
 */
export function findGenericCheckup<T extends Item>(items: readonly T[]): T | null {
  const visits = items.filter((i) => isCheckupVisit(i.name));
  if (visits.length === 0) return null;
  const general = visits.find((i) => GENERIC_DESCRIPTION.test(i.description ?? "") || GENERIC_SECTION.test(i.section ?? ""));
  if (general) return general;
  return visits.length === 1 ? visits[0]! : null;
}

/** Check-up visits first, everything else in its original order. Does not change the input. */
export function checkupsFirst<T extends Item>(items: readonly T[]): T[] {
  return [...items.filter((i) => isCheckupVisit(i.name)), ...items.filter((i) => !isCheckupVisit(i.name))];
}
