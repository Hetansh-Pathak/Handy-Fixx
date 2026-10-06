import { CalendarDays, CreditCard, Loader2, MapPin, MessageCircle, Navigation, Star } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  CANCELLABLE_STATUSES, CHATTABLE_STATUSES, TONE_CHIP, liveLine, statusMeta, type BookingItem,
} from "@/lib/bookings";
import { formatSchedule } from "@/lib/dates";
import { cn } from "@/lib/utils";

interface Props {
  item: BookingItem;
  cancelling: boolean;
  onOpen: () => void;
  onTrack: () => void;
  onChat: () => void;
  onCancel: () => void;
  onReview: () => void;
  onRebook: () => void;
}

const BookingCard = ({ item, cancelling, onOpen, onTrack, onChat, onCancel, onReview, onRebook }: Props) => {
  const meta = statusMeta(item.status);
  const live = liveLine(item);
  const isLive = item.status === "on_the_way" || item.status === "in_progress";
  const canCancel = CANCELLABLE_STATUSES.includes(item.status);
  const canChat = CHATTABLE_STATUSES.includes(item.status);
  const canRebook = Boolean(item.serviceSlug && item.providerId) && (item.status === "completed" || item.status === "cancelled");
  const needsPayment = item.status === "completed" && (item.paymentStatus === "unpaid" || item.paymentStatus === "pending") && (item.totalAmount ?? 0) > 0;
  const ref = `#HF-${item.id.slice(0, 8).toUpperCase()}`;

  return (
    <article className="rounded-3xl border border-border bg-card p-4">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[17px] font-extrabold tracking-tight">{item.serviceName}</h3>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{ref}</p>
          </div>
          <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", TONE_CHIP[meta.tone])}>{meta.label}</span>
        </div>

        {live && (
          <p
            className={cn(
              "mt-3 rounded-xl px-3 py-2 text-sm font-semibold",
              item.status === "pending" ? "bg-accent text-foreground" : "bg-primary text-primary-foreground",
            )}
          >
            {live}
          </p>
        )}

        <p className="mt-3 flex items-center gap-2 text-[15px] font-semibold">
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {formatSchedule(item.scheduledDate, item.scheduledTime)}
        </p>
        {item.place && (
          <p className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.place}</span>
          </p>
        )}

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/70 pt-3">
          <span className="flex min-w-0 items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="bg-primary text-[11px] font-bold text-primary-foreground">
                {item.providerName.trim().slice(0, 1).toUpperCase() || "P"}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-sm font-semibold">{item.providerName}</span>
          </span>
          {item.totalAmount != null && (
            <span className="flex shrink-0 items-center gap-2">
              {item.status === "completed" && item.paymentStatus === "paid" && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">Paid</span>
              )}
              <span className="text-[15px] font-extrabold">₹{Number(item.totalAmount).toLocaleString("en-IN")}</span>
            </span>
          )}
        </div>
      </button>

      {(isLive || canChat || canCancel || needsPayment || item.status === "completed" || canRebook) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isLive && (
            <Button className="flex-[2]" onClick={onTrack}>
              <Navigation /> Track live
            </Button>
          )}

          {canChat && (
            <Button variant="secondary" className="flex-1" onClick={onChat}>
              <MessageCircle /> Chat
            </Button>
          )}

          {canCancel && (
            <Button
              variant="outline"
              className="flex-1 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
              onClick={onCancel}
              disabled={cancelling}
            >
              {cancelling ? <Loader2 className="animate-spin" /> : null}
              Cancel
            </Button>
          )}

          {needsPayment && (
            <Button className="w-full basis-full bg-primary text-primary-foreground" onClick={onOpen}>
              <CreditCard /> Pay ₹{Number(item.totalAmount).toLocaleString("en-IN")}
            </Button>
          )}

          {item.status === "completed" &&
            (item.rating == null ? (
              <Button className="flex-[2] bg-gold text-gold-foreground hover:bg-gold/90" onClick={onReview}>
                <Star /> Rate your pro
              </Button>
            ) : (
              <p className="flex flex-1 items-center gap-1 text-sm font-semibold text-muted-foreground" aria-label={`You rated ${item.rating} out of 5`}>
                You rated
                <span className="ml-1 inline-flex items-center gap-0.5 text-foreground">
                  <Star className="h-4 w-4 fill-gold text-gold" aria-hidden="true" /> {item.rating}
                </span>
              </p>
            ))}

          {canRebook && (
            <Button variant="secondary" className="flex-1" onClick={onRebook}>
              Book again
            </Button>
          )}
        </div>
      )}
    </article>
  );
};

export default BookingCard;
