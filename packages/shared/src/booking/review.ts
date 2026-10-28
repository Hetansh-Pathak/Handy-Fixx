/** Rules for rating a pro after a completed job: one review per completed booking (PDF p.4). */

export const MAX_REVIEW_COMMENT = 500;

export function validateReview(input: { rating: number; comment: string }): string | null {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) return "Tap 1 to 5 stars to rate your pro.";
  if (input.comment.trim().length > MAX_REVIEW_COMMENT) return `Keep your comment under ${MAX_REVIEW_COMMENT} characters.`;
  return null;
}

/** The database allows one review per booking; the app also hides the form once there is one. */
export const canReview = (status: string, alreadyReviewed: boolean): boolean => status === "completed" && !alreadyReviewed;

const LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
export const ratingLabel = (stars: number): string => LABELS[stars] ?? "";

/** A readable reason for a failed review. Rules written for people (22023, 42501) pass through; everything else is hidden. */
export function reviewErrorMessage(error: { code?: string | null; message?: string | null }): string {
  const message = error.message ?? "";
  if (error.code === "23505") return "You already rated this job.";
  if ((error.code === "22023" || error.code === "42501") && message) return message;
  if (/network request failed|failed to fetch|timeout|offline/i.test(message)) return "No internet connection. Check your internet and try again.";
  return "We could not save your rating right now. Please try again in a little while.";
}
