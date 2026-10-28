import { reviewErrorMessage } from "@handyfix/shared";
import { getSupabase } from "@/lib/supabase";

export type MyReview = { id: string; rating: number; comment: string | null; created_at: string };

export const myReviewKey = (bookingId: string) => ["my-review", bookingId] as const;

/** The customer's review for this booking, if they already left one (the table is readable by everyone). */
export async function fetchMyReview(bookingId: string): Promise<MyReview | null> {
  const { data, error } = await getSupabase().from("reviews").select("id, rating, comment, created_at").eq("booking_id", bookingId).maybeSingle();
  if (error) throw new Error(reviewErrorMessage(error));
  return (data as MyReview | null) ?? null;
}

/**
 * Saves the review. Provider, customer and service are re-read from the booking by the database;
 * the values sent here are only what its row-level rule needs to accept the insert.
 */
export async function submitReview(args: {
  userId: string;
  bookingId: string;
  providerId: string;
  reviewerName: string | null;
  serviceName: string | null;
  rating: number;
  comment: string;
}): Promise<void> {
  const { error } = await getSupabase().from("reviews").insert({
    booking_id: args.bookingId,
    customer_id: args.userId,
    user_id: args.userId,
    provider_id: args.providerId,
    rating: args.rating,
    comment: args.comment.trim() || null,
    reviewer_name: args.reviewerName,
    service_name: args.serviceName,
  });
  if (error) throw new Error(reviewErrorMessage(error));
}
