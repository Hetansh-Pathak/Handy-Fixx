import { callEdge, formatInr, onlinePaymentBlock, payableAmountPaise, paymentState, rechargeStartError } from "@handyfix/shared";
import { CircleCheck, CreditCard, Wallet } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/text";
import { Button, Card, ErrorBanner, InfoBanner, StatusPill, TextLink, WarnBanner } from "@/components/ui";
import { getSupabase } from "@/lib/supabase";
import { openCheckout, type CheckoutOrder } from "@/lib/razorpay";
import { useThemeColors } from "@/theme/theme";
import type { BookingRow } from "./booking-api";

/**
 * Asks the server for a Razorpay order for this booking. The server works out the amount from the database
 * (booking_payable_paise); the app never sends an amount and never marks anything paid.
 */
export function createBookingPaymentOrder(bookingId: string): Promise<CheckoutOrder> {
  return callEdge<CheckoutOrder>(getSupabase(), "create-booking-payment-order", { booking_id: bookingId });
}

/**
 * Asks the server whether Razorpay's signature is genuine, so the screen can say "verified" at once. It never marks
 * anything paid (only the webhook does). Null when the function is not deployed yet or cannot be reached.
 */
export async function verifyBookingPayment(ids: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }): Promise<{ verified: boolean; paid: boolean } | null> {
  try {
    return await callEdge<{ verified: boolean; paid: boolean }>(getSupabase(), "verify-booking-payment", ids);
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * "Pay ₹X online" on a completed booking (owner decision 2026-10-30: pay in the app like Rapido, or pay the pro
 * directly). After Razorpay says the payment went through, the screen only WAITS for the server to set
 * payment_status = paid (Section 2 webhook); it polls the booking and never changes it.
 */
export function BookingPayment({ booking, pro, serviceName, pendingExtras, refetch }: {
  booking: BookingRow;
  pro: string;
  serviceName: string;
  pendingExtras: number;
  /** Re-reads the booking and returns its latest payment_status. */
  refetch: () => Promise<string | null | undefined>;
}) {
  const colors = useThemeColors();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payDirect, setPayDirect] = useState(false);

  const state = paymentState(booking.payment_status);
  const block = onlinePaymentBlock(booking, pendingExtras);
  const amount = formatInr((payableAmountPaise(booking) ?? 0) / 100);

  if (state === "paid") {
    return (
      <Card>
        <View className="flex-row items-center gap-2">
          <CircleCheck size={22} color={colors.ok} />
          <Text className="flex-1 text-lg font-bold text-fg">Paid</Text>
          <StatusPill label={formatInr(Number(booking.total_amount ?? 0))} tone="ok" />
        </View>
        <Text className="text-sm text-muted">This booking is paid. Do not pay {pro} again.</Text>
      </Card>
    );
  }
  if (state === "pending") return <WarnBanner message="Your payment is being confirmed. Do not pay the pro again; this updates by itself." />;
  if (state === "refunded" || state === "partially_refunded") {
    return <InfoBanner message={`Your online payment was ${state === "refunded" ? "refunded" : "partly refunded"}. Contact support if anything is still unclear.`} />;
  }
  if (block === "extra_waiting") return <InfoBanner message="Approve or decline the extra work first. Then you can pay online." />;
  if (block !== null) return null;

  const pay = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const order = await createBookingPaymentOrder(booking.id);
      const result = await openCheckout(order, {
        description: `Payment for ${serviceName}`,
        webMessage: "Online payment works in the apnabanda phone app. You can pay the pro directly.",
      });
      if (result.status === "cancelled") { setNotice("Payment cancelled. Nothing was charged."); return; }
      if (result.status === "failed") { setError(result.message); return; }
      setNotice("Payment received, confirming…");
      // The answer only speeds up the message; the screen still waits for payment_status from the database.
      const check = result.payment ? await verifyBookingPayment(result.payment) : null;
      if (check && !check.verified) setError("We could not confirm this payment yet. If money left your account, it will show here within a few minutes.");
      else if (check?.verified) setNotice("Payment verified, updating your booking…");
      for (let i = 0; i < 15; i += 1) {
        await sleep(2000);
        if (paymentState(await refetch()) === "paid") { setNotice(null); setError(null); return; }
      }
      setNotice(`Payment received. Confirmation can take a few minutes; you will not be charged twice. Do not pay ${pro} again.`);
    } catch (e) {
      setError(rechargeStartError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Text className="text-lg font-bold text-fg">How do you want to pay?</Text>
      <ErrorBanner message={error} />
      <InfoBanner message={notice} />
      {payDirect ? (
        <>
          <View className="flex-row items-center gap-2">
            <Wallet size={20} color={colors.brand} />
            <Text className="flex-1 text-base text-fg">Pay {pro} {amount} by cash or UPI.</Text>
          </View>
          <TextLink label="Pay online instead" onPress={() => setPayDirect(false)} />
        </>
      ) : (
        <>
          <Text className="text-sm text-muted">Pay in the app by UPI, card or net banking. No extra charge.</Text>
          <Button label={`Pay ${amount} online`} icon={CreditCard} loading={busy} onPress={() => void pay()} />
          <Button label={`I'll pay ${pro} directly`} variant="secondary" disabled={busy} onPress={() => setPayDirect(true)} />
        </>
      )}
    </Card>
  );
}
