import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, isSameDay } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import LiveMap from "@/components/LiveMap";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useEmailVerification } from "@/hooks/useEmailVerification";
import EmailVerificationCard from "@/components/EmailVerificationCard";
import AttachmentViewer, { useBookingAttachments } from "@/components/AttachmentViewer";
import { uploadPendingDraftFiles } from "@/utils/draftAttachmentStore";
import { supabase } from "@/integrations/supabase/client";
import { Tables, TablesInsert } from "@/integrations/supabase/types";
import { ArrowLeft, ImageIcon, LocateFixed, Mic, ShieldCheck, X } from "lucide-react";

type Service = Tables<"services">;
type Provider = Tables<"service_providers"> & {
  provider_services?: Array<{ custom_price: number | null }>;
  is_email_verified?: boolean | null;
};

const slots = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"];

// ── Helper: insert booking_attachments rows after booking is created ──────────
async function linkDraftAttachments(
  bookingId: string,
  userId: string,
  draftId: string,
): Promise<void> {
  // 1. Upload any pending local attachments from IndexedDB draft store (e.g. added before login)
  try {
    await uploadPendingDraftFiles(bookingId, userId, draftId);
  } catch (e) {
    console.warn("Pending draft store upload error:", e);
  }

  // 2. List all objects in the draft folder in Supabase storage
  const { data: objects } = await supabase.storage
    .from("booking-attachments")
    .list(`${userId}/${draftId}`);

  if (!objects || objects.length === 0) return;

  const rows = objects
    .filter(o => o.name && !o.name.endsWith("/"))
    .map(o => {
      const storagePath = `${userId}/${draftId}/${o.name}`;
      const isAudio = o.name.startsWith("voice_");
      return {
        booking_id:   bookingId,
        uploaded_by:  userId,
        type:         isAudio ? "audio" : "image",
        storage_path: storagePath,
        mime_type:    isAudio ? "audio/webm" : "image/jpeg",
        size_bytes:   o.metadata?.size ?? null,
      };
    });

  if (rows.length === 0) return;

  await (supabase as unknown as {
    from: (t: string) => {
      insert: (rows: unknown[]) => Promise<{ error: { message: string } | null }>;
    };
  }).from("booking_attachments").insert(rows);
}

const Booking = () => {
  const { serviceSlug, providerId } = useParams();
  const [searchParams] = useSearchParams();
  const pincodeFromQuery = searchParams.get("pincode") ?? "";
  const subItemId = searchParams.get("sub_item") ?? null;
  const subItemName = searchParams.get("sub_name") ?? null;
  // The price is NEVER taken from the URL. It is read from the database below, and the database
  // re-prices the booking on insert anyway, so what the customer sees is what they are charged.
  const [subItemPrice, setSubItemPrice] = useState<number | null>(null);
  const draftId = searchParams.get("draft") ?? null;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { verified, refresh: refreshVerified } = useEmailVerification();

  const [step, setStep] = useState(1);
  const [service, setService] = useState<Service | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState(pincodeFromQuery);
  const [notes, setNotes] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [pincodeLocating, setPincodeLocating] = useState(false);
  const [locationSource, setLocationSource] = useState<"gps" | "pincode" | null>(null);
  const [saving, setSaving] = useState(false);
  const [attachmentsRemoved, setAttachmentsRemoved] = useState(false);

  // Load any draft attachments for preview in step 3
  const { attachments: draftAttachments } = useBookingAttachments(
    "draft-" + (draftId ?? ""),  // won't match any real booking_id — used only for display
    false, // disabled; we show from storage instead — only show if draftId exists
  );

  // Draft note pre-fill — stored in sessionStorage by ProblemDescription component
  useEffect(() => {
    const key = `hf_draft_note_${draftId ?? ""}`;
    const savedNote = sessionStorage.getItem(key);
    if (savedNote && !notes) setNotes(savedNote);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  useEffect(() => {
    const bootstrap = async () => {
      if (!serviceSlug || !providerId || !user) return;

      const [{ data: serviceData }, { data: providerData }, { data: profileData }] = await Promise.all([
        supabase.from("services")
          .select("*")
          .eq("slug", serviceSlug)
          .maybeSingle(),
        supabase
          .from("public_providers")
          .select("id, name, full_name, is_email_verified")
          .eq("id", providerId)
          .maybeSingle(),
        supabase.from("profiles")
          .select("address, city, pincode, full_name, phone")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      setService(serviceData);
      setProvider(providerData as unknown as Provider | null);

      if (subItemId && serviceData) {
        const { data: sub } = await (supabase as unknown as {
          from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { base_price: number | null } | null }> } } } };
        }).from("service_sub_items").select("base_price").eq("id", subItemId).eq("service_id", (serviceData as { id: string }).id).maybeSingle();
        setSubItemPrice(sub?.base_price ?? null);
      }

      if (profileData) {
        setAddress(profileData.address ?? "");
        setCity(profileData.city ?? "");
        setPincode((previous) => previous || profileData.pincode || "");
      }
    };

    bootstrap();
  }, [serviceSlug, providerId, user]);

  const serviceCharge = useMemo(() => {
    if (subItemPrice) return subItemPrice;
    if (!service) return 0;
    return service.base_price ?? 0;
  }, [service, subItemPrice]);

  const platformFee = useMemo(() => Math.round(serviceCharge * 0.12), [serviceCharge]);
  const providerAmount = serviceCharge;
  const totalAmount = serviceCharge + platformFee;

  const canGoStep2 = Boolean(selectedDate && selectedTime);
  const canGoStep3 = Boolean(address.trim() && city.trim() && /^\d{6}$/.test(pincode));

  const reverseGeocode = async (nextLatitude: number, nextLongitude: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${nextLatitude}&lon=${nextLongitude}&format=json&addressdetails=1`,
        { headers: { "Accept-Language": "en" } },
      );
      const result = await response.json() as {
        display_name?: string;
        address?: Record<string, string>;
      };
      const details = result.address ?? {};
      const resolvedCity = details.city || details.town || details.village || details.municipality || details.county;

      if (result.display_name) setAddress(result.display_name);
      if (resolvedCity) setCity(resolvedCity);
      if (details.postcode && /^\d{6}$/.test(details.postcode)) setPincode(details.postcode);
    } catch {
      toast({ title: "Address lookup unavailable", description: "The map pin was saved. You can enter the address and city manually." });
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Location unavailable", description: "Your browser does not support location. You can enter the address manually.", variant: "destructive" });
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setLocationAccuracy(position.coords.accuracy);
        setLocationSource("gps");
        void reverseGeocode(position.coords.latitude, position.coords.longitude);
        toast({ title: "Location pinned", description: "Drag the map marker if you want to fine-tune it." });
        setLocating(false);
      },
      () => {
        toast({ title: "Location permission denied", description: "You can continue by entering the address manually.", variant: "destructive" });
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  };

  const usePincodeLocation = async () => {
    if (!/^\d{6}$/.test(pincode)) {
      toast({ title: "Enter a valid pincode", description: "Enter a 6-digit pincode first.", variant: "destructive" });
      return;
    }

    setPincodeLocating(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(pincode)}&country=India&format=json&limit=1`,
        { headers: { "Accept-Language": "en" } },
      );
      const results = await response.json() as Array<{ lat: string; lon: string }>;
      const result = results[0];
      if (!result) throw new Error("Pincode location was not found.");

      setLatitude(Number(result.lat));
      setLongitude(Number(result.lon));
      setLocationAccuracy(null);
      setLocationSource("pincode");
      await reverseGeocode(Number(result.lat), Number(result.lon));
      toast({ title: "Pincode location added", description: "This marks the pincode area. Drag the marker to your exact service location." });
    } catch (error) {
      toast({
        title: "Could not find pincode",
        description: error instanceof Error ? error.message : "Try entering the address manually.",
        variant: "destructive",
      });
    } finally {
      setPincodeLocating(false);
    }
  };

  const confirmBooking = async () => {
    if (!user || !service || !selectedDate || !selectedTime || !providerId) return;

    setSaving(true);

    try {
      // Fetch customer profile for name + phone
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("user_id", user.id)
        .maybeSingle();

      const formattedDate = format(selectedDate, "yyyy-MM-dd");
      const formattedTime = `${selectedTime}:00`;
      const customerName = profileData?.full_name || user.email?.split("@")[0] || "Customer";

      const insertPayload: TablesInsert<"bookings"> = {
        customer_id:          user.id,
        provider_id:          providerId,
        service_id:           service.id,
        booking_date:         formattedDate,
        booking_time:         formattedTime,
        scheduled_date:       formattedDate,
        scheduled_time:       formattedTime,
        address,
        pincode,
        city,
        special_instructions: notes || null,
        description:          notes || null,
        total_amount:         totalAmount,
        latitude,
        longitude,
        platform_fee:         platformFee,
        provider_amount:      providerAmount,
        status:               "pending",
        customer_name:        customerName,
        customer_phone:       profileData?.phone || null,
        sub_item_id:          subItemId || null,
        sub_item_name:        subItemName || null,
      };

      let { data: booking, error } = await supabase
        .from("bookings")
        .insert(insertPayload)
        .select("id")
        .single();

      // Legacy schema retry
      if (error && /latitude|longitude|schema cache/i.test(error.message)) {
        const legacyPayload: TablesInsert<"bookings"> = { ...insertPayload };
        delete legacyPayload.latitude;
        delete legacyPayload.longitude;
        const retry = await supabase
          .from("bookings")
          .insert(legacyPayload)
          .select("id")
          .single();
        booking = retry.data;
        error = retry.error;
        if (!error) {
          toast({
            title: "Booking created",
            description: "Apply the live-location migration in Supabase to save and track the map location.",
          });
        }
      }

      if (error && (error.code === "42501" || /row-level security/i.test(error.message))) {
        await refreshVerified();
        // Any RLS refusal used to be reported as "verify your email", even for people who were already verified,
        // which hid the real cause (a missing/old booking policy, for example).
        console.error("Booking insert refused:", error);
        if (verified === false) {
          toast({ title: "Verify your email first", description: "Email verification is required before booking.", variant: "destructive" });
        } else {
          toast({ title: "Booking was refused", description: `The database rejected this booking (${error.code ?? "RLS"}). Please try again; if it repeats, contact support.`, variant: "destructive" });
        }
        setSaving(false);
        return;
      }

      if (error) {
        console.error("Booking insert error:", error);
        toast({
          title: "Booking failed",
          description: error.message,
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      // ── Link draft attachments to the booking (non-blocking) ────────────────
      if (draftId && !attachmentsRemoved && booking?.id) {
        try {
          await linkDraftAttachments(booking.id, user.id, draftId);
          // Clean up sessionStorage note
          sessionStorage.removeItem(`hf_draft_note_${draftId}`);
          // Reset the draft id so a new one is created next time
          sessionStorage.removeItem("hf_draft_id");
        } catch (attErr) {
          const msg = attErr instanceof Error ? attErr.message : "Unknown error";
          console.warn("Attachment linking failed:", msg);
          toast({
            title: "Booking placed, but some attachments could not be saved",
            description: "Your booking was confirmed. You may re-upload from booking details.",
          });
        }
      }

      sessionStorage.setItem(
        "booking-toast",
        JSON.stringify({
          providerName: provider?.full_name ?? (provider as { name?: string } | null)?.name ?? "Your Provider",
          dateTime: `${format(selectedDate, "d MMMM")}, ${selectedTime}`,
        }),
      );

      navigate(`/booking-confirmation/${booking!.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      console.error("Booking error:", err);
      toast({ title: "Booking failed", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Whether there are draft storage files to show
  const hasDraftFiles = Boolean(draftId && user?.id);
  void draftAttachments; // suppress unused warning — we use the storage list approach

  const STEPS = ["When", "Where", "Confirm"];
  const prevStep = useRef(step);
  const dir = step >= prevStep.current ? 1 : -1;
  useEffect(() => { prevStep.current = step; }, [step]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(new Date(), i)), []);
  const now = new Date();
  const isToday = selectedDate ? isSameDay(selectedDate, now) : false;
  const freeSlots = slots.filter((slot) => !isToday || Number(slot.slice(0, 2)) > now.getHours() + 1);
  // A chosen option must have its real price loaded before the customer can confirm.
  const priceReady = !subItemId || subItemPrice != null;
  const ctaDisabled = step === 1 ? !canGoStep2 : step === 2 ? !canGoStep3 : saving || !priceReady || totalAmount <= 0;
  const ctaLabel = step === 1 ? "Continue" : step === 2 ? "Review booking" : saving ? "Confirming…" : `Confirm · ₹${totalAmount}`;
  const onCta = () => (step === 1 ? setStep(2) : step === 2 ? setStep(3) : confirmBooking());
  const fieldCls = "mt-1.5 w-full rounded-2xl border-0 bg-secondary px-4 py-3.5 text-base outline-none focus:ring-2 focus:ring-gold";
  const providerName = provider?.full_name ?? (provider as { name?: string } | null)?.name;

  return (
    <div className="min-h-dvh bg-background">
      {/* Top bar + progress */}
      <header className="sticky top-0 z-30 bg-background/90 px-3 pb-3 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-2xl">
        <div className="mx-auto flex max-w-xl items-center gap-1">
          <button
            onClick={() => (step > 1 ? setStep((v) => v - 1) : navigate(-1))}
            aria-label="Back"
            className="press flex h-11 w-11 items-center justify-center rounded-full hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-sm font-bold">{service?.name}{subItemName ? ` · ${subItemName}` : ""}</p>
            <p className="truncate text-xs text-muted-foreground">with {providerName}</p>
          </div>
          <span className="pr-2 text-xs font-semibold text-muted-foreground">{step}/3</span>
        </div>
        <div className="mx-auto mt-1 flex max-w-xl gap-1.5 px-3">
          {STEPS.map((_, i) => (
            <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
              <motion.div
                className="h-full rounded-full bg-gold"
                initial={false}
                animate={{ width: i < step ? "100%" : "0%" }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-xl overflow-x-hidden px-5 pb-36 pt-4">
        {verified === null && (
          <div className="flex justify-center py-24"><div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground border-t-transparent" /></div>
        )}
        {verified === false && <EmailVerificationCard onVerified={refreshVerified} onCancel={() => navigate(-1)} />}

        {verified === true && (
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              initial={{ opacity: 0, x: 40 * dir }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 * dir }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {step === 1 && (
                <section>
                  <h1 className="text-[28px] font-extrabold tracking-tight">When should {providerName?.split(" ")[0] ?? "the pro"} arrive?</h1>
                  <div className="no-scrollbar -mx-5 mt-6 flex gap-2 overflow-x-auto px-5">
                    {days.map((d) => {
                      const on = selectedDate ? isSameDay(selectedDate, d) : false;
                      return (
                        <button
                          key={d.toISOString()}
                          onClick={() => { setSelectedDate(d); setSelectedTime(""); }}
                          className={`press flex h-20 w-16 shrink-0 flex-col items-center justify-center rounded-2xl transition-colors ${on ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                        >
                          <span className={`text-xs font-semibold ${on ? "text-gold" : "text-muted-foreground"}`}>{isSameDay(d, now) ? "Today" : format(d, "EEE")}</span>
                          <span className="text-xl font-extrabold">{format(d, "d")}</span>
                        </button>
                      );
                    })}
                  </div>
                  <h2 className="mb-3 mt-8 text-lg font-extrabold tracking-tight">Time</h2>
                  {freeSlots.length === 0 ? (
                    <p className="rounded-2xl bg-secondary p-4 text-sm text-muted-foreground">No slots left today. Pick another day.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2.5">
                      {freeSlots.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setSelectedTime(slot)}
                          className={`press h-12 rounded-2xl text-sm font-bold transition-colors ${selectedTime === slot ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {step === 2 && (
                <section className="space-y-5">
                  <h1 className="text-[28px] font-extrabold tracking-tight">Where is the job?</h1>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={useCurrentLocation} disabled={locating} className="press flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60">
                      <LocateFixed className="h-4 w-4" />{locating ? "Locating…" : "Use current location"}
                    </button>
                    <button type="button" onClick={usePincodeLocation} disabled={pincodeLocating || !/^\d{6}$/.test(pincode)} className="press h-11 rounded-full bg-secondary px-5 text-sm font-bold disabled:opacity-40">
                      {pincodeLocating ? "Finding…" : "Locate by pincode"}
                    </button>
                  </div>
                  {latitude !== null && longitude !== null && (
                    <div className="overflow-hidden rounded-3xl">
                      <LiveMap
                        height="210px"
                        markers={[{ latitude, longitude, label: "Service location", draggable: true }]}
                        onMarkerDrag={(nextLatitude, nextLongitude) => {
                          setLatitude(nextLatitude);
                          setLongitude(nextLongitude);
                          setLocationAccuracy(null);
                          void reverseGeocode(nextLatitude, nextLongitude);
                        }}
                      />
                      <p className="bg-secondary px-4 py-2 text-xs text-muted-foreground">
                        Drag the pin to adjust.{locationSource === "pincode" && " Pincode locations are approximate."}
                        {locationAccuracy !== null && locationAccuracy > 100 && ` Accuracy ~${Math.round(locationAccuracy)}m.`}
                      </p>
                    </div>
                  )}
                  <label className="block text-sm font-semibold">Full address
                    <Textarea value={address} onChange={(e) => setAddress(e.target.value)} className={fieldCls} rows={3} />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-semibold">Pincode
                      <Input inputMode="numeric" value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))} className={fieldCls + " h-auto"} />
                    </label>
                    <label className="block text-sm font-semibold">City
                      <Input value={city} onChange={(e) => setCity(e.target.value)} className={fieldCls + " h-auto"} />
                    </label>
                  </div>
                  <label className="block text-sm font-semibold">Instructions <span className="font-normal text-muted-foreground">(optional)</span>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldCls} rows={2} />
                  </label>
                </section>
              )}

              {step === 3 && (
                <section className="space-y-4">
                  <h1 className="text-[28px] font-extrabold tracking-tight">Review &amp; confirm</h1>
                  <div className="divide-y divide-border/70 rounded-3xl border border-border px-5">
                    {[
                      ["Service", `${service?.name ?? ""}${subItemName ? ` · ${subItemName}` : ""}`],
                      ["Pro", providerName ?? ""],
                      ["When", `${selectedDate ? format(selectedDate, "EEE, d MMM") : "-"} · ${selectedTime}`],
                      ["Where", `${address}, ${city} - ${pincode}`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-6 py-3.5 text-sm">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="text-right font-semibold">{v}</span>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-3xl bg-secondary p-5 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Service charge</span><span className="font-semibold">₹{serviceCharge}</span></div>
                    <div className="mt-2 flex justify-between"><span className="text-muted-foreground">Platform fee</span><span className="font-semibold">₹{platformFee}</span></div>
                    <div className="mt-3 flex justify-between border-t border-border pt-3 text-lg font-extrabold"><span>Total</span><span>₹{totalAmount}</span></div>
                  </div>

                  <div className="flex items-start gap-3 rounded-2xl bg-accent p-4 text-sm">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                    <p><span className="font-bold">Pay after the service.</span> Online only, by UPI or QR. Nothing is charged now.</p>
                  </div>

                  {hasDraftFiles && !attachmentsRemoved ? (
                    <div className="rounded-2xl border border-border p-4 text-sm">
                      <div className="flex items-center justify-between">
                        <p className="font-bold">Problem details attached</p>
                        <button type="button" onClick={() => setAttachmentsRemoved(true)} className="press flex items-center gap-1 text-xs text-muted-foreground">
                          <X className="h-3.5 w-3.5" /> Remove
                        </button>
                      </div>
                      <div className="mt-2 text-muted-foreground">{problemSummaryFromSearch(searchParams)}</div>
                      {notes && <p className="mt-2 text-muted-foreground"><span className="font-semibold text-foreground">Note: </span>{notes}</p>}
                    </div>
                  ) : (
                    attachmentsRemoved && <p className="text-xs text-muted-foreground">Attachments will not be sent with this booking.</p>
                  )}
                </section>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {/* Sticky action bar */}
      {verified === true && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-2xl">
          <button
            onClick={onCta}
            disabled={ctaDisabled}
            className={`press mx-auto flex h-14 w-full max-w-xl items-center justify-center gap-2 rounded-2xl text-base font-bold transition-colors disabled:opacity-40 ${
              step === 3 ? "bg-gold text-gold-foreground" : "bg-primary text-primary-foreground"
            }`}
          >
            {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            {ctaLabel}
          </button>
        </div>
      )}
    </div>
  );
};

/** Build a human-readable summary from URL search params (no round-trip needed) */
function problemSummaryFromSearch(params: URLSearchParams): React.ReactNode {
  const hasDraft = Boolean(params.get("draft"));
  if (!hasDraft) return null;
  // We don't know exact counts here without another storage call —
  // show a generic indicator instead.
  return (
    <span className="flex items-center gap-3 text-xs">
      <span className="flex items-center gap-1"><Mic className="w-3.5 h-3.5 text-foreground" /> Voice / photos may be attached</span>
      <span className="flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5 text-foreground" /> Will be sent to provider</span>
    </span>
  );
}

export default Booking;
