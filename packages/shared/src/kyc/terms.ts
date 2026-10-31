/**
 * HandyFix Pro Partner Agreement shown at the last KYC step and in Help.
 * Wording follows the business model in HandyFix-complete.pdf (flat fee from the wallet, customer pays the pro directly).
 * Bump `TERMS_VERSION` in kyc.ts whenever the meaning of a clause changes: the version a pro agreed to is stored with the consent.
 */
export const PARTNER_TERMS_TITLE = "HandyFix Pro Partner Agreement";
export const PARTNER_TERMS_EFFECTIVE = "October 2026";

export type TermsSection = { heading: string; body: string };

export const PARTNER_TERMS: readonly TermsSection[] = [
  {
    heading: "1. Verification and identity",
    body: "You confirm that every detail and document you submit (PAN, selfie, certificates) belongs to you and is genuine, and that the bank account or UPI id you add for payouts is in your own name. A false or borrowed document means your account is closed and may be reported. We do not collect your Aadhaar card or number.",
  },
  {
    heading: "2. How we review you",
    body: "The HandyFix team checks that your name matches your PAN card and the name on your bank account or UPI id, your selfie matches the photo on your PAN card, you are 18 or older, and your documents are clear. Review usually takes 1–2 working days. If something is unclear we will tell you what to fix so you can send it again.",
  },
  {
    heading: "3. Your rate and the price band",
    body: "You choose your own rate for each service inside the price band set by HandyFix. The price the customer sees is the price you are paid. Once a booking is made, the price is locked. The bill can only grow through extra work the customer approves in the app, and parts and materials are listed with a photo of the bill.",
  },
  {
    heading: "4. Fees and your wallet",
    body: "Joining, going online, receiving requests and declining a request are free. HandyFix charges a fee only on a completed job: 3% of the service bill, rounded to the nearest rupee, never less than ₹5 and never more than ₹50. Parts and materials are not part of the fee. When you accept a job, the fee is set aside from your prepaid wallet; it is charged when the customer's code is accepted and released if the job is cancelled, declined or missed. Your first 10 jobs or first month after approval, whichever comes first, are fee-free. If your wallet cannot cover the fee, you cannot accept the job until you recharge.",
  },
  {
    heading: "5. Payment from the customer",
    body: "The customer pays you directly by UPI or cash after the work. You must never ask for more than the locked price plus extra work the customer has approved in the app.",
  },
  {
    heading: "6. Professional conduct",
    body: "Be on time, be polite and do honest work. Harassment, overcharging, theft or damage to property leads to immediate suspension and may lead to legal action. Do not move customers off the app to avoid the fee: your rating, your record and your protection in a dispute depend on the app.",
  },
  {
    heading: "7. Problems and disputes",
    body: "A customer can report a problem within 24 hours of a completed job (48 hours for repair quality, and safety issues at any time). You can reply with your own photos and notes. An admin decides within 48 hours and either side can appeal once. Every step is saved in a record the admin cannot edit.",
  },
  {
    heading: "8. Your data",
    body: "Your PAN number is stored encrypted, and only its last four characters are shown in the app. Our team opens the full number only when needed, and every time is recorded. Your PAN card photo and selfie are stored privately and opened only by the HandyFix review team. Customers never see your documents or PAN. Customers see only your name, photo, experience, rating and the services you offer. Your phone number is shared with a customer only after you accept their booking.",
  },
  {
    heading: "9. Payouts",
    body: "You can withdraw money from your wallet once your verification is approved and you have saved a UPI ID or bank account. Withdrawals are processed within 1–2 working days.",
  },
];
