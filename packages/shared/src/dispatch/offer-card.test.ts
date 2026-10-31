import { describe, expect, it } from "vitest";
import { offerView } from "./offer";
import { acceptOutcome, offerCardAccess, offerWhenLine, offerWhereLine, readOfferCard, type OfferCard } from "./offer-card";

const raw = {
  booking_id: "b1", offer_status: "offered", offered_at: "2026-10-31T10:00:00Z", ring: 1, approx_km: "1.5",
  service_name: "Plumbing", sub_item_name: "Tap repair", locality: "Jamnagar, 361008", booking_date: "2026-10-31", booking_time: "15:30:00",
  note: "  Kitchen tap  ", price: "199", fee: "15", launch_active: false, wallet_balance: "100.00",
};
const card = readOfferCard(raw)!;

describe("offer card", () => {
  it("reads the server's limited card (numbers as strings, trimmed text)", () => {
    expect(card).toMatchObject({ bookingId: "b1", status: "offered", approxKm: 1.5, serviceName: "Tap repair", note: "Kitchen tap", price: 199, fee: 15, walletBalance: 100 });
    expect(readOfferCard({ offer_status: "offered" })).toBeNull();
    expect(readOfferCard({ booking_id: "x", offer_status: "nonsense" })?.status).toBe("expired");
  });
  it("has no address, name or phone fields at all", () => {
    expect(Object.keys(card)).not.toEqual(expect.arrayContaining(["address"]));
    expect(JSON.stringify(card)).not.toMatch(/customer|phone|address/i);
  });
  it("where: about-distance and locality only", () => {
    expect(offerWhereLine(card)).toBe("about 1.5 km away · Jamnagar, 361008");
    expect(offerWhereLine({ approxKm: null, locality: null })).toBe("Near you");
  });
  it("when: 'Now' within the hour, else the booked slot", () => {
    expect(offerWhenLine(card, new Date("2026-10-31T15:00:00"))).toBe("Now");
    expect(offerWhenLine(card, new Date("2026-10-31T10:00:00"))).not.toBe("Now");
    expect(offerWhenLine({ bookingDate: null, bookingTime: null }, new Date())).toBe("Now");
  });
});

describe("accept button from the database's own numbers", () => {
  const with_ = (o: Partial<OfferCard>) => ({ ...card, ...o });
  it("enough balance: Accept", () => {
    expect(offerCardAccess(card)).toEqual({ canAccept: true, fee: 15, feeWaived: false });
    expect(offerView("offered", offerCardAccess(card)).kind).toBe("accept");
  });
  it("too low or negative: 'Top up ₹49 to accept'", () => {
    expect(offerCardAccess(with_({ walletBalance: 3 }))).toEqual({ canAccept: false, fee: 15, topUp: 49 });
    expect(offerView("offered", offerCardAccess(with_({ walletBalance: -60 })))).toMatchObject({ kind: "top_up", button: "Top up ₹99 to accept" });
  });
  it("launch period: Accept even with an empty wallet, fee waived", () => {
    expect(offerCardAccess(with_({ walletBalance: 0, launchActive: true }))).toEqual({ canAccept: true, fee: 15, feeWaived: true });
  });
});

describe("what the pro sees after tapping Accept", () => {
  it("won", () => expect(acceptOutcome({ result: "accepted", booking_id: "b1" }, "b1")).toEqual({ kind: "accepted", bookingId: "b1" }));
  it("someone else was first / the customer cancelled / the search ended", () => {
    expect(acceptOutcome({ result: "taken" }, "b1")).toEqual({ kind: "closed", status: "taken", message: "Taken by another pro" });
    expect(acceptOutcome({ result: "withdrawn" }, "b1")).toMatchObject({ kind: "closed", status: "withdrawn" });
    expect(acceptOutcome({ result: "expired" }, "b1")).toEqual({ kind: "closed", status: "expired", message: "Expired" });
  });
  it("the wallet check refused: the database's message with ₹", () => {
    expect(acceptOutcome({ result: "top_up", message: "Wallet below the fee. Top up Rs 100 to accept." }, "b1"))
      .toEqual({ kind: "top_up", message: "Wallet below the fee. Top up ₹100 to accept." });
  });
  it("anything unexpected is never treated as a win", () => {
    expect(acceptOutcome(null, "b1").kind).toBe("closed");
    expect(acceptOutcome({ result: "not_offered" }, "b1").kind).toBe("closed");
    expect(acceptOutcome({ result: "refused", message: "Provider is not yet approved to accept bookings." }, "b1")).toEqual({ kind: "refused", message: "Provider is not yet approved to accept bookings." });
  });
});
