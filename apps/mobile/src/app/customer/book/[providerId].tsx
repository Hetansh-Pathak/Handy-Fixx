import {
  availableTimes, bookableDates, bookingAddressSchema, bookingScheduleSchema, fieldErrors, formatBookingWhen, formatDateChip, formatDuration,
  formatInr, isValidPincode, newBookingInputSchema, quoteBooking, snapToAvailable, toDateString, toDbTime,
  type BookingSlot,
} from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { CitySuggestions } from "@/components/CitySuggestions";
import { Text } from "@/components/text";
import { Body, Button, Card, Chip, ErrorBanner, InfoBanner, Screen, ScreenHeader, TextField, Title } from "@/components/ui";
import { loadCustomerProfile, loadEmailVerified } from "@/features/auth/api";
import { EmailVerificationCard } from "@/features/auth/EmailVerificationCard";
import { useSession } from "@/features/auth/session-provider";
import { uploadBookingAttachments, type LocalAttachment, type UploadResult } from "@/features/attachments/api";
import { AttachmentPicker } from "@/features/attachments/components";
import { ClockPicker } from "@/features/customer/ClockPicker";
import { bookingPauseKey, createBooking, EmailNotVerifiedError, fetchBookingPause } from "@/features/customer/booking-api";
import { fetchBookingContext } from "@/features/customer/catalog-api";
import { env } from "@/lib/env";

type Step = 1 | 2 | 3;

export default function BookScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId, fullName } = useSession();
  const { providerId, service: serviceSlug, sub } = useLocalSearchParams<{ providerId: string; service: string; sub?: string }>();

  const context = useQuery({
    queryKey: ["booking-context", serviceSlug, providerId, sub ?? null],
    enabled: !!providerId && !!serviceSlug,
    queryFn: () => fetchBookingContext({ serviceSlug, providerId, subItemId: sub ?? null }),
  });
  const profile = useQuery({ queryKey: ["customer-profile", userId], enabled: !!userId, queryFn: () => loadCustomerProfile(userId!) });
  const verified = useQuery({ queryKey: ["email-verified", userId], enabled: !!userId, queryFn: loadEmailVerified });
  const pause = useQuery({ queryKey: bookingPauseKey(userId), enabled: !!userId, queryFn: () => fetchBookingPause(userId!) });

  const [step, setStep] = useState<Step>(1);
  const now = new Date();
  const dates = useMemo(() => bookableDates(new Date()), []);
  const [date, setDate] = useState<Date | null>(null);
  const [slot, setSlot] = useState<BookingSlot | null>(null);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [notes, setNotes] = useState("");
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const filled = useRef(false);

  // Start on the first day that still has a free slot, and prefill the address from the profile once.
  useEffect(() => {
    if (date) return;
    const first = dates.find((d) => availableTimes(d, new Date()).length > 0);
    if (first) setDate(first);
  }, [date, dates]);

  useEffect(() => {
    if (filled.current || !profile.isSuccess) return;
    filled.current = true;
    setAddress(profile.data?.address ?? "");
    setCity(profile.data?.city ?? "");
    setPincode(profile.data?.pincode ?? "");
  }, [profile.isSuccess, profile.data]);

  const ctx = context.data;
  const quote = ctx ? quoteBooking(ctx.provider.price) : null;
  const times = date ? availableTimes(date, now) : [];

  // Keep the clock on a time that is still bookable (a new date, or the clock passing a time while the screen is open).
  useEffect(() => {
    if (!date) return;
    const options = availableTimes(date, new Date());
    const next = snapToAvailable(slot ?? options[0] ?? "", options);
    if (next !== slot) setSlot(next);
  }, [date, slot]);

  const back = () => (step > 1 ? setStep((step - 1) as Step) : router.back());

  const next1 = () => {
    const r = bookingScheduleSchema.safeParse({ date: date ? toDateString(date) : "", time: slot ?? "" });
    if (!r.success) return setErrors(fieldErrors(r.error));
    if (!slot || !times.includes(slot)) return setErrors({ time: "That time is no longer available. Pick another." });
    setErrors({});
    setStep(2);
  };

  const next2 = () => {
    const r = bookingAddressSchema.safeParse({ address, city, pincode, latitude: coords?.latitude, longitude: coords?.longitude });
    if (!r.success) return setErrors(fieldErrors(r.error));
    setErrors({});
    setStep(3);
  };

  const useMyLocation = async () => {
    setLocating(true);
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) throw new Error("Location permission was denied. You can type your address instead.");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
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

  const confirm = async () => {
    if (!ctx || !quote || !userId) return;
    const parsed = newBookingInputSchema.safeParse({
      date: date ? toDateString(date) : "", time: slot ?? "", address, city, pincode,
      latitude: coords?.latitude, longitude: coords?.longitude, notes,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setStep(parsed.error.issues.some((i) => ["date", "time"].includes(String(i.path[0]))) ? 1 : 2);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createBooking({
        userId,
        customerName: profile.data?.full_name ?? fullName,
        customerPhone: profile.data?.phone ?? null,
        service: ctx.service,
        subItem: ctx.subItem,
        providerId: ctx.provider.id,
        input: parsed.data,
        quote,
      });
      // The booking is saved first; files are best effort so a slow upload never loses the booking.
      let upload: UploadResult | null = null;
      if (attachments.length) {
        setUploading(true);
        upload = await uploadBookingAttachments(userId, created.id, attachments);
      }
      router.replace({
        pathname: "/customer/booking/[id]",
        params: {
          id: created.id,
          expected: String(quote.total),
          ...(upload?.failed ? { attachFailed: String(upload.failed), attachError: upload.firstError ?? "" } : {}),
        },
      });
    } catch (e) {
      if (e instanceof EmailNotVerifiedError) {
        await queryClient.invalidateQueries({ queryKey: ["email-verified", userId] });
        setError("Please verify your email first, then confirm again.");
      } else {
        setError(e instanceof Error ? e.message : "Booking failed. Please try again.");
      }
    } finally {
      setBusy(false);
      setUploading(false);
    }
  };

  if (context.isPending) return <Screen><ScreenHeader title="Book" onBack={() => router.back()} /><Body muted>Loading…</Body></Screen>;
  if (context.isError || !ctx || !quote) {
    return (
      <Screen>
        <ScreenHeader title="Book" onBack={() => router.back()} />
        <ErrorBanner message={context.error instanceof Error ? context.error.message : "Could not load this booking."} />
        <Button label="Choose another pro" onPress={() => router.back()} />
      </Screen>
    );
  }

  const title = ctx.subItem ? ctx.subItem.name : ctx.service.name;
  return (
    <Screen>
      <ScreenHeader title={`Book ${ctx.provider.fullName.split(" ")[0]}`} onBack={back} />
      <Text className="text-sm font-semibold uppercase tracking-widest text-brand">Step {step} of 3</Text>
      <ErrorBanner message={error} />

      {step === 1 ? (
        <>
          <Title>When?</Title>
          <Text className="text-base font-semibold text-fg">Date</Text>
          <View className="flex-row flex-wrap gap-2">
            {dates.map((d) => (
              <Chip key={toDateString(d)} label={formatDateChip(d)} selected={!!date && toDateString(d) === toDateString(date)}
                disabled={availableTimes(d, now).length === 0}
                onPress={() => { setDate(d); setErrors({}); }} />
            ))}
          </View>
          <Text className="text-base font-semibold text-fg">Time</Text>
          <ClockPicker options={times} value={slot} onChange={(t) => { setSlot(t); setErrors({}); }} />
          {errors.time || errors.date ? <Text className="text-sm text-danger">{errors.time ?? errors.date}</Text> : null}
          <Button label="Continue" onPress={next1} />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Title>Where?</Title>
          <Button label={locating ? "Finding you…" : "Use my current location"} variant="secondary" loading={locating} onPress={() => void useMyLocation()} />
          {coords ? <InfoBanner message="Location pinned. Your pro sees it only after accepting." /> : null}
          <TextField label="Address" value={address} onChangeText={(v) => { setAddress(v); setErrors((e) => ({ ...e, address: "" })); }} error={errors.address || undefined} multiline autoComplete="street-address" />
          <TextField label="City" value={city} onChangeText={(v) => { setCity(v); setErrors((e) => ({ ...e, city: "" })); }} error={errors.city || undefined} autoCapitalize="words" />
          <CitySuggestions query={city} onPick={(c) => { setCity(c); setErrors((e) => ({ ...e, city: "" })); }} />
          <TextField label="Pincode" value={pincode} onChangeText={(v) => { setPincode(v.replace(/\D/g, "")); setErrors((e) => ({ ...e, pincode: "" })); }} error={errors.pincode || undefined} keyboardType="number-pad" maxLength={6} />
          <Button label="Continue" onPress={next2} />
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Title>Review & confirm</Title>
          <Card>
            <Row label="Service" value={title} />
            <Row label="Pro" value={ctx.provider.fullName} />
            <Row label="When" value={formatBookingWhen(date ? toDateString(date) : "", slot ? toDbTime(slot) : "")} />
            <Row label="Where" value={[address, city, pincode].filter(Boolean).join(", ")} />
            {ctx.subItem?.duration_minutes ?? ctx.service.duration_minutes ? <Row label="Duration" value={`~${formatDuration(ctx.subItem?.duration_minutes ?? ctx.service.duration_minutes)}`} /> : null}
          </Card>
          <Card>
            <Row label="Service price" value={formatInr(quote.servicePrice)} />
            <Row label="Platform fee" value={formatInr(quote.platformFee)} />
            <View className="my-1 h-px bg-line" />
            <Row label="Total" value={formatInr(quote.total)} strong />
          </Card>
          <InfoBanner message={`Price is locked. Pay ${ctx.provider.fullName.split(" ")[0]} directly by UPI or cash after the service.`} />
          <TextField label="Describe the problem (optional)" value={notes} onChangeText={setNotes} multiline maxLength={1000}
            placeholder="e.g. Kitchen tap leaking since yesterday, water under the sink" />
          <AttachmentPicker value={attachments} onChange={setAttachments} />
          {verified.isSuccess && !verified.data && userId ? <EmailVerificationCard userId={userId} email={null} /> : null}
          {pause.data ? <ErrorBanner message={pause.data} /> : null}
          {!env.bookingEnabled ? <InfoBanner message="Booking opens soon. We are finishing our new pricing." /> : null}
          {uploading ? <InfoBanner message="Booking saved. Uploading your photos and voice note…" /> : null}
          <Button label={`Confirm · ${formatInr(quote.total)}`} loading={busy}
            disabled={!env.bookingEnabled || verified.isPending || verified.data === false || !!pause.data} onPress={() => void confirm()} />
        </>
      ) : null}
    </Screen>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row justify-between gap-4">
      <Text className="text-base text-muted">{label}</Text>
      <Text className={`flex-1 text-right text-base ${strong ? "font-bold text-brand" : "text-fg"}`}>{value}</Text>
    </View>
  );
}
