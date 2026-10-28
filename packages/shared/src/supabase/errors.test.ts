import { describe, expect, it } from "vitest";
import { friendlyDbError } from "./errors";

describe("friendlyDbError", () => {
  it("shows the rules the database wrote for people (P0001, 22023)", () => {
    expect(friendlyDbError({ code: "P0001", message: "Wallet below the fee: top up ₹100 to accept." })).toBe("Wallet below the fee: top up ₹100 to accept.");
    expect(friendlyDbError({ code: "22023", message: "This chat is closed." })).toBe("This chat is closed.");
  });
  it("hides row-level security text", () => {
    const m = friendlyDbError({ code: "42501", message: 'new row violates row-level security policy for table "bookings"' });
    expect(m).not.toMatch(/row-level|policy|bookings/);
    expect(m).toMatch(/not allowed|cannot/i);
  });
  it("explains duplicates and missing links in plain words", () => {
    expect(friendlyDbError({ code: "23505", message: "duplicate key value violates unique constraint" })).toMatch(/already/i);
    expect(friendlyDbError({ code: "23503", message: "violates foreign key constraint" })).toMatch(/no longer exists|try again/i);
  });
  it("describes a lost connection and an expired session", () => {
    expect(friendlyDbError({ message: "Network request failed" })).toMatch(/internet/i);
    expect(friendlyDbError({ message: "TypeError: Failed to fetch" })).toMatch(/internet/i);
    expect(friendlyDbError({ code: "PGRST301", message: "JWT expired" })).toMatch(/sign in again/i);
    expect(friendlyDbError({ message: "JWT expired" })).toMatch(/sign in again/i);
  });
  it("never shows column, table or schema text", () => {
    for (const message of ['column "x" does not exist', 'relation "public.bookings" does not exist', "Could not find the table 'public.x' in the schema cache", "syntax error at or near"]) {
      const m = friendlyDbError({ code: "42703", message });
      expect(m).not.toMatch(/column|relation|schema|syntax|table/i);
      expect(m).toMatch(/try again/i);
    }
  });
  it("copes with nothing at all", () => {
    expect(friendlyDbError(null)).toMatch(/try again/i);
    expect(friendlyDbError({})).toMatch(/try again/i);
  });
});
