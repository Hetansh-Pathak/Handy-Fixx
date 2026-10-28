import type { ServiceRow } from "./types";

/**
 * How the Services tab groups services under headings (like Urban Company's category sheets). A service whose slug
 * is not listed goes under "More services", so a new service row still shows up without an app update.
 */
const GROUPS: { title: string; slugs: readonly string[] }[] = [
  { title: "Electrician, Plumber & Carpenter", slugs: ["electrical", "plumbing", "carpentry"] },
  { title: "AC & Appliance Repair", slugs: ["ac-service", "appliance-repair", "hvac"] },
  { title: "Cleaning & Home Help", slugs: ["cleaning", "home-help", "pest-control"] },
  { title: "Painting", slugs: ["painting"] },
  { title: "Salon at Home", slugs: ["salon"] },
];

export function groupServices(services: readonly ServiceRow[]): { title: string; services: ServiceRow[] }[] {
  const used = new Set<string>();
  const out = GROUPS.map((g) => {
    const list = g.slugs.map((slug) => services.find((s) => s.slug === slug)).filter((s): s is ServiceRow => !!s);
    list.forEach((s) => used.add(s.id));
    return { title: g.title, services: list };
  }).filter((g) => g.services.length > 0);
  const rest = services.filter((s) => !used.has(s.id));
  return rest.length ? [...out, { title: "More services", services: rest }] : out;
}
