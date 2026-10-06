import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, BadgeCheck, ChevronRight, MapPin, Star } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { providerDetailQuery } from "@/lib/queries";

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
  services: { slug: string; name: string; icon_name: string | null; base_price?: number | null } | null;
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
          className={`w-4 h-4 ${star <= rating ? "fill-gold text-gold" : "text-muted-foreground/30"}`}
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

  const { data, isPending: loading } = useQuery(providerDetailQuery(providerId ?? ""));
  const provider = (data?.provider ?? null) as ProviderDetails | null;
  const services = (data?.services ?? []) as ServiceOffer[];
  const reviews = (data?.reviews ?? []) as ReviewRow[];

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

  const book = (slug: string) =>
    navigate(`/book/${slug}/${providerId}${fromPincode ? `?pincode=${fromPincode}` : ""}`);
  const stat = (value: string, label: string) => (
    <div className="flex-1 text-center">
      <p className="text-lg font-extrabold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );

  return (
    <div className="min-h-dvh bg-background pb-32">
      <div className="sticky top-0 z-30 bg-background/90 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-2xl md:pt-20">
        <button onClick={() => navigate(-1)} aria-label="Back" className="press flex h-11 w-11 items-center justify-center rounded-full hover:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>

      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-2xl px-5"
      >
        {/* Hero */}
        <div className="flex flex-col items-center text-center">
          <Avatar className="h-28 w-28 ring-4 ring-gold/30">
            <AvatarImage src={provider?.avatar_url ?? undefined} alt={provider?.name ?? ""} />
            <AvatarFallback className="bg-primary text-3xl font-bold text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div className="mt-4 flex items-center gap-2">
            <h1 className="text-[26px] font-extrabold tracking-tight">{provider?.name}</h1>
            {(provider?.is_email_verified || provider?.is_verified) && <BadgeCheck className="h-6 w-6 fill-gold text-background" aria-label="Verified" />}
          </div>
          {provider?.city && (
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{provider.city}</p>
          )}
          {provider?.bio && <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">{provider.bio}</p>}
        </div>

        {/* Stats */}
        <div className="mt-6 flex divide-x divide-border rounded-2xl bg-secondary py-4">
          {stat(provider?.rating ? Number(provider.rating).toFixed(1) : "–", `${provider?.total_reviews ?? 0} reviews`)}
          {stat(String(provider?.total_jobs ?? 0), "jobs done")}
          {stat(provider?.experience_years ? `${provider.experience_years} yrs` : "–", "experience")}
        </div>

        {/* Services */}
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-extrabold tracking-tight">Services</h2>
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-secondary" />)}</div>
          ) : services.length === 0 ? (
            <p className="text-sm text-muted-foreground">No services listed.</p>
          ) : (
            <ul className="divide-y divide-border/70">
              {services.map((item, index) => (
                <li key={`${item.services?.slug}-${index}`}>
                  <button
                    onClick={() => item.services && book(item.services.slug)}
                    className="press flex w-full items-center justify-between py-4 text-left"
                  >
                    <span className="font-semibold">{item.services?.name}</span>
                    <span className="flex items-center gap-1 font-extrabold">{item.services?.base_price ? `From ₹${item.services.base_price}` : "View"}<ChevronRight className="h-4 w-4 text-muted-foreground" /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Reviews */}
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-extrabold tracking-tight">
            Reviews{reviews.length > 0 && <span className="ml-2 text-sm font-medium text-muted-foreground">{reviews.length}</span>}
          </h2>
          {!loading && reviews.length === 0 && (
            <div className="rounded-2xl bg-secondary py-10 text-center">
              <Star className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No reviews yet</p>
            </div>
          )}
          <div className="space-y-3">
            {reviews.map((review, i) => (
              <motion.div
                key={review.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 6) * 0.05, duration: 0.35 }}
                className="rounded-2xl border border-border p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <StarRating rating={review.rating ?? 5} />
                  {review.created_at && <span className="text-xs text-muted-foreground">{format(new Date(review.created_at), "d MMM yyyy")}</span>}
                </div>
                <p className="text-sm leading-relaxed">{review.comment || "Great service!"}</p>
              </motion.div>
            ))}
          </div>
        </section>
      </motion.main>

      {/* Sticky book bar (sits above the tab bar on phones) */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t border-border/60 bg-background/90 px-5 py-3 backdrop-blur-2xl md:bottom-0">
        <button
          disabled={!primaryService?.services}
          onClick={() => primaryService?.services && book(primaryService.services.slug)}
          className="press mx-auto flex h-14 w-full max-w-2xl items-center justify-center rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-40"
        >
          {primaryService?.services ? `Book ${provider?.name?.split(" ")[0]} · ${primaryService.services.name}` : "No services available"}
        </button>
      </div>
    </div>
  );
};

export default ProviderDetail;
