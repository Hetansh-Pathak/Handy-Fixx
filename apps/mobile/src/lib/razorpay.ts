/**
 * Razorpay checkout for wallet top-up. The native module is loaded lazily (it only exists in a development or
 * release build, never on web). The wallet is credited by the server webhook, not by this result: success here
 * only means "the payment went through, wait for the ledger to show it".
 */
import { Platform } from "react-native";

export type CheckoutOrder = {
  order_id: string;
  amount_paise: number;
  key_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
};

export type CheckoutResult = { status: "paid" } | { status: "cancelled" } | { status: "failed"; message: string };

export async function openCheckout(order: CheckoutOrder): Promise<CheckoutResult> {
  if (Platform.OS === "web") throw new Error("Top-up works in the HandyFix phone app.");
  const { default: RazorpayCheckout } = await import("react-native-razorpay");
  try {
    await RazorpayCheckout.open({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount_paise,
      currency: "INR",
      name: "HandyFix",
      description: "Wallet top-up",
      prefill: order.prefill,
      theme: { color: "#FBB614" },
    });
    return { status: "paid" };
  } catch (e) {
    const err = e as { code?: number | string; description?: string; error?: { description?: string; reason?: string } };
    // Razorpay reports a closed sheet as code 0 / "Payment cancelled by user".
    const text = err.description ?? err.error?.description ?? "";
    if (err.code === 0 || err.code === "0" || /cancel/i.test(text)) return { status: "cancelled" };
    return { status: "failed", message: text || "The payment did not go through. You were not charged." };
  }
}
