import { describe, expect, it } from "vitest";
import { PHONE_BLOCK_MESSAGE, containsPhoneNumber } from "./phone-block";

describe("containsPhoneNumber: numbers that must be blocked", () => {
  const blocked = [
    "9876543210",
    "call me on 9876543210 please",
    "+91 98765 43210",
    "+91-9876543210",
    "091 9876543210",
    "98765-43210",
    "98 76 54 32 10",
    "9.8.7.6.5.4.3.2.1.0",
    "(987) 654 3210",
    "9876 5 4321 0",
    "nine eight seven six five four three two one zero",
    "Nine Eight Seven Six Five Four Three Two One Zero",
    "9876 five 43210",
    "९८७६५४३२१०",
    "૯૮૭૬૫૪૩૨૧૦",
    "nau aath saat chhe paanch char teen do ek shunya",
    "my number is 6000000000",
    "079 2345 6789",
    "whatsapp 8 1 2 3 4 5 6 7 8 9",
    "９８７６５４３２１０", // full-width digits
  ];
  for (const text of blocked) it(`blocks: ${text}`, () => expect(containsPhoneNumber(text)).toBe(true));
});

describe("containsPhoneNumber: everyday messages that must pass", () => {
  const allowed = [
    "",
    "Hello, I will come at 10:30",
    "Rs 1500 only",
    "₹2,50,000 is the total",
    "pincode 380015",
    "2026-11-05 10:30",
    "see you on 05/11/2026",
    "it will take 2 hours",
    "my phone is not working, one moment",
    "one two three",
    "Rs 2500 and 3500 for both",
    "flat 402, building 7, sector 21",
    "I am on the way, 5 minutes",
    "Please bring 2 taps and 4 washers",
    "the code is 4821",
    "the tap leaks since two days, maybe three",
    "okay",
    "I charge 1500, 2000 or 3000 depending on the work",
    "1500, 2000, 3000",
    "Rs 6000, 1500, 2500",
    "10 15 20 30 40 50",
    "parts: 450, 1200, 800, 3500",
    "order 1000200030004000",
  ];
  for (const text of allowed) it(`allows: ${JSON.stringify(text)}`, () => expect(containsPhoneNumber(text)).toBe(false));
});

describe("PHONE_BLOCK_MESSAGE", () => {
  it("tells people what to do instead", () => {
    expect(PHONE_BLOCK_MESSAGE).toMatch(/phone numbers/i);
    expect(PHONE_BLOCK_MESSAGE).toMatch(/call/i);
  });
});
