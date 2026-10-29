/**
 * Razorpay checkout for wallet top-up. The native module is loaded lazily (it only exists in a development or
 * release build, never on web). The wallet is credited by the server webhook, not by this result: success here
 * only means "the payment went through, wait for the ledger to show it".
 */
import { checkoutFailure } from "@handyfix/shared";
import { Platform } from "react-native";

export type CheckoutOrder = {
  order_id: string;
  amount_paise: number;
  key_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
};

/** What Razorpay hands back after a successful payment (checked on the server by verify-wallet-payment). */
export type CheckoutPayment = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

export type CheckoutResult =
  | { status: "paid"; payment: CheckoutPayment | null }
  | { status: "cancelled" }
  | { status: "failed"; message: string };

/** What the Razorpay sheet says, and the message on web (Checkout is a native module). Defaults = wallet recharge. */
export type CheckoutOptions = { description?: string; webMessage?: string };

export async function openCheckout(order: CheckoutOrder, options: CheckoutOptions = {}): Promise<CheckoutResult> {
  if (Platform.OS === "web") throw new Error(options.webMessage ?? "Top-up works in the HandyFix phone app.");
  const { default: RazorpayCheckout } = await import("react-native-razorpay");
  try {
    const data: Partial<CheckoutPayment> = await RazorpayCheckout.open({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount_paise,
      currency: "INR",
      name: "apnabanda",
      description: options.description ?? "Wallet recharge",
      prefill: order.prefill,
      theme: { color: "#1F5BFF" },
    });
    const payment = data?.razorpay_payment_id && data.razorpay_signature
      ? { razorpay_order_id: data.razorpay_order_id ?? order.order_id, razorpay_payment_id: data.razorpay_payment_id, razorpay_signature: data.razorpay_signature }
      : null;
    return { status: "paid", payment };
  } catch (e) {
    // Closed sheet = cancelled; Android sends the reason as a JSON string, which must never reach the screen.
    return checkoutFailure(e);
  }
}
