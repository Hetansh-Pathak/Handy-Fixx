import { Link, useLocation } from "react-router-dom";
import { BRAND } from "@/lib/brand";

/**
 * DRAFT legal pages. The text describes what the code actually does (see the data list below),
 * but it is a template: fill in LEGAL.* and have a lawyer review it before the Play Store submission.
 */
export const LEGAL = {
  company: "[Your registered company / proprietor name]",
  address: "[Registered address, City, State, India]",
  email: "[support@yourdomain.com]",
  grievanceOfficer: "[Name, designation]",
  jurisdiction: "[City], Gujarat",
  updated: "5 October 2026",
} as const;

type Section = { id: string; title: string; body: string[] };

const PRIVACY: Section[] = [
  {
    id: "collect", title: "What we collect",
    body: [
      "Account: name, email address, phone number and a password (stored hashed by our authentication provider, never readable by us).",
      "Bookings: the service, date and time, your address and pincode, the map pin you set, notes you write, and any photos or voice notes you attach to describe the problem.",
      "Messages: chat messages between you and your provider for a booking.",
      "Location: your device location only when you tap \"use current location\" while booking. Your provider's live location is shared with you only while their job is on the way.",
      "Reviews you write, and notifications we send you.",
      "Technical data: a cached copy of your recent data is stored on your device so the app loads faster. It is cleared when you log out or delete your account.",
    ],
  },
  {
    id: "use", title: "How we use it",
    body: [
      "To create your account, match you with a provider, run the booking and show you live progress.",
      "To send service emails (verification code, welcome, booking updates). We do not send advertising.",
      "To keep the platform safe: preventing fraud, enforcing limits on repeated attempts, and resolving disputes.",
      "We do not sell your personal data.",
    ],
  },
  {
    id: "share", title: "Who sees it",
    body: [
      "Your provider sees your name, phone, address, pin and booking details for jobs they have accepted, and only for as long as the booking needs it.",
      "Service providers that process data for us: our database and authentication host (Supabase), our email sender, and OpenStreetMap's Nominatim service which turns a pincode or pin into an address. These providers act on our instructions.",
      "We disclose data if the law requires it.",
    ],
  },
  {
    id: "keep", title: "How long we keep it",
    body: [
      "Your data is kept while your account is open.",
      "When you delete your account we remove your notifications, messages, attachments and contact details. Past bookings are kept without your name, phone, address or location, because the provider's accounting records depend on them.",
    ],
  },
  {
    id: "rights", title: "Your choices",
    body: [
      "You can edit your details on the Profile screen.",
      "You can delete your account in the app (Profile → Delete account) or at /delete-account without installing the app.",
      "To ask for a copy of your data or a correction, write to the email below.",
    ],
  },
  {
    id: "security", title: "Security",
    body: [
      "Data is encrypted in transit. Access to each record is limited by database rules so a customer can read only their own account data.",
      "No system is perfectly secure. If you think your account was accessed by someone else, change your password and contact us.",
    ],
  },
  {
    id: "children", title: "Children",
    body: [`${BRAND.name} is for people aged 18 and over. We do not knowingly collect data from children.`],
  },
];

const TERMS: Section[] = [
  {
    id: "what", title: "What we are",
    body: [
      `${BRAND.name} is a marketplace that connects you with independent home-service providers. We are not the employer of providers and do not perform the service ourselves.`,
    ],
  },
  {
    id: "account", title: "Your account",
    body: [
      "You must be 18 or older and give accurate details. Keep your password private; you are responsible for activity on your account.",
    ],
  },
  {
    id: "booking", title: "Bookings",
    body: [
      "A booking is a request. It becomes confirmed when a provider accepts it.",
      "You can cancel while a booking is still pending or confirmed. Once the provider is on the way or the job has started, cancel by contacting the provider.",
      "Be available at the booked time and address. Share your completion code with the provider only when the work is finished to your satisfaction.",
    ],
  },
  {
    id: "pay", title: "Prices and payment",
    body: [
      "The price shown at booking is an estimate. Payment is made after the service, by UPI or QR, unless the app shows otherwise. Nothing is charged when you book.",
    ],
  },
  {
    id: "conduct", title: "Conduct",
    body: [
      "Do not misuse the app: no fake bookings, harassment, attempts to bypass the platform or to access other people's data.",
      "We may suspend accounts that break these rules.",
    ],
  },
  {
    id: "liability", title: "Liability",
    body: [
      "We take reasonable care in verifying providers, but the service is delivered by the provider. To the extent the law allows, our liability is limited to the amount you paid for the booking in dispute.",
    ],
  },
  {
    id: "law", title: "Governing law and complaints",
    body: [
      `These terms are governed by the laws of India, with courts at ${LEGAL.jurisdiction}.`,
      `Complaints: write to our grievance officer, ${LEGAL.grievanceOfficer}, at ${LEGAL.email}.`,
    ],
  },
];

const Legal = () => {
  const isPrivacy = useLocation().pathname.startsWith("/privacy");
  const sections = isPrivacy ? PRIVACY : TERMS;
  const title = isPrivacy ? "Privacy Policy" : "Terms of Service";

  return (
    <main className="mx-auto max-w-2xl px-5 pb-32 pt-24 md:pt-28">
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {BRAND.name} · Last updated {LEGAL.updated}
      </p>

      <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2">
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted">
            {s.title}
          </a>
        ))}
      </nav>

      {sections.map((s) => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="mt-8 scroll-mt-24">
          <h2 id={`${s.id}-h`} className="text-lg font-bold">{s.title}</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted-foreground">
            {s.body.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </section>
      ))}

      <section className="mt-10 rounded-2xl border border-border p-5 text-sm">
        <p className="font-semibold">{LEGAL.company}</p>
        <p className="text-muted-foreground">{LEGAL.address}</p>
        <p className="text-muted-foreground">{LEGAL.email}</p>
        <p className="mt-3 text-muted-foreground">
          See also: {isPrivacy ? <Link className="underline" to="/terms">Terms of Service</Link> : <Link className="underline" to="/privacy">Privacy Policy</Link>}
          {" · "}<Link className="underline" to="/delete-account">Delete your account</Link>
        </p>
      </section>
    </main>
  );
};

export default Legal;
