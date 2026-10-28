import { describe, expect, it } from "vitest";
import { MAX_REVIEW_COMMENT, canReview, ratingLabel, reviewErrorMessage, validateReview } from "./review";

describe("validateReview", () => {
  it("accepts 1 to 5 stars with or without a comment", () => {
    for (const rating of [1, 2, 3, 4, 5]) expect(validateReview({ rating, comment: "" })).toBeNull();
    expect(validateReview({ rating: 5, comment: "Fixed it fast, very polite." })).toBeNull();
  });
  it("needs a star rating", () => {
    expect(validateReview({ rating: 0, comment: "" })).toMatch(/stars/i);
    expect(validateReview({ rating: 6, comment: "" })).toMatch(/stars/i);
    expect(validateReview({ rating: 3.5, comment: "" })).toMatch(/stars/i);
    expect(validateReview({ rating: Number.NaN, comment: "" })).toMatch(/stars/i);
  });
  it("limits the comment length", () => {
    expect(validateReview({ rating: 4, comment: "x".repeat(MAX_REVIEW_COMMENT) })).toBeNull();
    expect(validateReview({ rating: 4, comment: "x".repeat(MAX_REVIEW_COMMENT + 1) })).toMatch(String(MAX_REVIEW_COMMENT));
  });
});

describe("canReview", () => {
  it("only a completed booking that has no review yet", () => {
    expect(canReview("completed", false)).toBe(true);
    expect(canReview("completed", true)).toBe(false);
    for (const s of ["pending", "confirmed", "on_the_way", "arrived", "in_progress", "cancelled"]) expect(canReview(s, false)).toBe(false);
  });
});

describe("ratingLabel", () => {
  it("names each star count", () => {
    expect([1, 2, 3, 4, 5].map(ratingLabel)).toEqual(["Poor", "Fair", "Good", "Very good", "Excellent"]);
    expect(ratingLabel(0)).toBe("");
  });
});

describe("reviewErrorMessage", () => {
  it("explains a second review", () => {
    expect(reviewErrorMessage({ code: "23505", message: "duplicate key value violates unique constraint \"reviews_one_per_booking\"" })).toMatch(/already rated/i);
  });
  it("explains a job that is not completed or not theirs", () => {
    expect(reviewErrorMessage({ code: "22023", message: "You can review a job once it is completed." })).toBe("You can review a job once it is completed.");
    expect(reviewErrorMessage({ code: "42501", message: "You can only review your own booking." })).toBe("You can only review your own booking.");
  });
  it("hides database internals, including the guard message that blocks reviews today", () => {
    const m = reviewErrorMessage({ code: "P0001", message: "Cannot change rating directly." });
    expect(m).not.toMatch(/rating directly/);
    expect(m).toMatch(/try again/i);
  });
  it("describes a lost connection", () => {
    expect(reviewErrorMessage({ message: "Network request failed" })).toMatch(/internet/i);
  });
});
