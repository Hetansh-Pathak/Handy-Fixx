import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle, Bell, CalendarDays, Check, ChevronRight, Info, Loader2, LogOut, MapPin, MessageCircle, Wrench,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import DeleteAccountDialog from "@/components/DeleteAccountDialog";
import TextField, { FieldShell, fieldClass, fieldErrorClass } from "@/components/form/TextField";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { EMPTY_FIELDS, VALIDATED_ORDER, validateProfile, type FieldKey, type Errors, type Fields } from "@/lib/profileForm";

const Profile = () => {
  const { user, signOut } = useAuth();
  const { refetchProfile, upcomingBookingsCount, unreadNotificationsCount } = useApp();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isSetup = searchParams.get("setup") === "true";
  const reduce = useReducedMotion();

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saved, setSaved] = useState<Fields>(EMPTY_FIELDS);
  const [form, setForm] = useState<Fields>(EMPTY_FIELDS);
  const [meta, setMeta] = useState<{ avatarUrl: string | null; createdAt: string | null }>({ avatarUrl: null, createdAt: null });
  const [stats, setStats] = useState({ total: 0, completed: 0 });
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setStatus("loading");

    // Counts come from the database, not from the length of a "recent" list.
    const [profileRes, totalRes, completedRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, avatar_url, phone, pincode, city, address, created_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("customer_id", user.id),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("customer_id", user.id).eq("status", "completed"),
    ]);

    if (profileRes.error) {
      console.error("profile load error:", profileRes.error);
      setStatus("error");
      return;
    }

    const p = profileRes.data;
    const next: Fields = {
      name: p?.full_name ?? "",
      phone: p?.phone ?? "",
      pincode: p?.pincode ?? "",
      city: p?.city ?? "",
      address: p?.address ?? "",
    };
    setSaved(next);
    setForm(next);
    setMeta({ avatarUrl: p?.avatar_url ?? null, createdAt: p?.created_at ?? null });
    setStats({ total: totalRes.count ?? 0, completed: completedRes.count ?? 0 });
    setStatus("ready");
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(
    () => (Object.keys(form) as FieldKey[]).some((k) => form[k].trim() !== saved[k].trim()),
    [form, saved],
  );

  const set = (key: FieldKey) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const discard = () => {
    setForm(saved);
    setErrors({});
  };

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!user || saving) return;

    const found = validateProfile(form);
    setErrors(found);
    const firstInvalid = VALIDATED_ORDER.find((k) => found[k]);
    if (firstInvalid) {
      document.getElementById(`pf-${firstInvalid}`)?.focus();
      return;
    }

    const clean: Fields = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      pincode: form.pincode,
      city: form.city.trim(),
      address: form.address.trim(),
    };

    setSaving(true);
    const { data, error } = await supabase
      .from("profiles")
      .update({
        full_name: clean.name,
        phone: clean.phone,
        pincode: clean.pincode,
        city: clean.city,
        address: clean.address,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .select("user_id");
    setSaving(false);

    if (error) {
      toast({ title: "Couldn't save your profile", description: error.message, variant: "destructive" });
      return;
    }
    if (!data || data.length === 0) {
      // update() matches zero rows without an error when the profile row is missing.
      toast({
        title: "Couldn't find your profile",
        description: "Log out, log back in and try again.",
        variant: "destructive",
      });
      return;
    }

    setSaved(clean);
    setForm(clean);
    refetchProfile(); // keeps the name and pincode in the rest of the app fresh
    toast({ title: "Profile saved" });
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  const initial = (saved.name || user?.email || "U").trim().slice(0, 1).toUpperCase();
  const memberSince = meta.createdAt ? format(new Date(meta.createdAt), "MMMM yyyy") : null;

  const setupSteps = [
    { label: "Add your name", done: saved.name.trim().length >= 2 },
    { label: "Add your mobile number", done: saved.phone.trim().length > 0 },
  ];
  const showSetup = status === "ready" && setupSteps.some((s) => !s.done);

  const shortcuts = [
    { to: "/my-bookings", label: "My bookings", Icon: CalendarDays, badge: upcomingBookingsCount > 0 ? `${upcomingBookingsCount} upcoming` : undefined },
    { to: "/notifications", label: "Notifications", Icon: Bell, badge: unreadNotificationsCount > 0 ? `${unreadNotificationsCount} new` : undefined },
    { to: "/become-a-pro", label: "Earn as a pro", Icon: Wrench },
    { to: "/contact", label: "Help and contact", Icon: MessageCircle },
    { to: "/about", label: `About ${BRAND.name}`, Icon: Info },
  ];

  return (
    <div className="min-h-dvh bg-background pb-32 md:pb-24">
      <div className="sticky top-0 z-30 border-b border-border/60 bg-background/90 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-2xl md:pt-24">
        <h1 className="mx-auto max-w-2xl text-[28px] font-extrabold tracking-tight">Profile</h1>
      </div>

      <div className="mx-auto max-w-2xl space-y-8 px-5 pt-5">
        {status === "loading" && (
          <div className="space-y-6" aria-busy="true" aria-label="Loading your profile">
            <Skeleton className="h-44 rounded-3xl" />
            <div className="space-y-4">
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-12 rounded-xl" />
            </div>
          </div>
        )}

        {status === "error" && (
          <div role="alert" className="space-y-4 rounded-3xl bg-secondary p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="font-bold">We couldn't load your profile.</p>
                <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
              </div>
            </div>
            <Button onClick={() => void load()}>Try again</Button>
          </div>
        )}

        {status === "ready" && (
          <>
            <motion.section
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="overflow-hidden rounded-3xl bg-primary text-primary-foreground"
            >
              <div className="flex items-center gap-4 p-5">
                <Avatar className="h-16 w-16 ring-2 ring-gold/80">
                  <AvatarImage src={meta.avatarUrl ?? undefined} alt="" />
                  <AvatarFallback className="bg-gold text-2xl font-extrabold text-gold-foreground">{initial}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-xl font-extrabold tracking-tight">{saved.name || "Add your name"}</p>
                  <p className="truncate text-sm text-white/70">{user?.email}</p>
                  {memberSince && <p className="mt-0.5 text-xs text-white/55">Member since {memberSince}</p>}
                </div>
              </div>
              <dl className="grid grid-cols-2 border-t border-white/10">
                <div className="px-5 py-4">
                  <dt className="text-xs text-white/60">Bookings</dt>
                  <dd className="mt-0.5 text-2xl font-extrabold">{stats.total}</dd>
                </div>
                <div className="border-l border-white/10 px-5 py-4">
                  <dt className="text-xs text-white/60">Completed</dt>
                  <dd className="mt-0.5 text-2xl font-extrabold text-gold">{stats.completed}</dd>
                </div>
              </dl>
            </motion.section>

            {showSetup && (
              <section aria-labelledby="setup-title" className="rounded-3xl bg-accent px-5 py-5">
                <h2 id="setup-title" className="font-extrabold tracking-tight">
                  {isSetup ? "One last step before you book" : "Finish setting up"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">Pros use your name and number to reach you about a booking.</p>
                <ul className="mt-4 space-y-2.5">
                  {setupSteps.map((s) => (
                    <li key={s.label} className="flex items-center gap-3 text-sm font-semibold">
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full border-2",
                          s.done ? "border-primary bg-primary text-primary-foreground" : "border-foreground/30",
                        )}
                        aria-hidden="true"
                      >
                        {s.done && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span className={s.done ? "text-muted-foreground line-through" : undefined}>{s.label}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <form id="profile-form" onSubmit={save} noValidate className="space-y-8">
              <section aria-labelledby="details-title" className="space-y-4">
                <h2 id="details-title" className="text-lg font-extrabold tracking-tight">Your details</h2>
                <TextField
                  id="pf-name"
                  name="name"
                  label="Full name"
                  autoComplete="name"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  placeholder="Your full name"
                  value={form.name}
                  onChange={(e) => set("name")(e.target.value)}
                  error={errors.name}
                />
                <TextField
                  id="pf-phone"
                  name="phone"
                  type="tel"
                  label="Mobile number"
                  inputMode="tel"
                  autoComplete="tel"
                  enterKeyHint="next"
                  placeholder="98765 43210"
                  value={form.phone}
                  onChange={(e) => set("phone")(e.target.value)}
                  error={errors.phone}
                  hint="Pros call this number about your booking."
                />
                <TextField
                  id="pf-email"
                  name="email"
                  label="Email"
                  readOnly
                  value={user?.email ?? ""}
                  className="bg-secondary/60 text-muted-foreground focus-visible:bg-secondary/60"
                  hint="This is your login email. It can't be changed here."
                />
              </section>

              <section aria-labelledby="address-title" className="space-y-4">
                <h2 id="address-title" className="text-lg font-extrabold tracking-tight">Default address</h2>
                <TextField
                  id="pf-pincode"
                  name="pincode"
                  label="Pincode"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={6}
                  enterKeyHint="next"
                  placeholder="380001"
                  value={form.pincode}
                  onChange={(e) => set("pincode")(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  error={errors.pincode}
                />
                {form.pincode.length === 6 && !errors.pincode && (
                  <button
                    type="button"
                    onClick={() => navigate(`/services?pincode=${form.pincode}`)}
                    className="-mt-2 inline-flex items-center gap-1.5 rounded text-sm font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <MapPin className="h-4 w-4" /> See services in {form.pincode}
                  </button>
                )}
                <TextField
                  id="pf-city"
                  name="city"
                  label="City"
                  autoComplete="address-level2"
                  enterKeyHint="next"
                  placeholder="Your city"
                  value={form.city}
                  onChange={(e) => set("city")(e.target.value)}
                />
                <FieldShell id="pf-address" label="Full address" hint="House number, street and area.">
                  <Textarea
                    id="pf-address"
                    name="address"
                    autoComplete="street-address"
                    rows={3}
                    placeholder="House number, street, area"
                    aria-describedby="pf-address-msg"
                    value={form.address}
                    onChange={(e) => set("address")(e.target.value)}
                    className={cn(fieldClass, "h-auto min-h-[96px] resize-none py-3", errors.address && fieldErrorClass)}
                  />
                </FieldShell>
              </section>
            </form>

            <nav aria-label="Shortcuts" className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border">
              {shortcuts.map(({ to, label, Icon, badge }) => (
                <Link
                  key={to}
                  to={to}
                  className="press flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1 font-semibold">{label}</span>
                  {badge && <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-gold-foreground">{badge}</span>}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              ))}
            </nav>

            <button
              type="button"
              onClick={() => setConfirmLogout(true)}
              className="press flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-secondary font-bold text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="h-5 w-5" aria-hidden="true" /> Log out
            </button>

            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="press mx-auto block min-h-11 px-4 text-sm font-semibold text-muted-foreground underline underline-offset-4 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Delete account
            </button>
          </>
        )}
      </div>

      <AnimatePresence>
        {status === "ready" && dirty && (
          <motion.div
            initial={reduce ? false : { y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t border-border/60 bg-background/90 px-5 py-3 backdrop-blur-2xl md:bottom-0"
          >
            <div className="mx-auto flex max-w-2xl gap-3">
              <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={discard} disabled={saving}>
                Discard
              </Button>
              <Button type="submit" form="profile-form" size="lg" className="flex-[2]" disabled={saving} aria-busy={saving}>
                {saving ? (
                  <>
                    <Loader2 className="animate-spin" /> Saving…
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <DeleteAccountDialog open={confirmDelete} onOpenChange={setConfirmDelete} />

      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out of {BRAND.name}?</AlertDialogTitle>
            <AlertDialogDescription>You'll need to log in again to book or track a service.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay logged in</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleLogout()}>Log out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Profile;
