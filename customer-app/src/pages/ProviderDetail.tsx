import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BriefcaseBusiness, CheckCircle2, Star, MapPin, Clock, ArrowLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type ProviderDetails = {
  id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  rating: number | null;
  total_reviews: number | null;
  total_jobs: number | null;
  experience_years: number | null;
  is_verified: boolean | null;
  is_email_verified: boolean | null;
  city: string | null;
};

type ServiceOffer = {
  custom_price: number | null;
  services: { slug: string; name: string; icon_name: string | null } | null;
};

type ReviewRow = {
  id: string;
  rating: number | null;
  comment: string | null;
  created_at: string | null;
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-4 h-4 ${star <= rating ? "text-yellow-400 fill-current" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

const ProviderDetail = () => {
  const { providerId } = useParams();
  const [searchParams] = useSearchParams();
  const serviceSlug = searchParams.get("serviceSlug") ?? "";
  const fromPincode = searchParams.get("pincode") ?? "";
  const navigate = useNavigate();

  const [provider, setProvider] = useState<ProviderDetails | null>(null);
  const [services, setServices] = useState<ServiceOffer[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!providerId) return;

      const [{ data: providerData }, { data: serviceData }, { data: reviewData }] = await Promise.all([
        supabase
          .from("service_providers")
          .select("id, name, full_name, avatar_url, bio, rating, total_reviews, total_jobs, experience_years, is_verified, is_email_verified, city")
          .eq("id", providerId)
          .single(),
        supabase
          .from("provider_services")
          .select("custom_price, services(name, slug, icon_name)")
          .eq("provider_id", providerId),
        supabase
          .from("reviews")
          .select("id, rating, comment, created_at")
          .eq("provider_id", providerId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      setProvider(providerData as ProviderDetails | null);
      setServices((serviceData ?? []) as ServiceOffer[]);
      setReviews((reviewData ?? []) as ReviewRow[]);
      setLoading(false);
    };

    load();
  }, [providerId]);

  const initials = useMemo(() => {
    if (!provider?.name) return "P";
    return provider.name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [provider?.name]);

  const primaryService = services.find((item) => item.services?.slug === serviceSlug) ?? services[0];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Breadcrumb */}
      <div className="pt-20 bg-secondary/50 border-b border-border">
        <div className="container mx-auto py-3 flex items-center gap-2 text-sm text-muted-foreground">
          <button
            onClick={() => navigate(-1)}
            className="hover:text-foreground flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground">{provider?.name ?? "Provider"}</span>
        </div>
      </div>

      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="container mx-auto pt-8 pb-16 px-4"
      >
        {/* Provider hero card */}
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 mb-6">
          <div className="flex flex-col md:flex-row gap-6 md:items-start md:justify-between">
            <div className="flex gap-5">
              <Avatar className="w-24 h-24 flex-shrink-0">
                <AvatarImage src={provider?.avatar_url ?? undefined} alt={provider?.name ?? ""} />
                <AvatarFallback className="bg-gradient-gold text-primary-foreground text-2xl font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>

              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className="text-2xl font-bold text-foreground">{provider?.name}</h1>
                  {(provider?.is_email_verified || provider?.is_verified) && (
                    <Badge className="bg-green-500/10 text-green-400 border border-green-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Verified Pro
                    </Badge>
                  )}
                </div>

                {provider?.bio && (
                  <p className="text-muted-foreground mb-3 max-w-lg">{provider.bio}</p>
                )}

                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5 text-yellow-400">
                    <Star className="w-4 h-4 fill-current" />
                    <span className="font-bold text-foreground">{provider?.rating ?? 0}</span>
                    <span className="text-muted-foreground">({provider?.total_reviews ?? 0} reviews)</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <BriefcaseBusiness className="w-4 h-4 text-primary" />
                    {provider?.total_jobs ?? 0} jobs completed
                  </span>
                  {provider?.experience_years && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4 text-primary" />
                      {provider.experience_years} years experience
                    </span>
                  )}
                  {provider?.city && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-4 h-4 text-primary" />
                      {provider.city}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {primaryService?.services && (
              <Button
                className="bg-gradient-gold text-primary-foreground font-semibold shadow-gold hover:opacity-90 flex-shrink-0"
                onClick={() =>
                  navigate(
                    `/book/${primaryService.services!.slug}/${providerId}${fromPincode ? `?pincode=${fromPincode}` : ""}`
                  )
                }
              >
                Book {provider?.name?.split(" ")[0]} for {primaryService.services.name}
              </Button>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Services offered */}
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-card border border-border rounded-2xl p-6">
              <h2 className="text-xl font-semibold mb-4 text-foreground">Services Offered</h2>
              {loading ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-secondary rounded-xl p-4 animate-pulse">
                      <div className="h-4 bg-background/50 rounded mb-2 w-1/2" />
                      <div className="h-3 bg-background/50 rounded w-1/3" />
                    </div>
                  ))}
                </div>
              ) : services.length === 0 ? (
                <p className="text-muted-foreground text-sm">No services listed.</p>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {services.map((item, index) => (
                    <motion.div
                      key={`${item.services?.slug}-${index}`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="bg-secondary rounded-xl p-4 border border-border hover:border-primary/40 transition-colors cursor-pointer group"
                      onClick={() =>
                        item.services &&
                        navigate(
                          `/book/${item.services.slug}/${providerId}${fromPincode ? `?pincode=${fromPincode}` : ""}`
                        )
                      }
                    >
                      <p className="font-medium text-foreground mb-1">{item.services?.name}</p>
                      <p className="text-primary font-bold text-lg">₹{item.custom_price ?? 0}</p>
                      <p className="text-xs text-muted-foreground">per visit</p>
                      <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity mt-1 block">
                        Book now →
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
            </section>

            {/* Reviews */}
            <section className="bg-card border border-border rounded-2xl p-6">
              <h2 className="text-xl font-semibold mb-4 text-foreground">
                Reviews
                {reviews.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({reviews.length})
                  </span>
                )}
              </h2>

              {!loading && reviews.length === 0 && (
                <div className="text-center py-8">
                  <Star className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">No reviews yet. Be the first!</p>
                </div>
              )}

              <div className="space-y-4">
                {reviews.map((review, i) => (
                  <motion.div
                    key={review.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="bg-secondary rounded-xl p-4 border border-border"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <StarRating rating={review.rating ?? 5} />
                      {review.created_at && (
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(review.created_at), "d MMM yyyy")}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground">
                      {review.comment || "Great service!"}
                    </p>
                  </motion.div>
                ))}
              </div>
            </section>
          </div>

          {/* Sidebar — Quick Book */}
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-2xl p-5 sticky top-24">
              <h3 className="font-semibold text-foreground mb-4">Quick Book</h3>
              <div className="flex items-center gap-2 mb-4">
                <Star className="w-4 h-4 text-yellow-400 fill-current" />
                <span className="font-bold text-foreground">{provider?.rating ?? "—"}</span>
                <span className="text-muted-foreground text-sm">· {provider?.total_reviews ?? 0} reviews</span>
              </div>

              <div className="space-y-2 mb-6">
                {services.slice(0, 3).map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{item.services?.name}</span>
                    <span className="text-primary font-semibold">₹{item.custom_price}</span>
                  </div>
                ))}
              </div>

              {primaryService?.services ? (
                <Button
                  className="w-full bg-gradient-gold text-primary-foreground font-bold shadow-gold hover:opacity-90"
                  onClick={() =>
                    navigate(
                      `/book/${primaryService.services!.slug}/${providerId}${fromPincode ? `?pincode=${fromPincode}` : ""}`
                    )
                  }
                >
                  Book Now
                </Button>
              ) : (
                <Button className="w-full bg-gradient-gold text-primary-foreground font-bold" disabled>
                  No services available
                </Button>
              )}
            </div>
          </div>
        </div>
      </motion.main>
      <Footer />
    </div>
  );
};

export default ProviderDetail;
