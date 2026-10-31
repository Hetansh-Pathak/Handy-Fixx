import { contactLines, LEGAL_UPDATED, LEGAL_VERSION, type LegalContext, type LegalDoc } from "./types";

/** The page store listings link to for "how do I delete my account and data". */
export function accountDeletion(ctx: LegalContext): LegalDoc {
  return {
    key: "deletion",
    title: "Delete your apnabanda account",
    version: LEGAL_VERSION,
    updated: LEGAL_UPDATED,
    intro: "You can delete your apnabanda or apnabanda Pro account and your personal data at any time. This page explains how and what happens.",
    sections: [
      {
        heading: "1. Delete it in the app",
        body: [
          "Open the app, go to Profile, then Delete account, and confirm. This works in both the apnabanda app and the apnabanda Pro app.",
          "You cannot delete while a booking is in progress (waiting, confirmed, on the way or being worked on). Finish or cancel it first.",
        ],
      },
      {
        heading: "2. Or ask us by email",
        body: [`Write to ${ctx.supportEmail} from the email address of your account with the subject \"Delete my apnabanda account\". We confirm it is you and complete the deletion within 15 days.`],
      },
      {
        heading: "3. What is erased",
        body: [
          "Your profile: name, phone number, photo and saved address.",
          "For pros: name, phone, email, photo, bio, bank and UPI details, date of birth, the identity record (so your PAN is freed) and the uploaded documents, including the selfie. Your pro profile is set inactive and offline.",
          "Your notifications and your sign-in.",
        ],
      },
      {
        heading: "4. What we keep, and why",
        body: [
          "Finished bookings, payment and fee records, reviews and any open disputes. We remove your name and phone number from them. We keep them because accounting rules and disputes require it, and because other people's records (for example the other side of a booking) depend on them.",
        ],
      },
      { heading: "5. Contact us", body: contactLines(ctx) },
    ],
  };
}

export const ALL_LEGAL_KEYS = ["privacy", "terms", "deletion"] as const;
