/**
 * The PDF (p.4, p.12) says phone numbers typed in chat are detected and blocked, so a customer and a pro do not
 * move off the app. This checks a message for something that reads as a phone number: digits split by spaces or
 * dashes, digits written as words ("nine eight seven…", also Hindi/Gujarati), and Devanagari or Gujarati digits.
 *
 * It aims at 10-digit Indian mobile numbers and landlines with an STD code. Everyday numbers (prices, times,
 * dates, pincodes, house numbers) are short or separated by words, so they pass. A chat can always be tricked by
 * someone determined; the answer to that in the PDF is to make the app worth staying in, not to chase every trick.
 */

export const PHONE_BLOCK_MESSAGE =
  "For your safety, phone numbers cannot be shared in chat. You can call each other from the Call button once the booking is confirmed.";

const DIGIT_WORDS: Record<string, string> = {
  zero: "0", shunya: "0",
  one: "1", ek: "1",
  two: "2", do: "2",
  three: "3", teen: "3",
  four: "4", char: "4", chaar: "4",
  five: "5", panch: "5", paanch: "5",
  six: "6", chhe: "6", chah: "6",
  seven: "7", saat: "7",
  eight: "8", aath: "8",
  nine: "9", nau: "9", nav: "9",
};

const WORDS = Object.keys(DIGIT_WORDS).sort((a, b) => b.length - a.length).join("|");
const UNIT = `\\d|(?<![a-z])(?:${WORDS})(?![a-z])`;
const SEPARATORS = "[\\s\\-.,()/_+*#]*";
const SEQUENCE = new RegExp(`(?:${UNIT})(?:${SEPARATORS}(?:${UNIT}))*`, "g");
const UNIT_RE = new RegExp(UNIT, "g");

/** Devanagari (०-९) and Gujarati (૦-૯) digits to 0-9; full-width digits are handled by NFKC. */
function toAsciiDigits(text: string): string {
  return text.replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x0966)).replace(/[૦-૯]/g, (c) => String(c.charCodeAt(0) - 0x0ae6));
}

export function containsPhoneNumber(text: string): boolean {
  const normalised = toAsciiDigits(text.normalize("NFKC").toLowerCase());
  for (const match of normalised.matchAll(SEQUENCE)) {
    const digits = (match[0].match(UNIT_RE) ?? []).map((u) => DIGIT_WORDS[u] ?? u).join("");
    if (digits.length < 10) continue;
    // A mobile starts with 6-9 and has 10 digits (with or without 91 / 0 in front); a landline is 0 + STD + number.
    if (/[6-9]\d{9}/.test(digits) || /0\d{9,10}/.test(digits)) return true;
  }
  return false;
}
