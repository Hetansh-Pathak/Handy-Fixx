import { contactLines, LEGAL_UPDATED, LEGAL_VERSION, operator, type LegalContext, type LegalDoc } from "./types";

/** Privacy policy for the HandyFix (customer) and HandyFix Pro apps. Written from what the apps actually do. */
export function privacyPolicy(ctx: LegalContext): LegalDoc {
  return {
    key: "privacy",
    title: "Privacy Policy",
    version: LEGAL_VERSION,
    updated: LEGAL_UPDATED,
    intro: `${operator(ctx)} runs apnabanda, which helps people in your city book verified home-service professionals, and apnabanda Pro, the app those professionals use. This policy explains what we collect, why, who sees it and what you can do. We collect only what we need to run the service.`,
    sections: [
      {
        heading: "1. What we collect",
        body: [
          "From everyone: your name, email address, mobile number and password (the password is handled by our sign-in service and is never visible to us). If you use Google sign-in, we receive your name and email from Google.",
          "From customers: the address and pincode of the job, the place you pin on the map, your notes, photos and a voice note you choose to add, the time you book, chat messages with your pro, ratings, reviews and any problem you report.",
          "From pros, for the identity check: your date of birth, your PAN number (stored encrypted; the app shows only its last 4 characters, and a one-way code made from it is used to spot duplicate accounts), photos of your PAN card and trade certificate, a selfie, your work areas, services, rates and working hours, and your UPI or bank details for payouts (the name on the account is compared with the name on your PAN). We do not collect your Aadhaar number or card.",
          "Location: customers share a location only when they type or pin an address or ask for \"Nearest\". Pros who are online share their area, rounded to about 1 km, so customers can sort by nearest. While a pro is travelling to a job, their live position is shared with that job's customer, and only then. Only the Pro app asks for background location.",
          "Money records: wallet recharges, fees, payouts and bills. Card and UPI details used to pay are handled by our payment partner and are not stored by us.",
          "Technical: the type of phone and app version, and error information that helps us fix problems.",
        ],
      },
      {
        heading: "2. Why we use it",
        body: [
          "To create your account, show you pros and prices, make a booking, and let you and your pro reach each other once a booking is confirmed.",
          "To check that pros are who they say they are, keep the platform safe, review problems and disputes, and prevent fraud.",
          "To run payments, the pro wallet and fees, and keep the records the law requires.",
          "To send you notifications about your bookings, requests, messages and account. We do not sell your personal information and we do not show third-party advertising.",
        ],
      },
      {
        heading: "3. Who can see what",
        body: [
          "A pro sees a customer's name, the booked time and the area of a request before accepting. The full address and phone number are shown only after the pro accepts. A customer sees a pro's name, photo, rating, price and approximate area; the pro's phone number is shown only after the booking is confirmed.",
          "Chat is private between the customer and the pro on that booking. Phone numbers cannot be sent in chat. apnabanda staff can read chats and the booking record only when needed to help with a problem or dispute.",
          "Identity documents are kept in private storage and are opened only by the apnabanda team reviewing an application or a dispute. They are never shown to customers.",
        ],
      },
      {
        heading: "4. Who we share it with",
        body: [
          "Service providers who process data for us, under their own security commitments: Supabase (our database, sign-in and file storage), Razorpay (wallet recharges and payments), Google (sign-in and maps) and Expo and Google Firebase (delivering notifications to your phone).",
          "Authorities, when the law requires it or to protect people's safety.",
          "We do not sell or rent your personal information.",
        ],
      },
      {
        heading: "5. How long we keep it",
        body: [
          "We keep your account while it is open. Once a pro is approved, an automatic job deletes photos of identity documents we no longer need after a short period, unless the documents are needed for a dispute or an investigation. When you delete your account we erase your profile details and, for pros, the identity record and documents. We keep finished bookings, payment and fee records, reviews and any open disputes, with your name and phone number removed, because accounting rules and disputes need them.",
          "Chat messages and booking records may be kept for the period needed to handle disputes and legal obligations.",
        ],
      },
      {
        heading: "6. Your choices and rights",
        body: [
          "You can see and correct your details in the app (Profile > Edit profile). You can delete your account in the app (Profile > Delete account) or by email. You can ask us for a copy of the data we hold about you, ask us to correct it, withdraw your consent, or complain about how we handled it.",
          "You can switch off location, notifications, camera or microphone at any time in your phone settings. Some features then stop working (for example, a pro who turns off location cannot go online).",
        ],
      },
      {
        heading: "7. Security",
        body: [
          "Data is sent encrypted. Documents are in private storage, the job completion code allows only a few wrong attempts, and access is limited by role. No system is perfectly secure; if something affecting you goes wrong we will tell you and the authorities as the law requires.",
        ],
      },
      {
        heading: "8. Children",
        body: ["apnabanda is for adults. Customers must be 18 or older to book, and pros must be 18 or older to register. We do not knowingly collect information from children."],
      },
      {
        heading: "9. Changes",
        body: [`We may update this policy. The date at the top shows the latest version (${LEGAL_VERSION}). If a change matters to you we will tell you in the app.`],
      },
      { heading: "10. Contact us", body: contactLines(ctx) },
    ],
  };
}
