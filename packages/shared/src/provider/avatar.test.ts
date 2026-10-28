import { describe, expect, it } from "vitest";
import { AVATAR_MAX_BYTES, avatarPathFromUrl, avatarStoragePath, checkAvatar, nameInitials } from "./avatar";

describe("checkAvatar", () => {
  it("accepts JPG, PNG and WebP under the limit", () => {
    expect(checkAvatar("image/jpeg", 800_000)).toBeNull();
    expect(checkAvatar("image/webp", null)).toBeNull();
  });
  it("rejects other formats, empty and oversized files", () => {
    expect(checkAvatar("image/heic", 1)).toMatch(/JPG/);
    expect(checkAvatar(null, 1)).toMatch(/JPG/);
    expect(checkAvatar("image/png", 0)).toMatch(/empty/);
    expect(checkAvatar("image/png", AVATAR_MAX_BYTES + 1)).toMatch(/5 MB/);
  });
});

describe("avatarStoragePath", () => {
  it("keeps the file in the user's own folder", () => {
    expect(avatarStoragePath("u1", "image/png", 42)).toBe("u1/avatar-42.png");
  });
});

describe("avatarPathFromUrl", () => {
  it("reads the path back from a public URL", () => {
    expect(avatarPathFromUrl("https://x.supabase.co/storage/v1/object/public/avatars/u1/avatar-42.jpg?t=1")).toBe("u1/avatar-42.jpg");
  });
  it("ignores URLs that are not ours", () => {
    expect(avatarPathFromUrl("https://lh3.googleusercontent.com/a/photo.jpg")).toBeNull();
    expect(avatarPathFromUrl(null)).toBeNull();
  });
});

describe("nameInitials", () => {
  it.each([["Ravi Patel", "RP"], ["  madhav  ", "M"], ["a b c", "AB"], ["", "?"], [null, "?"]])("%j → %s", (n, out) => {
    expect(nameInitials(n)).toBe(out);
  });
});
