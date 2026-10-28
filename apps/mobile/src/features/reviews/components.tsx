import { MAX_REVIEW_COMMENT, ratingLabel, validateReview } from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/text";
import { Body, Button, Card, ErrorBanner, TextField } from "@/components/ui";
import { colors } from "@/theme/colors";
import { fetchMyReview, myReviewKey, submitReview } from "./api";

export function Stars({ value, size = 20, onPick }: { value: number; size?: number; onPick?: (stars: number) => void }) {
  return (
    <View className="flex-row gap-1" accessibilityRole={onPick ? "radiogroup" : "image"} accessibilityLabel={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        const icon = <Star size={size} color={filled ? colors.sun : colors.line} fill={filled ? colors.sun : "transparent"} strokeWidth={1.8} />;
        return onPick ? (
          <Pressable key={n} accessibilityRole="radio" accessibilityLabel={`${n} ${n === 1 ? "star" : "stars"}`} accessibilityState={{ selected: n === value }}
            onPress={() => onPick(n)} hitSlop={4} className="min-h-[48px] min-w-[48px] items-center justify-center">{icon}</Pressable>
        ) : <View key={n}>{icon}</View>;
      })}
    </View>
  );
}

/** "How was Rajesh?" on a completed job: stars and an optional comment, once. After that it shows what was left. */
export function RateYourPro({ bookingId, providerId, userId, proName, customerName, serviceName }: {
  bookingId: string; providerId: string | null; userId: string | null; proName: string; customerName: string | null; serviceName: string | null;
}) {
  const queryClient = useQueryClient();
  const existing = useQuery({ queryKey: myReviewKey(bookingId), queryFn: () => fetchMyReview(bookingId) });
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!providerId || !userId) return null;
  if (existing.isPending) return null;

  if (existing.data) {
    return (
      <Card>
        <Text className="text-lg font-semibold text-fg">Your rating for {proName}</Text>
        <Stars value={existing.data.rating} size={26} />
        {existing.data.comment ? <Body muted>“{existing.data.comment}”</Body> : null}
        <Text className="text-xs text-muted">Thank you. One rating is allowed for each job.</Text>
      </Card>
    );
  }

  const submit = async () => {
    const problem = validateReview({ rating, comment });
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await submitReview({ userId, bookingId, providerId, reviewerName: customerName, serviceName, rating, comment });
      await queryClient.invalidateQueries({ queryKey: myReviewKey(bookingId) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not save your rating. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Text className="text-lg font-semibold text-fg">How was {proName}?</Text>
      <Stars value={rating} size={32} onPick={(n) => { setRating(n); setError(null); }} />
      {rating ? <Text className="text-sm font-semibold text-brand">{ratingLabel(rating)}</Text> : <Text className="text-sm text-muted">Tap a star. You can rate once.</Text>}
      <TextField label="Comment (optional)" value={comment} onChangeText={setComment} multiline maxLength={MAX_REVIEW_COMMENT}
        placeholder="What went well? Was the pro on time and polite?" hint={`${comment.length}/${MAX_REVIEW_COMMENT}. Customers see this on ${proName}'s profile.`} />
      <ErrorBanner message={error} />
      <Button label="Submit review" loading={busy} disabled={rating === 0} onPress={() => void submit()} />
    </Card>
  );
}
