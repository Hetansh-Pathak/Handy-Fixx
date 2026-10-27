import { describe, expect, it } from "vitest";
import { isPresenceFresh, isProviderAvailable, offersService, PRESENCE_FRESH_SECONDS, servesArea } from "./availability";

const now = new Date("2026-11-10T10:00:00Z");
const ago = (s: number) => new Date(now.getTime() - s * 1000).toISOString();

describe("presence", () => {
  it("is fresh within 90 seconds, inclusive", () => {
    expect(isPresenceFresh(ago(0), now)).toBe(true);
    expect(isPresenceFresh(ago(PRESENCE_FRESH_SECONDS), now)).toBe(true);
    expect(isPresenceFresh(ago(PRESENCE_FRESH_SECONDS + 1), now)).toBe(false);
  });
  it("accepts Date objects and rejects missing or garbage timestamps", () => {
    expect(isPresenceFresh(new Date(now.getTime() - 5000), now)).toBe(true);
    for (const bad of [null, undefined, "", "not a date"]) expect(isPresenceFresh(bad, now)).toBe(false);
  });
  it("needs both the online flag and a fresh heartbeat", () => {
    expect(isProviderAvailable({ isOnline: true, updatedAt: ago(10) }, now)).toBe(true);
    expect(isProviderAvailable({ isOnline: true, updatedAt: ago(300) }, now)).toBe(false);
    expect(isProviderAvailable({ isOnline: false, updatedAt: ago(10) }, now)).toBe(false);
    expect(isProviderAvailable({ isOnline: null, updatedAt: ago(10) }, now)).toBe(false);
  });
});

describe("offersService", () => {
  it("matches a listed service", () => {
    expect(offersService(["a", "b"], "b")).toBe(true);
    expect(offersService(["a", "b"], "c")).toBe(false);
  });
  it("treats a pro with no services listed as offering all (legacy behaviour)", () => {
    expect(offersService([], "x")).toBe(true);
    expect(offersService(null, "x")).toBe(true);
    expect(offersService(undefined, "x")).toBe(true);
  });
});

describe("servesArea", () => {
  it("matches cities and pincodes exactly, ignoring case and spaces", () => {
    expect(servesArea(["Gandhinagar", "382010"], "gandhinagar")).toBe(true);
    expect(servesArea(["Gandhinagar", "382010"], " 382010 ")).toBe(true);
    expect(servesArea(["Gandhinagar"], "Gandhi")).toBe(false);
    expect(servesArea(["Gandhinagar"], "Surat")).toBe(false);
  });
  it("a blank area matches everyone, missing coverage matches nothing", () => {
    expect(servesArea(["Surat"], "  ")).toBe(true);
    expect(servesArea(null, "Surat")).toBe(false);
    expect(servesArea([], "Surat")).toBe(false);
  });
});
