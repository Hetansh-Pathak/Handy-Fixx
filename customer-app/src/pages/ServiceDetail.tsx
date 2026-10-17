import { useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/contexts/AppContext";
import { isFresh, servesArea } from "@/lib/serviceArea";
import { providersQuery, serviceQuery, subItemsQuery, type ProviderRow } from "@/lib/queries";
import { motion } from "framer-motion";
import {
  MapPin, CheckCircle2, ArrowLeft, User, AlertCircle, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import ProviderCard from "@/components/service/ProviderCard";
import ProblemDescription, { ProblemDescriptionState } from "@/components/ProblemDescription";

type Provider = ProviderRow;

type SortOption = "rating" | "price_asc" | "reviews";

/** Generate or restore a uuid per service-page session */
function getOrCreateDraftId(): string {
  const KEY = "hf_draft_id";
  const existing = sessionStorage.getItem(KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  sessionStorage.setItem(KEY, id);
  return id;
}

const EMPTY_STATE: ProblemDescriptionState = { audio: null, images: [], note: "" };

const ServiceDetail = () => {
  const { serviceSlug } = useParams<{ serviceSlug: string }>();
  const [searchParams] = useSearchParams();
  const city = searchParams.get("city") || searchParams.get("pincode") || "";
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useApp();

  const serviceQ = useQuery(serviceQuery(serviceSlug ?? ""));
  const providersQ = useQuery({ ...providersQuery(), enabled: Boolean(serviceQ.data) });
  const service = serviceQ.data ?? null;
  // `loading` only covers the first load; the 15s background refresh no longer blanks the page.
  const loading = serviceQ.isPending || (Boolean(serviceQ.data) && providersQ.isPending);
  const error = serviceQ.error instanceof Error ? serviceQ.error.message : null;
  const [sortBy, setSortBy] = useState<SortOption>("rating");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const subItemsQ = useQuery(subItemsQuery(service?.id));
  const subItems = subItemsQ.data ?? [];
  const [selectedSubItem, setSelectedSubItem] = useState<Record<string, unknown> | null>(null);

  // Problem description state — lifted up so provider cards show summary chips
  const draftId = useRef(getOrCreateDraftId()).current;
  const [problemState, setProblemState] = useState<ProblemDescriptionState>(EMPTY_STATE);

  // Show ProblemDescription when sub-item is selected OR service has no sub-items (once loaded)
  const showProblemDescription =
    (subItems.length === 0 && !loading && !error) || selectedSubItem !== null;

  // Online, in-city, offers-this-service. Re-evaluated on every refresh so "online" never goes stale.
  const providers = useMemo<Provider[]>(() => {
    if (!service) return [];
    return (providersQ.data ?? [])
      .filter((p) => {
        if (!servesArea(p.pincodes, city, profile?.city)) return false;
        if (!p.is_online) return false;
        if (!isFresh(p.updated_at)) return false;
        // A provider who has not ticked any service offers none; showing them under every service put plumbers
        // in front of people booking an electrician.
        return Array.isArray(p.service_ids) && p.service_ids.includes(service.id);
      })
      .map((p) => ({ ...p, full_name: p.full_name || p.name || "Provider", is_online: Boolean(p.is_online) }));
  }, [providersQ.data, service, city, profile?.city]);

  const sorted = [...providers]
    .filter((p) => !verifiedOnly || p.is_email_verified || p.is_verified)
    .sort((a, b) => {
      if (sortBy === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
      if (sortBy === "reviews") return (b.total_reviews ?? 0) - (a.total_reviews ?? 0);
      return 0;
    });

  // Build attachment summary chip text for provider cards
  const attachmentSummary = (() => {
    const parts: string[] = [];
    if (problemState.audio) parts.push("🎤 Voice note");
    if (problemState.images.length > 0) parts.push(`📷 ${problemState.images.length} photo${problemState.images.length > 1 ? "s" : ""}`);
    return parts.join(" · ");
  })();

  return (
    <div className="min-h-dvh bg-background">

      {/* Sticky back bar */}
      <div className="sticky top-0 z-30 border-b border-border/60 bg-background/90 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-2xl md:pt-20">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="press flex h-11 w-11 items-center justify-center rounded-full hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="truncate text-base font-bold">{service?.name ?? serviceSlug}</span>
          {city && (
            <span className="ml-auto flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
              <MapPin className="h-3.5 w-3.5" />{city}
            </span>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-5 py-6">
        {service && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="mb-8">
            <h1 className="mb-2 text-[32px] font-extrabold leading-tight tracking-tight">{service.name}</h1>
            <p className="mb-4 text-[15px] leading-relaxed text-muted-foreground">{service.description}</p>
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              <span className="rounded-full bg-gold px-3 py-1.5 text-gold-foreground">From ₹{service.base_price}</span>
              {service.duration_minutes && (
                <span className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5"><Clock className="h-3.5 w-3.5" /> ~{service.duration_minutes} min</span>
              )}
            </div>
          </motion.div>
        )}

        {/* Sub-items selection */}
        {subItems.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-1 text-xl font-extrabold tracking-tight">What do you need?</h2>
            <p className="mb-4 text-sm text-muted-foreground">Pick the exact job so pricing is accurate</p>
            <div className="grid grid-cols-2 gap-3">
              {subItems.map((item) => {
                const on = selectedSubItem?.id === item.id;
                return (
                  <button
                    key={item.id as string}
                    onClick={() => setSelectedSubItem((prev) => (prev?.id === item.id ? null : item))}
                    aria-pressed={on}
                    className={`press relative flex flex-col items-start rounded-2xl border-2 p-4 text-left transition-colors duration-200 ${
                      on ? "border-foreground bg-secondary" : "border-transparent bg-secondary/60"
                    }`}
                  >
                    {on && (
                      <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-gold-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <span className="mb-2 text-2xl">{item.icon as string}</span>
                    <p className="text-sm font-bold">{item.name as string}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description as string}</p>
                    <p className="mt-3 text-sm font-extrabold">₹{item.base_price as number}
                      <span className="ml-1.5 text-xs font-medium text-muted-foreground">{item.duration_minutes as number} min</span>
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Problem description — shown when sub-item selected OR no sub-items */}
        {showProblemDescription && (
          <ProblemDescription
            userId={user?.id ?? null}
            draftId={draftId}
            state={problemState}
            onChange={setProblemState}
          />
        )}

        {/* Sort & filter chips */}
        <div className="no-scrollbar -mx-5 mb-5 flex items-center gap-2 overflow-x-auto px-5">
          {([["rating", "Top rated"], ["reviews", "Most reviews"]] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setSortBy(value)}
              className={`press shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                sortBy === value ? "bg-primary text-primary-foreground" : "bg-secondary"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setVerifiedOnly(!verifiedOnly)}
            className={`press flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              verifiedOnly ? "bg-gold text-gold-foreground" : "bg-secondary"
            }`}
          >
            <CheckCircle2 className="h-4 w-4" /> Verified only
          </button>
        </div>

        {!loading && !error && (
          <p className="mb-4 text-sm font-medium text-muted-foreground">
            {sorted.length} professional{sorted.length !== 1 ? "s" : ""} found
            {city && ` in ${city}`}
          </p>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card border border-border rounded-2xl p-6 animate-pulse">
                <div className="flex gap-4">
                  <div className="w-16 h-16 rounded-full bg-secondary flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 bg-secondary rounded w-1/3" />
                    <div className="h-4 bg-secondary rounded w-1/2" />
                    <div className="h-3 bg-secondary rounded w-3/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="text-center py-20">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <p className="text-foreground font-medium mb-2">{error}</p>
            <Button onClick={() => navigate(`/services?city=${city}`)} variant="outline" className="border-border mt-4">
              ← Back to Services
            </Button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && sorted.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
            <User className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-30" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No professionals available</h3>
            <p className="text-muted-foreground mb-2">
              {city
                ? `No ${service?.name} professionals are online in ${city} right now.`
                : `No ${service?.name} professionals are online right now.`}
            </p>
            <p className="text-sm text-muted-foreground mb-6">Try a nearby city or check back later.</p>
            <Button onClick={() => navigate(`/services?city=${city}`)} variant="outline" className="border-border">
              Browse other services
            </Button>
          </motion.div>
        )}

        {/* Provider cards */}
        {!loading && !error && sorted.length > 0 && (
          <div className="space-y-4">
            {sorted.map((provider, i) => (
              <ProviderCard
                key={provider.id}
                index={i}
                name={provider.full_name || "Provider"}
                avatarUrl={provider.avatar_url}
                verified={Boolean(provider.is_email_verified || provider.is_verified)}
                rating={Number(provider.rating ?? 0)}
                reviews={provider.total_reviews ?? 0}
                jobs={provider.total_jobs ?? 0}
                years={provider.experience_years}
                bio={provider.bio}
                price={(selectedSubItem ? selectedSubItem.base_price : service?.base_price) as number | null | undefined}
                priceLabel={selectedSubItem ? (selectedSubItem.name as string) : "per visit"}
                attachmentSummary={attachmentSummary}
                onView={() => navigate(`/provider/${provider.id}?serviceSlug=${serviceSlug ?? ""}${city ? `&pincode=${city}` : ""}`)}
                onBook={() => {
                  const base = `/book/${serviceSlug}/${provider.id}?city=${city}`;
                  const sub = selectedSubItem
                    ? `&sub_item=${selectedSubItem.id as string}&sub_name=${encodeURIComponent(selectedSubItem.name as string)}`
                    : "";
                  const target = `${base}${sub}&draft=${draftId}`;
                  navigate(user ? target : `/auth?redirect=${encodeURIComponent(target)}`);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ServiceDetail;
