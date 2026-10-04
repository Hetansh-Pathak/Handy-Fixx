import { useEffect, useState } from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  User, Mail, Phone, MapPin, Star, Calendar, CheckCircle2,
  Save, Loader2, ArrowRight, AlertCircle
} from "lucide-react";

type ProfileData = {
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  pincode: string | null;
  city: string | null;
  address: string | null;
  created_at: string;
};

type BookingStat = {
  id: string;
  status: string | null;
  booking_date: string;
  services: { name: string; icon_name: string | null } | null;
};

const Profile = () => {
  const { user } = useAuth();
  const { refetchProfile } = useApp();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isSetup = searchParams.get("setup") === "true";

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [bookings, setBookings] = useState<BookingStat[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pincode, setPincode] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const [{ data: profileData, error: profileError }, { data: bookingData }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select(
              "user_id, full_name, avatar_url, phone, pincode, city, address, created_at"
            )
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("bookings")
            .select("id, status, booking_date, services(name, icon_name)")
            .eq("customer_id", user.id)
            .order("created_at", { ascending: false })
            .limit(3),
        ]);

      if (profileError) {
        console.error("profile load error:", profileError);
      }

      if (profileData) {
        setProfile(profileData as ProfileData);
        setName(profileData.full_name ?? "");
        setPhone(profileData.phone ?? "");
        setPincode(profileData.pincode ?? "");
        setCity(profileData.city ?? "");
        setAddress(profileData.address ?? "");
      }

      setBookings((bookingData ?? []) as BookingStat[]);
      setLoading(false);
    };
    load();
  }, [user]);

  const totalBookings = bookings.length;
  const completedBookings = bookings.filter((b) => b.status === "completed").length;

  const updateProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: name,
        phone,
        pincode,
        city,
        address,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    setSaving(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    // Update the shared AppContext so navbar name refreshes too
    refetchProfile();

    toast({ title: "Profile updated ✅", description: "Your profile has been saved." });
  };

  const initial = (name || user?.email || "U").slice(0, 1).toUpperCase();
  const memberSince = profile?.created_at
    ? format(new Date(profile.created_at), "MMMM yyyy")
    : "—";

  const statusBadgeClass: Record<string, string> = {
    pending: "status-pending",
    confirmed: "status-confirmed",
    completed: "status-completed",
    cancelled: "status-cancelled",
    in_progress: "status-confirmed",
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="container mx-auto pt-28 pb-16 px-4"
      >
        {/* Setup Banner */}
        {isSetup && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 bg-primary/10 border border-primary/30 rounded-xl px-5 py-4 flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">Complete your profile</p>
              <p className="text-sm text-muted-foreground">
                Add your name, phone, and address to enable faster checkout and
                personalized service recommendations.
              </p>
            </div>
          </motion.div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
          <h1 className="text-3xl font-bold text-foreground">My Profile</h1>
          <Button
            className="bg-gradient-gold text-primary-foreground font-semibold shadow-gold hover:opacity-90"
            disabled={saving}
            onClick={updateProfile}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>

        {loading ? (
          <div className="grid lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-card border border-border rounded-2xl p-5 animate-pulse"
              >
                <div className="h-6 bg-secondary rounded mb-4 w-1/3" />
                <div className="space-y-3">
                  <div className="h-10 bg-secondary rounded" />
                  <div className="h-10 bg-secondary rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Main column */}
            <div className="lg:col-span-2 space-y-6">
              {/* Personal Info */}
              <section className="bg-card border border-border rounded-2xl p-6">
                <h2 className="text-xl font-semibold text-foreground mb-5">Personal Info</h2>

                {/* Avatar + name display */}
                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-border">
                  <Avatar className="w-16 h-16">
                    <AvatarImage src={profile?.avatar_url ?? undefined} alt="Profile" />
                    <AvatarFallback className="bg-gradient-gold text-primary-foreground text-2xl font-bold">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-foreground text-lg">
                      {name || "Your Name"}
                    </p>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                    {profile?.created_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Member since {memberSince}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" /> Full Name
                    </label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your full name"
                      className="bg-secondary border-border"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5" /> Phone
                    </label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 9876543210"
                      className="bg-secondary border-border"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5" /> Email
                    </label>
                    <Input
                      value={user?.email ?? ""}
                      disabled
                      className="bg-secondary/50 border-border text-muted-foreground"
                    />
                  </div>
                </div>
              </section>

              {/* Address */}
              <section className="bg-card border border-border rounded-2xl p-6">
                <h2 className="text-xl font-semibold text-foreground mb-5">
                  Address Details
                </h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" /> Default Pincode
                    </label>
                    <Input
                      value={pincode}
                      onChange={(e) =>
                        setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      placeholder="380001"
                      className="bg-secondary border-border"
                      maxLength={6}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">City</label>
                    <Input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Ahmedabad"
                      className="bg-secondary border-border"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-sm text-muted-foreground">Full Address</label>
                    <Textarea
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="House number, street, area..."
                      className="bg-secondary border-border resize-none"
                      rows={3}
                    />
                  </div>
                </div>

                {/* Quick search with saved pincode */}
                {pincode.length === 6 && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-primary/30 text-primary hover:bg-primary/10"
                      onClick={() => navigate(`/services?pincode=${pincode}`)}
                    >
                      <MapPin className="w-3.5 h-3.5 mr-1.5" />
                      Find services in {pincode}{" "}
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </div>
                )}
              </section>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Stats */}
              <section className="bg-card border border-border rounded-2xl p-5">
                <h2 className="text-lg font-semibold text-foreground mb-4">Account Stats</h2>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-border/50">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" /> Member Since
                    </div>
                    <span className="text-sm font-medium text-foreground">{memberSince}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border/50">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Star className="w-4 h-4" /> Total Bookings
                    </div>
                    <span className="text-2xl font-bold text-primary">{totalBookings}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4" /> Completed
                    </div>
                    <span className="text-2xl font-bold text-green-400">
                      {completedBookings}
                    </span>
                  </div>
                </div>
              </section>

              {/* Recent Bookings */}
              <section className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-foreground">Recent Bookings</h2>
                  <Link
                    to="/my-bookings"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    View all <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>

                {bookings.length === 0 ? (
                  <div className="text-center py-6">
                    <Calendar className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No bookings yet.</p>
                    <Button
                      size="sm"
                      className="mt-3 bg-gradient-gold text-primary-foreground"
                      onClick={() => navigate("/services")}
                    >
                      Book a Service
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bookings.map((booking) => (
                      <div
                        key={booking.id}
                        className="rounded-xl bg-secondary px-3 py-3 flex items-center justify-between gap-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {booking.services?.name ?? "Service"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(booking.booking_date), "d MMM yyyy")}
                          </p>
                        </div>
                        <Badge
                          className={
                            statusBadgeClass[booking.status ?? "pending"] ?? "status-pending"
                          }
                        >
                          {booking.status?.replace("_", " ") ?? "pending"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </motion.main>
      <Footer />
    </div>
  );
};

export default Profile;