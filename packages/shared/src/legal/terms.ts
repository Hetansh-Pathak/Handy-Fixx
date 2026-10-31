import { contactLines, LEGAL_UPDATED, LEGAL_VERSION, operator, type LegalContext, type LegalDoc } from "./types";

/** Terms of use for customers (and everyone using the apps). Pros also accept the Partner Agreement in the identity check. */
export function termsOfUse(ctx: LegalContext): LegalDoc {
  return {
    key: "terms",
    title: "Terms of Use",
    version: LEGAL_VERSION,
    updated: LEGAL_UPDATED,
    intro: `These terms are between you and ${operator(ctx)}. By creating an account or using the apnabanda apps you agree to them. If you do not agree, please do not use the apps.`,
    sections: [
      {
        heading: "1. What apnabanda is",
        body: [
          "apnabanda is a marketplace. We help customers find and book verified home-service professionals (\"pros\"). Pros are independent: they are not our employees, and they decide whether to accept a job. We check identity documents before a pro can work, but we do not supervise the work itself.",
        ],
      },
      {
        heading: "2. Your account",
        body: [
          "You must be 18 or older and give true details. An account belongs to one person and is either a customer account or a pro account. Keep your password and your job completion code private. You are responsible for what happens under your account.",
        ],
      },
      {
        heading: "3. Prices and payment",
        body: [
          "The price shown when you book is the price you pay. It is locked when you book. It can grow only if the pro adds extra work or parts in the app and you approve them with one tap. apnabanda adds no fee for customers.",
          "You pay the pro directly (by UPI or cash) after the work is done, unless the app tells you that payment happens in the app. A check-up visit has a visit fee that is always charged; if you want the repair, the pro adds it as extra work that you approve.",
          "Never pay or promise anything outside the app for a booking made through the app.",
        ],
      },
      {
        heading: "4. Booking, cancelling and the job code",
        body: [
          "A request stays open until a pro accepts it. You can cancel while a booking is waiting or after the pro accepted, until the pro starts the trip. Cancelling is free. If you cancel often and close to the start time, instant booking can be paused for a week (3 late cancellations in 30 days).",
          "When the work is finished and you are happy, give the pro the 4-digit code in your booking. The pro enters it to close the job. Do not share the code before the work is done.",
        ],
      },
      {
        heading: "5. Problems and disputes",
        body: [
          "You can report a problem for 24 hours after a job is completed (48 hours for repair quality), and at any time for a safety concern. Both sides can add evidence. We review it and decide within 48 hours: nothing further, a free return visit, a partial refund where payment was made through the app, or action against the pro. Either side can ask for one second review.",
        ],
      },
      {
        heading: "6. How to behave",
        body: [
          "Be respectful and honest. Do not harass or threaten anyone, misuse the apps, post false reviews, try to avoid the platform's safety checks, share phone numbers in chat, or use the apps for anything illegal. We may pause or close accounts that break these rules.",
        ],
      },
      {
        heading: "7. Reviews and content",
        body: [
          "You can rate a pro once per completed booking. What you post (photos, voice notes, messages, reviews) must be yours to share and must not be offensive. You allow us to store and show it as needed to run the service.",
        ],
      },
      {
        heading: "8. Our responsibility",
        body: [
          "We work to keep the apps available and accurate, but they may sometimes be unavailable or contain mistakes. apnabanda is not responsible for the quality, timing or safety of work done by pros beyond helping resolve problems as described above. To the extent the law allows, our liability to you is limited to the amount you paid for the booking in question. Nothing here limits rights you have under the law that cannot be limited.",
        ],
      },
      {
        heading: "9. Pros",
        body: ["Pros also agree to the Partner Agreement shown in the identity check. It covers fees, wallet, rates and how jobs work for pros."],
      },
      {
        heading: "10. Changes, ending and the law",
        body: [
          "We may change these terms; the date above shows the latest version and we will tell you in the app about changes that matter. You can stop using the apps and delete your account at any time. We may suspend accounts that break these terms. These terms follow the laws of India.",
        ],
      },
      { heading: "11. Contact us", body: contactLines(ctx) },
    ],
  };
}
