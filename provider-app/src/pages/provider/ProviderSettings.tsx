import { useEffect, useState } from 'react';
import { AlertTriangle, Bell, KeyRound, LogOut, ScrollText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProvider } from '@/contexts/ProviderContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type PrefKey = 'new_booking' | 'booking_update' | 'reviews' | 'payments' | 'marketing';
type Prefs = Record<PrefKey, boolean>;

const ITEMS: { key: PrefKey; label: string; desc: string }[] = [
  { key: 'new_booking', label: 'New requests', desc: 'When a customer books you' },
  { key: 'booking_update', label: 'Booking updates', desc: 'Cancellations and changes' },
  { key: 'reviews', label: 'Reviews', desc: 'When a customer rates you' },
  { key: 'payments', label: 'Payments', desc: 'Earnings and payout updates' },
  { key: 'marketing', label: 'Tips and offers', desc: 'Platform news. Off by default' },
];
const DEFAULTS: Prefs = { new_booking: true, booking_update: true, reviews: true, payments: true, marketing: false };

const Group = ({ icon: Icon, title, danger, children }: { icon: typeof Bell; title: string; danger?: boolean; children: React.ReactNode }) => (
  <section className={`rounded-3xl bg-card p-4 ring-1 ${danger ? 'ring-red-500/30' : 'ring-border'}`}>
    <h2 className={`mb-3 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider ${danger ? 'text-red-600' : 'text-muted-foreground'}`}>
      <Icon className="h-4 w-4" aria-hidden="true" /> {title}
    </h2>
    {children}
  </section>
);

const ProviderSettings = () => {
  const { provider } = useProvider();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [confirmOut, setConfirmOut] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const np = provider?.notification_preferences as Partial<Prefs> | null | undefined;
    if (np) setPrefs({ ...DEFAULTS, ...Object.fromEntries(Object.entries(np).filter(([k, v]) => k in DEFAULTS && typeof v === 'boolean')) });
  }, [provider?.notification_preferences]);

  const toggle = async (key: PrefKey, value: boolean) => {
    if (!provider?.id) return;
    const before = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    const { error } = await supabase.from('service_providers').update({ notification_preferences: next }).eq('id', provider.id);
    if (error) { setPrefs(before); toast({ title: 'Could not save', description: 'Check your connection and try again.', variant: 'destructive' }); }
  };

  const changePassword = async () => {
    const email = user?.email;
    if (!email || busy) return;
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (error) toast({ title: 'Could not send the email', description: 'Wait a minute and try again.', variant: 'destructive' });
    else toast({ title: 'Check your email', description: `We sent a reset link to ${email}.` });
  };

  const deactivate = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('deactivate_my_provider_account' as never);
    setBusy(false);
    setConfirmOff(false);
    if (error) {
      toast({
        title: error.message.includes('ACTIVE_BOOKINGS') ? 'Finish your jobs first' : 'Could not deactivate',
        description: error.message.includes('ACTIVE_BOOKINGS') ? 'You have requests or jobs in progress. Complete or decline them, then try again.' : 'Please try again, or contact support.',
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'Account deactivated', description: 'Contact support to come back.' });
    await signOut();
  };

  return (
    <div className="max-w-2xl space-y-4 pb-28 md:pb-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>

      <Group icon={Bell} title="Notifications">
        <div className="divide-y divide-border">
          {ITEMS.map(i => (
            <div key={i.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div>
                <p id={`pref-${i.key}`} className="text-sm font-bold">{i.label}</p>
                <p className="text-xs text-muted-foreground">{i.desc}</p>
              </div>
              <Switch checked={prefs[i.key]} onCheckedChange={v => void toggle(i.key, v)} aria-labelledby={`pref-${i.key}`} />
            </div>
          ))}
        </div>
      </Group>

      <Group icon={KeyRound} title="Account">
        <div className="space-y-2">
          <button type="button" onClick={() => void changePassword()} disabled={busy || !user?.email}
            className="press flex h-12 w-full items-center justify-between rounded-xl bg-secondary px-4 text-sm font-semibold disabled:opacity-50">
            Change password <span className="text-xs text-muted-foreground">Email me a link</span>
          </button>
          <Link to="/provider-panel/terms" className="press flex h-12 w-full items-center justify-between rounded-xl bg-secondary px-4 text-sm font-semibold">
            <span className="flex items-center gap-2"><ScrollText className="h-4 w-4" aria-hidden="true" /> Terms and conditions</span>
          </Link>
          <button type="button" onClick={() => setConfirmOut(true)} className="press flex h-12 w-full items-center gap-2 rounded-xl bg-secondary px-4 text-sm font-semibold">
            <LogOut className="h-4 w-4" aria-hidden="true" /> Log out
          </button>
        </div>
      </Group>

      <Group icon={AlertTriangle} title="Danger zone" danger>
        <p className="mb-3 text-sm text-muted-foreground">Deactivating stops new requests and takes you offline. You can't do it while you have open jobs.</p>
        <button type="button" onClick={() => setConfirmOff(true)} className="press h-12 w-full rounded-xl bg-red-500/10 text-sm font-bold text-red-600">Deactivate account</button>
      </Group>

      <AlertDialog open={confirmOut} onOpenChange={setConfirmOut}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Log out?</AlertDialogTitle><AlertDialogDescription>You will go offline and stop receiving requests.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Stay</AlertDialogCancel><AlertDialogAction onClick={() => void signOut()}>Log out</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOff} onOpenChange={setConfirmOff}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Deactivate your account?</AlertDialogTitle><AlertDialogDescription>You will stop receiving requests and be logged out. Only support can turn it back on. Your earnings and payout history are kept.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my account</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void deactivate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Deactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProviderSettings;
