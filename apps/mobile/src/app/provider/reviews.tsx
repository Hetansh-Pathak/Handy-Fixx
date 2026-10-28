import { publicReviewerName, relativeTime, summarizeReviews } from "@handyfix/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Star } from "lucide-react-native";
import { View } from "react-native";
import { Text } from "@/components/text";
import { Body, Button, Card, ErrorBanner, Screen, ScreenHeader, ListSkeleton } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";
import { fetchProviderReviews, providerReviewsKey } from "@/features/reviews/api";
import { Stars } from "@/features/reviews/components";
import { colors } from "@/theme/colors";

export default function ProviderReviews() {
  const router = useRouter();
  const { provider } = useSession();
  const providerId = provider?.id ?? "";
  const reviews = useQuery({ queryKey: providerReviewsKey(providerId), enabled: !!providerId, queryFn: () => fetchProviderReviews(providerId) });
  const list = reviews.data ?? [];
  const summary = summarizeReviews(list);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/provider/profile"));

  return (
    <Screen>
      <ScreenHeader title="My reviews" onBack={back} />
      <ErrorBanner message={reviews.isError ? "Could not load your reviews. Check your internet." : null} />
      {reviews.isError ? <Button label="Try again" variant="secondary" onPress={() => void reviews.refetch()} /> : null}
      {reviews.isPending ? <ListSkeleton /> : null}

      {reviews.isSuccess && list.length === 0 ? (
        <View className="items-center gap-2 py-16">
          <Star size={40} color={colors.mutedSoft} />
          <Text className="text-lg font-semibold text-fg">No reviews yet</Text>
          <Text className="text-center text-base text-muted">After a customer closes a job with their code, they can rate you. Reviews only come from real jobs done through HandyFix.</Text>
        </View>
      ) : null}

      {summary.count > 0 ? (
        <Card>
          <View className="flex-row items-center gap-4">
            <View className="items-center">
              <Text accessibilityLabel={`Average rating ${summary.average} out of 5`} className="text-5xl font-extrabold text-fg">{summary.average?.toFixed(1)}</Text>
              <Stars value={Math.round(summary.average ?? 0)} size={16} />
              <Text className="mt-1 text-xs text-muted">{summary.count} {summary.count === 1 ? "review" : "reviews"}</Text>
            </View>
            <View className="flex-1 gap-1.5">
              {([5, 4, 3, 2, 1] as const).map((n) => (
                <View key={n} className="flex-row items-center gap-2">
                  <Text className="w-3 text-xs text-muted">{n}</Text>
                  <View className="h-2 flex-1 overflow-hidden rounded-full bg-field">
                    <View className="h-2 rounded-full bg-sun" style={{ width: `${Math.round((summary.distribution[n] / summary.count) * 100)}%` }} />
                  </View>
                  <Text className="w-5 text-right text-xs text-muted">{summary.distribution[n]}</Text>
                </View>
              ))}
            </View>
          </View>
        </Card>
      ) : null}

      {list.map((r) => (
        <Card key={r.id}>
          <View className="flex-row items-center justify-between">
            <Stars value={r.rating} size={18} />
            <Text className="text-xs text-muted">{relativeTime(r.created_at, new Date())}</Text>
          </View>
          {r.comment ? <Text className="text-base text-fg">“{r.comment}”</Text> : <Text className="text-sm text-muted">No comment.</Text>}
          <Text className="text-sm text-muted">{publicReviewerName(r.reviewer_name)}{r.service_name ? ` · ${r.service_name}` : ""}</Text>
        </Card>
      ))}
    </Screen>
  );
}
