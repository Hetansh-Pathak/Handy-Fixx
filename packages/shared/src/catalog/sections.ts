/** Heading for sub-items saved without a section (rows added before sections existed). */
export const UNSECTIONED = "More services";

export type SubItemSection<T> = { section: string; items: T[] };

/**
 * Groups a service's sub-items into their sections ("Switch & socket", "Fan" …), keeping the order they arrive in
 * (the API sorts by sort_order), so a section appears where its first item is. Items without a section go last,
 * under "More services". If no item has a section (the column is not applied yet) there is one group.
 */
export function groupSubItems<T extends { section?: string | null }>(items: readonly T[]): SubItemSection<T>[] {
  const groups = new Map<string, T[]>();
  const loose: T[] = [];
  for (const item of items) {
    const key = item.section?.trim();
    if (!key) { loose.push(item); continue; }
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  const out = [...groups].map(([section, list]) => ({ section, items: list }));
  if (loose.length) out.push({ section: UNSECTIONED, items: loose });
  return out;
}

/** A check-up visit: a pro comes, finds the problem and quotes ("Fan Check-up Visit", "TV Check-up"). */
export const isCheckupVisit = (name: string) => /check-?up|visit|inspection/i.test(name);
