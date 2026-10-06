import { BadgeCheck, Briefcase, Star } from "lucide-react";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EASE } from "@/lib/motion";

type Props = {
  index: number;
  name: string;
  avatarUrl?: string | null;
  verified: boolean;
  rating: number;
  reviews: number;
  jobs: number;
  years?: number | null;
  bio?: string | null;
  price: number | null | undefined;
  priceLabel: string;
  attachmentSummary?: string;
  onView: () => void;
  onBook: () => void;
};

const ProviderCard = ({ index, name, avatarUrl, verified, rating, reviews, jobs, years, bio, price, priceLabel, attachmentSummary, onView, onBook }: Props) => (
  <motion.article
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, ease: EASE, delay: Math.min(index, 6) * 0.05 }}
    className="rounded-3xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
  >
    <button onClick={onView} className="press flex w-full items-center gap-3 text-left">
      <div className="relative">
        <Avatar className="h-14 w-14">
          <AvatarImage src={avatarUrl ?? undefined} alt={name} />
          <AvatarFallback className="bg-primary text-lg font-bold text-primary-foreground">{(name || "P")[0].toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-card bg-emerald-500" aria-label="Online" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h3 className="truncate text-base font-bold">{name}</h3>
          {verified && <BadgeCheck className="h-[18px] w-[18px] shrink-0 fill-gold text-background" aria-label="Verified" />}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[13px] text-muted-foreground">
          <span className="flex items-center gap-1 font-semibold text-foreground">
            <Star className="h-3.5 w-3.5 fill-gold text-gold" />{rating.toFixed(1)}
            <span className="font-normal text-muted-foreground">({reviews})</span>
          </span>
          <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{jobs} jobs</span>
          {years ? <span>{years} yrs</span> : null}
        </div>
      </div>
    </button>

    {bio && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{bio}</p>}
    {attachmentSummary && (
      <p className="mt-3 inline-block rounded-full bg-accent px-3 py-1 text-xs font-semibold">{attachmentSummary} attached</p>
    )}

    <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/70 pt-4">
      <div>
        <p className="text-xl font-extrabold leading-none">₹{price ?? 0}</p>
        <p className="mt-1 max-w-[140px] truncate text-xs text-muted-foreground">{priceLabel}</p>
      </div>
      <button onClick={onBook} className="press h-12 rounded-xl bg-primary px-7 text-sm font-bold text-primary-foreground">
        Book
      </button>
    </div>
  </motion.article>
);

export default ProviderCard;
