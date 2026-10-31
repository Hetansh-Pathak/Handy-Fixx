import {
  CHECKUP_FEE_NOTE, DEFAULT_DISPATCH_SETTINGS, availableTimes, bookableDates, confirmButtonLabel, dispatchPrice, formatDateChip, formatDuration, formatInr,
  isCheckupVisit, isInCity, isValidPincode, outsideCityMessage, snapToAvailable, toDateString, toDbTime, type BookingSlot,
} from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Lock, MapPin, Search } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { CitySuggestions } from "@/components/CitySuggestions";
import { Text } from "@/components/text";
import { Body, Button, Card, Chip, ErrorBanner, InfoBanner, ListSkeleton, Screen, ScreenHeader, StatusPill, TextField } from "@/components/ui";
import { loadCustomerProfile, loadEmailVerified } from "@/features/auth/api";
import { EmailVerificationCard } from "@/features/auth/EmailVerificationCard";
import { useSession } from "@/features/auth/session-provider";
import { uploadBookingAttachments, type LocalAttachment } from "@/features/attachments/api";
import { AttachmentPicker } from "@/features/attachments/components";
import { ClockPicker } from "@/features/customer/ClockPicker";
import { bookingPauseKey, EmailNotVerifiedError, fetchBookingPause } from "@/features/customer/booking-api";
import { fetchServiceBySlug, fetchSubItems } from "@/features/customer/catalog-api";
import { requestPro, type RequestWhen } from "@/features/dispatch/api";
import { env } from "@/lib/env";
import { registerPush } from "@/lib/push";
import { useThemeColors } from "@/theme/theme";

/**
 * Instant dispatch request (owner decision 2026-10-31): the job and its locked catalogue price, when (Now by default,
 * or a slot on the clock), where (a pinned position is required so the server can find pros nearby), then
 * "Find a pro · ₹349". No pro is chosen here.
 */
export default function RequestScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const { userId, fullName } = useSession();
  const { service: slug, sub, when: whenParam } = useLocalSearchParams<{ service: string; sub?: string; when?: string }>();

  const service = useQuery({ queryKey: ["service", slug], enabled: !!slug, queryFn: () => fetchServiceBySlug(slug) });
  const subItems = useQuery({ queryKey: ["sub-items", service.data?.id], enabled: !!service.data?.id, queryFn: () => fetchSubItems(service.data!.id) });
  const profile = useQuery({ queryKey: ["customer-profile", userId], enabled: !!userId, queryFn: () => loadCustomerProfile(userId!) });
  const verified = useQuery({ queryKey: ["email-verified", userId], enabled: !!userId, queryFn: loadEmailVerified });
  const pause = useQuery({ queryKey: bookingPauseKey(userId), enabled: !!userId, queryFn: () => fetchBookingPause(userId!) });

  const subItem = subItems.data?.find((s) => s.id === sub) ?? null;
  const quote = service.data ? dispatchPrice({ subItemPrice: subItem?.base_price, basePrice: service.data.base_price }) : null;

  const [later, setLater] = useState(whenParam === "later");
  const dates = useMemo(() => bookableDates(new Date()), []);
  const [date, setDate] = useState<Date | null>(null);
  const [slot, setSlot] = useState<BookingSlot | null>(null);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [point, setPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [notes, setNotes] = useState("");
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const filled = useRef(false);

  useEffect(() => {
    if (filled.current || !profile.isSuccess) return;
    filled.current = true;
    setAddress(profile.data?.address ?? "");
    setCity(profile.data?.city ?? "");
    setPincode(profile.data?.pincode ?? "");
  }, [profile.isSuccess, profile.data]);

  // Later: first day with a free time, and keep the clock on a bookable time.
  useEffect(() => {
    if (!later || date) return;
    setDate(dates.find((d) => availableTimes(d, new Date()).length > 0) ?? null);
  }, [later, date, dates]);
  const times = date ? availableTimes(date, new Date()) : [];
  useEffect(() => {
    if (!later || !date) return;
    const next = snapToAvailable(slot ?? times[0] ?? "", times);
    if (next !== slot) setSlot(next);
  }, [later, date, slot, times]);

  const locate = async () => {
    setLocating(true);
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) throw new Error("Allow location so we can find pros near you.");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const p = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setPoint(p);
      setFieldError((e) => ({ ...e, point: "" }));
      const [place] = await Location.reverseGeocodeAsync(pos.coords).catch(() => []);
      if (place) {
        const line = [place.name, place.street, place.district].filter((v, i, a) => !!v && a.indexOf(v) === i).join(", ");
        if (line) setAddress(line);
        const c = place.city ?? place.subregion;
        if (c) setCity(c);
        if (place.postalCode && isValidPincode(place.postalCode)) setPincode(place.postalCode);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get your location.");
    } finally {
      setLocating(false);
    }
  };

  const submit = async () => {
    if (!service.data || !quote || !userId) return;
    const errs: Record<string, string> = {};
    if (!point) errs.point = "Pin your location so we can find pros near you.";
    if (address.trim().length < 5) errs.address = "Enter your address (house, street, area).";
    if (!city.trim()) errs.city = "Enter your city.";
    if (!isValidPincode(pincode)) errs.pincode = "Enter a 6-digit pincode.";
    if (later && (!date || !slot || !times.includes(slot))) errs.time = "Pick a time at least an hour from now.";
    setFieldError(errs);
    if (Object.values(errs).some(Boolean) || !point) return;
    if (!isInCity(DEFAULT_DISPATCH_SETTINGS, point)) { setError(outsideCityMessage(DEFAULT_DISPATCH_SETTINGS)); return; }

    const when: RequestWhen = later && date && slot ? { kind: "later", date: toDateString(date), time: toDbTime(slot) } : { kind: "now" };
    setBusy(true);
    setError(null);
    try {
      const { bookingId } = await requestPro({
        userId, customerName: profile.data?.full_name ?? fullName, customerPhone: profile.data?.phone ?? null,
        service: service.data, subItem, when, address: address.trim(), city: city.trim(), pincode, point, notes: notes.trim() || null, now: new Date(),
      });
      if (attachments.length) void uploadBookingAttachments(userId, bookingId, attachments).catch(() => undefined);
      void registerPush("customer", { ask: true });
      router.replace({ pathname: "/customer/request/[id]", params: { id: bookingId } });
    } catch (e) {
      if (e instanceof EmailNotVerifiedError) {
        await queryClient.invalidateQueries({ queryKey: ["email-verified", userId] });
        setError("Please verify your email first, then try again.");
      } else {
        setError(e instanceof Error ? e.message : "Could not start the search. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (service.isPending || (sub && subItems.isPending)) return <Screen><ScreenHeader title="Request a pro" onBack={() => router.back()} /><ListSkeleton rows={3} /></Screen>;
  if (!service.data || !quote) {
    return (
      <Screen>
        <ScreenHeader title="Request a pro" onBack={() => router.back()} />
        <ErrorBanner message="This service is not available right now." />
      </Screen>
    );
  }

  const name = subItem?.name ?? service.data.name;
  const minutes = subItem?.duration_minutes ?? service.data.duration_minutes;
  return (
    <Screen>
      <ScreenHeader title="Request a pro" onBack={() => router.back()} />
      <Card>
        <Text className="text-lg font-bold text-fg">{name}</Text>
        {minutes ? <Text className="text-sm text-muted">About {formatDuration(minutes)}</Text> : null}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5"><Lock size={14} color={colors.muted} /><Text className="text-sm text-muted">Price locked</Text></View>
          <Text className="text-2xl font-extrabold text-price">{formatInr(quote.price)}</Text>
        </View>
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-muted">Platform fee</Text>
          <StatusPill label="₹0" tone="ok" />
        </View>
      </Card>
      {subItem && isCheckupVisit(subItem.name) ? <InfoBanner message={CHECKUP_FEE_NOTE} /> : null}

      <Text className="text-lg font-semibold text-fg">When?</Text>
      <View className="flex-row gap-2">
        <Chip label="Now" selected={!later} onPress={() => setLater(false)} />
        <Chip label="Schedule for later" selected={later} onPress={() => setLater(true)} />
      </View>
      {later ? (
        <>
          <View className="flex-row flex-wrap gap-2">
            {dates.map((d) => (
              <Chip key={toDateString(d)} label={formatDateChip(d)} selected={!!date && toDateString(d) === toDateString(date)}
                disabled={availableTimes(d, new Date()).length === 0} onPress={() => setDate(d)} />
            ))}
          </View>
          <ClockPicker options={times} value={slot} onChange={setSlot} />
          {fieldError.time ? <Text className="text-sm text-danger">{fieldError.time}</Text> : null}
        </>
      ) : <Body muted>We ask pros near you right away. The first to accept gets your job.</Body>}

      <Text className="text-lg font-semibold text-fg">Where?</Text>
      <Button label={locating ? "Finding you…" : point ? "Location pinned · update" : "Use my current location"} icon={MapPin}
        variant={point ? "secondary" : "primary"} loading={locating} onPress={() => void locate()} />
      {fieldError.point ? <Text className="text-sm text-danger">{fieldError.point}</Text> : null}
      {point ? <InfoBanner message="Pros see only your area until one accepts. Your exact address and phone stay hidden." /> : null}
      <TextField label="Address" value={address} onChangeText={(v) => { setAddress(v); setFieldError((e) => ({ ...e, address: "" })); }} error={fieldError.address || undefined} multiline autoComplete="street-address" />
      <TextField label="City" value={city} onChangeText={(v) => { setCity(v); setFieldError((e) => ({ ...e, city: "" })); }} error={fieldError.city || undefined} autoCapitalize="words" />
      <CitySuggestions query={city} onPick={setCity} />
      <TextField label="Pincode" value={pincode} onChangeText={(v) => { setPincode(v.replace(/\D/g, "")); setFieldError((e) => ({ ...e, pincode: "" })); }} error={fieldError.pincode || undefined} keyboardType="number-pad" maxLength={6} />

      <TextField label="Describe the problem (optional)" value={notes} onChangeText={setNotes} multiline maxLength={1000} placeholder="e.g. 43 inch TV, wall is concrete" />
      <AttachmentPicker value={attachments} onChange={setAttachments} />

      <ErrorBanner message={error} />
      {verified.isSuccess && !verified.data && userId ? <EmailVerificationCard userId={userId} email={null} /> : null}
      {pause.data ? <ErrorBanner message={pause.data} /> : null}
      {!env.bookingEnabled ? <InfoBanner message="Booking opens soon. We are finishing our new pricing." /> : null}
      <Button label={confirmButtonLabel(quote.price)} icon={Search} loading={busy}
        disabled={!env.bookingEnabled || verified.isPending || verified.data === false || !!pause.data} onPress={() => void submit()} />
      <Text className="text-center text-xs text-muted">No charge for cancelling while we search.</Text>
    </Screen>
  );
}
