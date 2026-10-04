import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import {
  Star, MapPin, Briefcase, CheckCircle2, ArrowLeft, User,
  SortAsc, Filter, ChevronRight, AlertCircle, Clock
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import ProblemDescription, { ProblemDescriptionState } from "@/components/ProblemDescription";

type ServiceInfo = {
  id: string;
  name: string;
  description: string | null;
  base_price: number | null;
  duration_minutes: number | null;
  slug: string | null;
};

type Provider = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  experience_years: number | null;
  rating: number | null;
  total_reviews: number | null;
  total_jobs: number | null;
  is_verified: boolean | null;
  is_email_verified: boolean | null;
  is_online: boolean | null;    // alias shown in UI (mapped from is_available)
  is_available: boolean | null; // DB actual column
  pincodes: string[] | null;
  service_ids: string[] | null;
};

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

  const [service, setService] = useState<ServiceInfo | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("rating");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [subItems, setSubItems] = useState<Record<string, unknown>[]>([]);
  const [selectedSubItem, setSelectedSubItem] = useState<Record<string, unknown> | null>(null);

  // Problem description state — lifted up so provider cards show summary chips
  const draftId = useRef(getOrCreateDraftId()).current;
  const [problemState, setProblemState] = useState<ProblemDescriptionState>(EMPTY_STATE);

  // Show ProblemDescription when sub-item is selected OR service has no sub-items (once loaded)
  const showProblemDescription =
    (subItems.length === 0 && !loading && !error) || selectedSubItem !== null;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      // Guard against undefined slug
      if (!serviceSlug || serviceSlug === "undefined" || serviceSlug === "null") {
        setError("Invalid service URL. Please go back and select a service.");
        setLoading(false);
        return;
      }

      try {
        // Step 1: Fetch service — try slug first, fall back to id
        let svcData: ServiceInfo | null = null;

        const { data: bySlug } = await supabase
          .from("services")
          .select("id, name, description, base_price, duration_minutes, slug")
          .eq("slug", serviceSlug)
          .maybeSingle();

        if (bySlug) {
          svcData = bySlug;
        } else {
          const { data: byId } = await supabase
            .from("services")
            .select("id, name, description, base_price, duration_minutes, slug")
            .eq("id", serviceSlug)
            .maybeSingle();
          svcData = byId;
        }

        if (!svcData) {
          setError(`Service not found. Please go back and choose a service.`);
          setLoading(false);
          return;
        }
        setService(svcData);

        console.log("🔍 Fetching providers for service:", svcData.id, "city:", city);

        const { data: allProviders, error: pvdErr } = await (supabase as unknown as {
          from: (t: string) => { select: (cols: string) => { order: (col: string, opts: { ascending: boolean }) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }> } }
        }).from("public_providers")
          .select("*")
          .order("rating", { ascending: false });

        if (pvdErr) {
          console.error("❌ Provider query error:", pvdErr.message, pvdErr);
          setProviders([]);
          setLoading(false);
          return;
        }

        console.log("✅ All providers from DB:", allProviders);

        // Client-side filter by city
        const inCity = city
          ? (allProviders || []).filter((p) =>
              Array.isArray(p.pincodes) &&
              (p.pincodes as string[]).some((c) => c.toLowerCase() === city.toLowerCase())
            )
          : (allProviders || []);

        console.log(`📍 Providers in city ${city}:`, inCity);

        // Filter by online + service
        const filtered = inCity.filter((p) => {
          if (!p.is_online) return false;
          const lastSeen = p.updated_at ? new Date(p.updated_at as string).getTime() : 0;
          if (!lastSeen || Date.now() - lastSeen > 90_000) return false;
          if (!p.service_ids || (p.service_ids as string[]).length === 0) return true;
          return (p.service_ids as string[]).includes(svcData.id);
        });

        console.log("🎯 Providers after service filter:", filtered);

        // Normalize column names for UI
        const normalized = filtered.map((p) => ({
          ...p,
          full_name: p.full_name || p.name || "Provider",
          is_online: Boolean(p.is_available ?? p.is_online),
        })) as unknown as Provider[];

        setProviders(normalized);
      } catch {
        setError("Something went wrong. Please try again.");
      }
      setLoading(false);
    };

    fetchData();
    const refresh = window.setInterval(fetchData, 15_000);

    return () => window.clearInterval(refresh);
  }, [serviceSlug, city]);

  // Fetch sub-items once service is loaded
  useEffect(() => {
    if (!service?.id) return;
    (supabase as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: boolean) => {
              order: (col: string) => Promise<{ data: Record<string, unknown>[] | null }>;
            };
          };
        };
      };
    }).from("service_sub_items")
      .select("*")
      .eq("service_id", service.id)
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => {
        if (data) setSubItems(data);
      });
  }, [service?.id]);

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
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-20 bg-secondary/50 border-b border-border">
        <div className="container mx-auto py-3 flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
          <button onClick={() => navigate("/services?city=" + city)} className="hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Services
          </button>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground">{service?.name ?? serviceSlug}</span>
          {city && (
            <>
              <ChevronRight className="w-4 h-4" />
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-primary" />{city}</span>
            </>
          )}
        </div>
      </div>

      <div className="container mx-auto py-10 px-4">
        {service && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">{service.name}</h1>
            <p className="text-muted-foreground mb-4">{service.description}</p>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="text-primary font-semibold">Starts from ₹{service.base_price}</span>
              {service.duration_minutes && (
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> ~{service.duration_minutes} min</span>
              )}
            </div>
          </motion.div>
        )}

        {/* Sub-items selection */}
        {subItems.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-foreground mb-1">What do you need?</h2>
            <p className="text-sm text-muted-foreground mb-4">Select the specific service you need</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {subItems.map(item => (
                <button
                  key={item.id as string}
                  onClick={() => setSelectedSubItem((prev) => prev?.id === item.id ? null : item)}
                  className={`flex flex-col items-start p-4 rounded-2xl border text-left transition-all duration-200 ${
                    selectedSubItem?.id === item.id
                      ? 'border-primary/50 bg-primary/10 shadow-md'
                      : 'border-border bg-card hover:border-primary/20'
                  }`}
                >
                  <span className="text-2xl mb-2">{item.icon as string}</span>
                  <p className={`font-semibold text-sm ${
                    selectedSubItem?.id === item.id ? 'text-foreground' : 'text-muted-foreground'
                  }`}>
                    {item.name as string}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description as string}</p>
                  <p className="text-primary font-bold text-sm mt-2">₹{item.base_price as number}</p>
                  <p className="text-xs text-muted-foreground">{item.duration_minutes as number} mins</p>
                  {selectedSubItem?.id === item.id && (
                    <span className="text-xs text-primary font-semibold mt-1">✓ Selected</span>
                  )}
                </button>
              ))}
            </div>
            {selectedSubItem && (
              <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-xl flex items-center gap-2">
                <span className="text-lg">{selectedSubItem.icon as string}</span>
                <p className="text-sm text-foreground font-medium">
                  {selectedSubItem.name as string} · <span className="text-primary font-bold">₹{selectedSubItem.base_price as number}</span>
                  <span className="text-xs text-muted-foreground ml-2">{selectedSubItem.duration_minutes as number} mins</span>
                </p>
                <button
                  onClick={() => setSelectedSubItem(null)}
                  className="ml-auto text-muted-foreground hover:text-foreground text-xs"
                >
                  ✕ Clear
                </button>
              </div>
            )}
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

        {/* Sort & filter bar */}
        <div className="flex flex-wrap items-center gap-3 mb-8 pb-6 border-b border-border">
          <div className="flex items-center gap-2">
            <SortAsc className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Sort:</span>
          </div>
          {[
            { value: "rating", label: "Top Rated" },
            { value: "reviews", label: "Most Reviews" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSortBy(opt.value as SortOption)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                sortBy === opt.value
                  ? "bg-gradient-gold text-primary-foreground shadow-gold"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <button
              onClick={() => setVerifiedOnly(!verifiedOnly)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                verifiedOnly
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              ✅ Verified Only
            </button>
          </div>
        </div>

        {!loading && !error && (
          <p className="text-sm text-muted-foreground mb-6">
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
              <motion.div
                key={provider.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="bg-card border border-border rounded-2xl p-6 hover:border-primary/30 hover:shadow-gold transition-all duration-300"
              >
                <div className="flex flex-col md:flex-row gap-4">
                  <Avatar className="w-16 h-16 flex-shrink-0">
                    <AvatarFallback className="bg-gradient-gold text-primary-foreground text-xl font-bold">
                      {(provider.full_name || "P")[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold text-foreground">{provider.full_name}</h3>
                      {(provider.is_email_verified || provider.is_verified) && (
                        <Badge className="bg-green-500/10 text-green-400 border border-green-500/20 text-xs">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Verified Pro
                        </Badge>
                      )}
                      <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs">
                        🟢 Online
                      </Badge>
                    </div>

                    {provider.bio && (
                      <p className="text-muted-foreground text-sm mb-3 line-clamp-2">{provider.bio}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1 text-yellow-400">
                        <Star className="w-4 h-4 fill-current" />
                        <span className="font-semibold">{Number(provider.rating ?? 0).toFixed(1)}</span>
                        <span className="text-muted-foreground">({provider.total_reviews ?? 0} reviews)</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Briefcase className="w-4 h-4" />
                        {provider.total_jobs ?? 0} jobs
                      </span>
                      {provider.experience_years && (
                        <span>{provider.experience_years} yrs exp</span>
                      )}
                    </div>

                    {/* Attachment summary chip — visible when the customer added something */}
                    {attachmentSummary && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-2 text-xs text-primary/80 bg-primary/5 border border-primary/15 rounded-full px-2.5 py-0.5 inline-block"
                      >
                        {attachmentSummary} attached
                      </motion.p>
                    )}
                  </div>

                  <div className="flex flex-col items-start md:items-end justify-between gap-3">
                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary">
                        ₹{selectedSubItem ? selectedSubItem.base_price as number : service?.base_price}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedSubItem ? selectedSubItem.name as string : 'per visit'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          const base = `/book/${serviceSlug}/${provider.id}?city=${city}`;
                          const sub = selectedSubItem
                            ? `&sub_item=${selectedSubItem.id as string}&sub_name=${encodeURIComponent(selectedSubItem.name as string)}&sub_price=${selectedSubItem.base_price as number}`
                            : '';
                          const draftParam = `&draft=${draftId}`;
                          if (!user) {
                            navigate(`/auth?redirect=${encodeURIComponent(base + sub + draftParam)}`);
                          } else {
                            navigate(`${base}${sub}${draftParam}`);
                          }
                        }}
                        className="bg-gradient-gold text-primary-foreground font-semibold hover:opacity-90 shadow-gold"
                      >
                        Book Now
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default ServiceDetail;
