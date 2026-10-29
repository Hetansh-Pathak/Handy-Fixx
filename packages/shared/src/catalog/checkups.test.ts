import { describe, expect, it } from "vitest";
import { CHECKUP_FEE_NOTE, checkupsFirst, findGenericCheckup } from "./checkups";

const it_ = (name: string, description?: string, section?: string) => ({ name, description, section });

describe("findGenericCheckup", () => {
  it("finds the any-job visit by its description", () => {
    const items = [it_("Tap Repair"), it_("Toilet Check-up Visit", "Pro checks the problem and quotes", "Toilet"), it_("Plumber Visit", "Inspection and quote for any job", "Book a consultation")];
    expect(findGenericCheckup(items)?.name).toBe("Plumber Visit");
  });
  it("finds it by a consultation section even with another description", () => {
    expect(findGenericCheckup([it_("Visit", "Come and see", "Book a consultation"), it_("Fan Check-up Visit", "x", "Fan")])?.name).toBe("Visit");
  });
  it("uses a service's only visit", () => {
    expect(findGenericCheckup([it_("Pest Inspection Visit", "Pro finds the pest and quotes", "Packages & visit"), it_("Cockroach Treatment")])?.name).toBe("Pest Inspection Visit");
  });
  it("has none when there are several specific check-ups and no general one", () => {
    expect(findGenericCheckup([it_("TV Check-up", "Display diagnosed", "Television"), it_("AC Check-up", "x", "AC")])).toBeNull();
  });
  it("has none without any visit", () => {
    expect(findGenericCheckup([it_("Fan Repair"), it_("Tap Installation")])).toBeNull();
    expect(findGenericCheckup([])).toBeNull();
  });
});

describe("checkupsFirst", () => {
  it("moves check-ups to the front and keeps the rest in order", () => {
    const list = [it_("Fan Repair"), it_("Fan Installation"), it_("Fan Check-up Visit")];
    expect(checkupsFirst(list).map((i) => i.name)).toEqual(["Fan Check-up Visit", "Fan Repair", "Fan Installation"]);
  });
  it("does not change its input and copes with no check-up", () => {
    const list = [it_("A"), it_("B Check-up")];
    checkupsFirst(list);
    expect(list.map((i) => i.name)).toEqual(["A", "B Check-up"]);
    expect(checkupsFirst([it_("A"), it_("B")]).map((i) => i.name)).toEqual(["A", "B"]);
  });
});

describe("CHECKUP_FEE_NOTE", () => {
  it("says the fee is always charged and the repair is approved extra work", () => {
    expect(CHECKUP_FEE_NOTE).toContain("always charged");
    expect(CHECKUP_FEE_NOTE).toContain("extra work");
    expect(CHECKUP_FEE_NOTE).toContain("approve");
  });
});
