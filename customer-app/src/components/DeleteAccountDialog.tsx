import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  CONFIRM_PHRASE, DELETION_KEPT, DELETION_REMOVED, deleteErrorMessage, isConfirmed, parseDeleteError,
} from "@/lib/accountDeletion";
import { BRAND } from "@/lib/brand";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Typed-confirmation dialog. Deleting is permanent, so the button stays disabled until the person types DELETE. */
const DeleteAccountDialog = ({ open, onOpenChange }: Props) => {
  const { signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = (next: boolean) => {
    if (busy) return; // don't let a stray tap close the dialog mid-deletion
    if (!next) { setTyped(""); setError(null); }
    onOpenChange(next);
  };

  const submit = async () => {
    if (!isConfirmed(typed) || busy) return;
    setBusy(true);
    setError(null);
    const { error: fnError } = await supabase.functions.invoke("delete-customer-account", {
      body: { confirm: CONFIRM_PHRASE },
    });
    if (fnError) {
      setError(deleteErrorMessage(await parseDeleteError(fnError)));
      setBusy(false);
      return;
    }
    // The account no longer exists server-side, so a normal sign-out call may be rejected.
    // End the local session first, then run the app's own sign-out to clear caches and state.
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    await signOut().catch(() => undefined);
    toast({ title: "Account deleted", description: `Your ${BRAND.name} account and personal data have been removed.` });
    navigate("/", { replace: true });
  };

  return (
    <AlertDialog open={open} onOpenChange={reset}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left">
              <p>This is permanent and can't be undone.</p>
              <div>
                <p className="font-semibold text-foreground">Removed</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {DELETION_REMOVED.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
              <div>
                <p className="font-semibold text-foreground">Kept</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {DELETION_KEPT.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
              <p>Any booking still waiting for a provider will be cancelled.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <label htmlFor="delete-confirm" className="text-sm font-semibold">
            Type <span className="font-mono">{CONFIRM_PHRASE}</span> to confirm
          </label>
          <Input
            id="delete-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={busy}
            aria-describedby={error ? "delete-error" : undefined}
            aria-invalid={error ? true : undefined}
          />
          {error && <p id="delete-error" role="alert" className="text-sm font-medium text-red-700">{error}</p>}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep my account</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void submit()}
            disabled={!isConfirmed(typed) || busy}
            aria-busy={busy}
          >
            {busy ? <><Loader2 className="animate-spin" /> Deleting…</> : "Delete forever"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteAccountDialog;
