import { describe, expect, it } from "vitest";
import { groupSubItems, isCheckupVisit, UNSECTIONED } from "./sections";

const item = (name: string, section?: string | null) => ({ name, section });

describe("groupSubItems", () => {
  it("groups by section in the order the first item appears", () => {
    const groups = groupSubItems([item("Switch", "Switch & socket"), item("Fan repair", "Fan"), item("Socket", "Switch & socket")]);
    expect(groups.map((g) => [g.section, g.items.map((i) => i.name)])).toEqual([
      ["Switch & socket", ["Switch", "Socket"]],
      ["Fan", ["Fan repair"]],
    ]);
  });
  it("puts items without a section last", () => {
    expect(groupSubItems([item("Old", null), item("Fan repair", "Fan"), item("Other", " ")]).map((g) => g.section)).toEqual(["Fan", UNSECTIONED]);
  });
  it("is one group when nothing has a section yet (column not applied)", () => {
    expect(groupSubItems([item("A"), item("B")])).toEqual([{ section: UNSECTIONED, items: [item("A"), item("B")] }]);
  });
  it("is empty for no items", () => expect(groupSubItems([])).toEqual([]));
});

describe("isCheckupVisit", () => {
  it.each(["Fan Check-up Visit", "TV Check-up", "Electrician Visit", "Pest Inspection Visit"])("%s is a visit", (n) => expect(isCheckupVisit(n)).toBe(true));
  it.each(["Fan Repair", "Tap Installation"])("%s is a job", (n) => expect(isCheckupVisit(n)).toBe(false));
});
