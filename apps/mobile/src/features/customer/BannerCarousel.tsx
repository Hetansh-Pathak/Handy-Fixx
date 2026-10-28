import { useRouter } from "expo-router";
import { BadgeIndianRupee, MapPin, Snowflake, Sparkles, Wrench, type LucideIcon } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from "react-native";
import { Text } from "@/components/text";
import { colors } from "@/theme/colors";

type Banner = {
  key: string;
  title: string;
  body: string;
  icon: LucideIcon;
  /** Service to open; the button is hidden when that service is not in the live catalogue. */
  slug?: string;
  cta?: string;
  bg: string;
  dark: boolean;
};

// Copy follows the business model: no booking fee, price shown up front, pay the pro directly. No % discounts.
const BANNERS: Banner[] = [
  { key: "ac", title: "Beat the heat", body: "AC service at home by verified technicians. See the price before you book.", icon: Snowflake, slug: "ac-service", cta: "Book AC service", bg: colors.brand, dark: true },
  { key: "fee", title: "₹0 booking fee", body: "You pay only the pro's price, by UPI or cash, after the job is done.", icon: BadgeIndianRupee, bg: "#1C1C1C", dark: true },
  { key: "clean", title: "A spotless home", body: "Deep cleaning by trusted local pros, at a time that suits you.", icon: Sparkles, slug: "cleaning", cta: "Book cleaning", bg: "#A24F22", dark: true },
  { key: "track", title: "Track your pro live", body: "Watch your pro on the way, then share a 4-digit code to finish the job.", icon: MapPin, bg: colors.brandSoft, dark: false },
  { key: "fix", title: "Leaks and sparks, fixed", body: "Plumbers and electricians near you, ready today.", icon: Wrench, slug: "plumbing", cta: "Book a plumber", bg: colors.fg, dark: true },
];

const AUTOPLAY_MS = 4500;

export function BannerCarousel({ availableSlugs }: { availableSlugs: ReadonlySet<string> }) {
  const router = useRouter();
  const scroller = useRef<ScrollViewInstance>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
  }, []);

  const goTo = (i: number) => {
    const next = (i + BANNERS.length) % BANNERS.length;
    setIndex(next);
    scroller.current?.scrollTo({ x: next * width, animated: !reduceMotion });
  };

  // Slides on its own unless the user is touching it or prefers less motion.
  useEffect(() => {
    if (!width || paused || reduceMotion) return;
    const t = setTimeout(() => {
      const next = (index + 1) % BANNERS.length;
      setIndex(next);
      scroller.current?.scrollTo({ x: next * width, animated: true });
    }, AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [index, width, paused, reduceMotion]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
    setPaused(false);
  };

  return (
    <View className="gap-3" onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityLabel="Offers">
      {width ? (
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={() => setPaused(true)}
          onMomentumScrollEnd={onScrollEnd}
          scrollEventThrottle={16}
          className="rounded-3xl"
        >
          {BANNERS.map((b) => {
            const Icon = b.icon;
            const canBook = !!b.slug && availableSlugs.has(b.slug);
            const fg = b.dark ? "text-white" : "text-fg";
            return (
              <View key={b.key} style={{ width, backgroundColor: b.bg }} className="min-h-[176px] flex-row gap-4 rounded-3xl p-5">
                <View className="flex-1 justify-between gap-3">
                  <View className="gap-1.5">
                    <Text className={`text-2xl font-extrabold ${fg}`}>{b.title}</Text>
                    <Text className={`text-sm leading-5 ${b.dark ? "text-white/80" : "text-muted"}`}>{b.body}</Text>
                  </View>
                  {canBook ? (
                    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/customer/service/[slug]", params: { slug: b.slug! } })}
                      className={`min-h-[44px] self-start justify-center rounded-xl px-4 active:opacity-80 ${b.dark ? "bg-white" : "bg-brand"}`}>
                      <Text className={`text-sm font-semibold ${b.dark ? "text-fg" : "text-white"}`}>{b.cta}</Text>
                    </Pressable>
                  ) : null}
                </View>
                <View className={`h-16 w-16 items-center justify-center rounded-2xl ${b.dark ? "bg-white/15" : "bg-brand/15"}`}>
                  <Icon size={32} color={b.dark ? colors.white : colors.brand} />
                </View>
              </View>
            );
          })}
        </ScrollView>
      ) : <View className="min-h-[176px] rounded-3xl bg-field" />}
      <View className="flex-row justify-center gap-1">
        {BANNERS.map((b, i) => (
          <Pressable key={b.key} accessibilityRole="button" accessibilityLabel={`Show offer ${i + 1} of ${BANNERS.length}`} hitSlop={8}
            onPress={() => goTo(i)} className="h-6 justify-center px-1">
            <View className={`h-2 rounded-full ${i === index ? "w-6 bg-brand" : "w-2 bg-line"}`} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
