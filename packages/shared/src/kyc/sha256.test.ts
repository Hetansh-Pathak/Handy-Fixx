import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AADHAAR_HASH_SALT, hashAadhaar, sha256Hex } from "./sha256";

describe("sha256Hex", () => {
  it("matches the standard test vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("matches Node's own SHA-256 for every length around the 64-byte block edges", () => {
    for (let len = 0; len <= 200; len++) {
      const text = "x".repeat(len);
      expect(sha256Hex(text)).toBe(createHash("sha256").update(text).digest("hex"));
    }
  });

  it("hashes non-ASCII text as UTF-8", () => {
    for (const text of ["₹500", "हैंडीफिक्स", "café 😀"]) {
      expect(sha256Hex(text)).toBe(createHash("sha256").update(text, "utf8").digest("hex"));
    }
  });
});

describe("hashAadhaar", () => {
  it("is the salted SHA-256 the web app used, so duplicates are caught across both", () => {
    const expected = createHash("sha256").update(`${AADHAAR_HASH_SALT}234123412346`).digest("hex");
    expect(hashAadhaar("234123412346")).toBe(expected);
    expect(AADHAAR_HASH_SALT).toBe("handyfix-kyc-2026-salt");
  });

  it("ignores spaces and dashes people type", () => {
    expect(hashAadhaar("2341 2341-2346")).toBe(hashAadhaar("234123412346"));
  });

  it("gives different hashes for different numbers", () => {
    expect(hashAadhaar("234123412346")).not.toBe(hashAadhaar("234123412347"));
  });
});
