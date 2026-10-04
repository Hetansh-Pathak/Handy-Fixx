import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { motion } from "framer-motion";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import LiveMap from "@/components/LiveMap";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useEmailVerification } from "@/hooks/useEmailVerification";
import EmailVerificationCard from "@/components/EmailVerificationCard";
import AttachmentViewer, { useBookingAttachments } from "@/components/AttachmentViewer";
import { supabase } from "@/integrations/supabase/client";
import { Tables, TablesInsert } from "@/integrations/supabase/types";
import { CheckCircle2, LocateFixed, Mic, ImageIcon, X } from "lucide-react";

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
  // List all objects in the draft folder
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
  const subItemPrice = searchParams.get("sub_price") ? Number(searchParams.get("sub_price")) : null;
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
          .from("service_providers")
          .select("*")
          .eq("id", providerId)
          .maybeSingle(),
        supabase.from("profiles")
          .select("address, city, pincode, full_name, phone")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      setService(serviceData);
      setProvider(providerData as Provider | null);

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
        toast({ title: "Verify your email first", description: "Email verification is required before booking.", variant: "destructive" });
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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <motion.main
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="container mx-auto pt-28 pb-16 px-4 max-w-3xl"
      >
        <h1 className="text-3xl font-bold mb-1">Book Service</h1>
        <p className="text-muted-foreground mb-8">
          {service?.name} · {provider?.full_name ?? (provider as { name?: string } | null)?.name}
        </p>

        {verified === null && (
          <div className="flex justify-center py-16"><div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        )}
        {verified === false && (
          <EmailVerificationCard onVerified={refreshVerified} onCancel={() => navigate(-1)} />
        )}
        {verified === true && (
        <div className="bg-card border border-border rounded-2xl p-5 md:p-8">
          {/* Step progress */}
          <div className="flex items-center gap-2 mb-8">
            {["Date & Time", "Address", "Review"].map((label, idx) => {
              const s = idx + 1;
              return (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                      s < step
                        ? "bg-green-500 text-white"
                        : s === step
                        ? "bg-primary text-primary-foreground shadow-gold"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {s < step ? "✓" : s}
                  </div>
                  <span className={`text-xs hidden sm:block ${s === step ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {label}
                  </span>
                  {s < 3 && <div className={`h-px flex-1 ${s < step ? "bg-green-500/40" : "bg-border"}`} />}
                </div>
              );
            })}
          </div>

          {step === 1 && (
            <div className="grid md:grid-cols-[auto,1fr] gap-8">
              <div>
                <h2 className="text-xl font-semibold mb-3">Select Date</h2>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => date < new Date() || date > addDays(new Date(), 7)}
                  className="rounded-xl border border-border bg-secondary"
                />
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-3">Select Time Slot</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {slots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedTime(slot)}
                      className={`rounded-xl border px-4 py-3 text-sm transition ${
                        selectedTime === slot
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-secondary hover:border-primary/50"
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-3">Address Details</h2>
              <div>
                <label className="text-sm text-muted-foreground">Full Address</label>
                <Textarea value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 bg-secondary" />
              </div>
              <div className="space-y-2">
                <Button type="button" variant="outline" onClick={useCurrentLocation} disabled={locating} className="border-primary/40">
                  <LocateFixed className="mr-2 h-4 w-4" />
                  {locating ? "Finding location..." : "Use my current location"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={usePincodeLocation}
                  disabled={pincodeLocating || !/^\d{6}$/.test(pincode)}
                  className="ml-2 border-primary/40"
                >
                  {pincodeLocating ? "Finding pincode..." : "Locate by pincode"}
                </Button>
                {latitude !== null && longitude !== null && (
                  <>
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
                    <p className="text-xs text-muted-foreground">
                      Drag the marker to adjust the service location.
                      {locationSource === "pincode" && " Pincode locations are approximate."}
                    </p>
                    {locationAccuracy !== null && locationAccuracy > 100 && (
                      <p className="text-xs text-amber-400">Location may be approximate ({Math.round(locationAccuracy)}m accuracy). Drag the marker to adjust it.</p>
                    )}
                  </>
                )}
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Pincode</label>
                  <Input
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="mt-1 bg-secondary"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">City</label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 bg-secondary" />
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Special Instructions (optional)</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 bg-secondary" />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-3">Review & Confirm</h2>
              <div className="bg-secondary rounded-xl p-4 space-y-2 text-sm">
                <p>
                  Service: <span className="text-foreground font-medium">{service?.name}</span>
                </p>
                {subItemName && (
                  <p>
                    Sub-service: <span className="text-foreground font-medium">{subItemName}</span>
                  </p>
                )}
                <p>
                  Provider: <span className="inline-flex items-center gap-1 text-foreground font-medium">{provider?.full_name ?? (provider as { name?: string } | null)?.name}{provider?.is_email_verified && <CheckCircle2 className="h-4 w-4 text-green-500" aria-label="Verified Provider" />}</span>
                </p>
                <p>
                  Date: <span className="text-foreground font-medium">{selectedDate ? format(selectedDate, "EEEE, d MMMM yyyy") : "-"}</span>
                </p>
                <p>
                  Time: <span className="text-foreground font-medium">{selectedTime}</span>
                </p>
                <p>
                  Address: <span className="text-foreground font-medium">{address}, {city} - {pincode}</span>
                </p>
              </div>

              <div className="bg-secondary rounded-xl p-4 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground">Service Charge</span>
                  <span className="text-foreground">₹{serviceCharge}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-muted-foreground">Platform Fee</span>
                  <span className="text-foreground">₹{platformFee}</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between font-bold text-primary text-base">
                  <span>Total</span>
                  <span>₹{totalAmount}</span>
                </div>
              </div>

              {/* ── Draft attachment preview ── */}
              {hasDraftFiles && !attachmentsRemoved && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">Attached Problem Description</p>
                    <button
                      type="button"
                      onClick={() => setAttachmentsRemoved(true)}
                      className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" /> Remove all
                    </button>
                  </div>
                  {/* Show a summary since we can't easily get signed URLs here without booking_id */}
                  <div className="flex gap-3 p-3 rounded-xl bg-primary/5 border border-primary/15 text-sm text-muted-foreground">
                    {problemSummaryFromSearch(searchParams)}
                  </div>
                  {notes && (
                    <div className="p-3 rounded-xl bg-secondary border border-border text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Note: </span>{notes}
                    </div>
                  )}
                </div>
              )}

              {attachmentsRemoved && (
                <p className="text-xs text-muted-foreground">Attachments will not be sent with this booking.</p>
              )}
            </div>
          )}

          <div className="mt-8 flex gap-3">
            {step > 1 && (
              <Button
                variant="outline"
                className="border-border flex-shrink-0"
                onClick={() => setStep((value) => value - 1)}
              >
                ← Back
              </Button>
            )}

            {step === 1 && (
              <Button
                className="bg-gradient-gold text-primary-foreground font-bold flex-1 py-6 rounded-xl shadow-gold hover:opacity-90"
                disabled={!canGoStep2}
                onClick={() => setStep(2)}
              >
                Continue to Address →
              </Button>
            )}

            {step === 2 && (
              <Button
                className="bg-gradient-gold text-primary-foreground font-bold flex-1 py-6 rounded-xl shadow-gold hover:opacity-90"
                disabled={!canGoStep3}
                onClick={() => setStep(3)}
              >
                Review Booking →
              </Button>
            )}

            {step === 3 && (
              <Button
                className="bg-gradient-gold text-primary-foreground font-bold flex-1 py-6 rounded-xl shadow-gold hover:opacity-90"
                disabled={saving}
                onClick={confirmBooking}
              >
                {saving ? "Confirming..." : `Confirm Booking · ₹${totalAmount}`}
              </Button>
            )}
          </div>
        </div>
        )}
      </motion.main>
      <Footer />
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
      <span className="flex items-center gap-1"><Mic className="w-3.5 h-3.5 text-primary" /> Voice / photos may be attached</span>
      <span className="flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5 text-primary" /> Will be sent to provider</span>
    </span>
  );
}

export default Booking;
