import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  checkPayable, hmacSha256Hex, safeEqual, toPaise, verifyCheckoutSignature, verifyWebhookSignature,
  type PayableBooking,
} from "../../../database/supabase/functions/_shared/razorpay";

const hex = (secret: string, msg: string) => createHmac("sha256", secret).update(msg).digest("hex");

describe("signatures", () => {
  it("matches Node's own HMAC-SHA256", async () => {
    expect(await hmacSha256Hex("k", "order|pay")).toBe(hex("k", "order|pay"));
  });

  it("accepts a correct checkout signature and rejects tampering", async () => {
    const sig = hex("key_secret", "order_A|pay_B");
    expect(await verifyCheckoutSignature("order_A", "pay_B", sig, "key_secret")).toBe(true);
    expect(await verifyCheckoutSignature("order_A", "pay_X", sig, "key_secret")).toBe(false);
    expect(await verifyCheckoutSignature("order_A", "pay_B", sig, "other_secret")).toBe(false);
    expect(await verifyCheckoutSignature("order_A", "pay_B", "", "key_secret")).toBe(false);
  });

  it("verifies the webhook over the raw body, byte for byte", async () => {
    const body = '{"event":"payment.captured"}';
    const sig = hex("whsec", body);
    expect(await verifyWebhookSignature(body, sig, "whsec")).toBe(true);
    expect(await verifyWebhookSignature(body + " ", sig, "whsec")).toBe(false);   // re-serialised JSON must fail
    expect(await verifyWebhookSignature(body, null, "whsec")).toBe(false);
    expect(await verifyWebhookSignature(body, sig, "")).toBe(false);
  });

  it("safeEqual handles different lengths", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("toPaise", () => {
  it("converts without float drift", () => {
    expect(toPaise(448)).toBe(44800);
    expect(toPaise(19.99)).toBe(1999);
    expect(toPaise(0.1 + 0.2)).toBe(30);
  });
  it("rejects nonsense", () => {
    for (const bad of [0, -5, NaN, Infinity]) expect(() => toPaise(bad)).toThrow();
  });
});

describe("checkPayable", () => {
  const base: PayableBooking = { id: "b", customer_id: "u1", provider_id: "p", status: "completed", payment_status: "unpaid", total_amount: 448 };
  it("allows the owner of a completed unpaid booking", () => expect(checkPayable(base, "u1")).toBeNull());
  it("accepts the legacy user_id owner", () => {
    expect(checkPayable({ ...base, customer_id: null, user_id: "u1" }, "u1")).toBeNull();
  });
  it("blocks everything else", () => {
    expect(checkPayable(null, "u1")).toBe("not_found");
    expect(checkPayable(base, "someone-else")).toBe("forbidden");
    expect(checkPayable({ ...base, status: "in_progress" }, "u1")).toBe("not_completed");
    expect(checkPayable({ ...base, payment_status: "paid" }, "u1")).toBe("already_paid");
    expect(checkPayable({ ...base, payment_status: "refunded" }, "u1")).toBe("refunded");
    expect(checkPayable({ ...base, total_amount: 0 }, "u1")).toBe("bad_amount");
    expect(checkPayable({ ...base, total_amount: null }, "u1")).toBe("bad_amount");
  });
});
