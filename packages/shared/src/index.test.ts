import { describe, expect, it } from "vitest";
import { SHARED_PACKAGE } from "./index";

describe("@handyfix/shared", () => {
  it("is wired into the test runner", () => {
    expect(SHARED_PACKAGE).toBe("@handyfix/shared");
  });
});
