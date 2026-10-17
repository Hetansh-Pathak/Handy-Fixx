import { useState } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import DeleteAccountDialog from "@/components/DeleteAccountDialog";
import { useAuth } from "@/contexts/AuthContext";
import { DELETION_KEPT, DELETION_REMOVED } from "@/lib/accountDeletion";
import { BRAND } from "@/lib/brand";

/**
 * Public account-deletion page. Google Play's Data safety form asks for a web URL where people can
 * request deletion without installing the app, so this route is deliberately NOT behind a login:
 * signed-out visitors get instructions and a log-in link, signed-in users can delete right here.
 */
const DeleteAccount = () => {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <main className="mx-auto max-w-2xl px-5 pb-32 pt-24 md:pt-28">
      <h1 className="text-3xl font-extrabold tracking-tight">Delete your {BRAND.name} account</h1>
      <p className="mt-3 text-muted-foreground">
        You can delete your account and personal data at any time. It is permanent and can't be undone.
      </p>

      <section aria-labelledby="removed" className="mt-8">
        <h2 id="removed" className="text-lg font-bold">What we delete</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          {DELETION_REMOVED.map((t) => <li key={t}>{t}</li>)}
        </ul>
      </section>

      <section aria-labelledby="kept" className="mt-6">
        <h2 id="kept" className="text-lg font-bold">What we keep</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          {DELETION_KEPT.map((t) => <li key={t}>{t}</li>)}
        </ul>
      </section>

      <section aria-labelledby="how" className="mt-6">
        <h2 id="how" className="text-lg font-bold">Before you delete</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>A booking that is confirmed or in progress must be finished or cancelled first.</li>
          <li>Bookings still waiting for a provider are cancelled automatically.</li>
        </ul>
      </section>

      <div className="mt-10">
        {loading ? null : user ? (
          <>
            <Button type="button" variant="destructive" size="lg" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
              <Trash2 aria-hidden="true" /> Delete my account
            </Button>
            <DeleteAccountDialog open={open} onOpenChange={setOpen} />
          </>
        ) : (
          <div className="rounded-2xl border border-border p-5">
            <p className="font-semibold">Log in to delete your account</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We need to know it's you before removing anything.
            </p>
            <Button asChild size="lg" className="mt-4 w-full sm:w-auto">
              <Link to="/auth?redirect=%2Fdelete-account">Log in</Link>
            </Button>
          </div>
        )}
        <p className="mt-6 text-sm text-muted-foreground">
          Can't log in? <Link to="/contact" className="font-semibold underline underline-offset-2">Contact us</Link> and
          we'll help you remove your data.
        </p>
      </div>
    </main>
  );
};

export default DeleteAccount;
