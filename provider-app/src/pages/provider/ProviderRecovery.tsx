import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Loader2, MailCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Provider password recovery: /forgot-password asks for an email, /reset-password sets the new one.
 * (The provider app had no reset route, so the Settings "Change password" email led to a 404.)
 * Add `${origin}/reset-password` to Supabase Auth -> URL Configuration -> Redirect URLs.
 */
const MIN_LEN = 8;
const field = 'h-12 w-full rounded-xl bg-secondary px-4 text-base outline-none focus:ring-2 focus:ring-gold';

const Shell = ({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) => (
  <main className="flex min-h-screen flex-col bg-primary text-primary-foreground">
    <header className="px-6 pb-8 pt-14">
      <Link to="/provider-login" className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-gold"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Log in</Link>
      <h1 className="text-3xl font-extrabold leading-tight tracking-tight">{title}</h1>
      <p className="mt-2 text-sm opacity-70">{sub}</p>
    </header>
    <section className="flex-1 rounded-t-[2rem] bg-background p-6 text-foreground">{children}</section>
  </main>
);

const Notice = ({ text }: { text: string }) => (
  <div role="alert" className="flex items-start gap-3 rounded-xl bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700">
    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{text}
  </div>
);

const Forgot = () => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const value = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(value)) return setError('Enter a valid email address.');
    setError(null); setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(value, { redirectTo: `${window.location.origin}/reset-password` });
    setLoading(false);
    // Same screen whether or not the account exists, so this can't be used to find registered emails.
    if (err && /rate|limit|too many/i.test(err.message)) return setError('Too many requests. Wait a minute and try again.');
    setSent(true);
  };

  return (
    <Shell title="Forgot your password?" sub="We'll email you a link to set a new one.">
      {sent ? (
        <div className="space-y-4 text-center">
          <MailCheck className="mx-auto h-12 w-12 text-gold" aria-hidden="true" />
          <p className="text-lg font-extrabold">Check your email</p>
          <p className="text-sm text-muted-foreground">If an account exists for {email.trim()}, a reset link is on its way. Open it on this device. It expires soon.</p>
          <Link to="/provider-login" className="press flex h-14 items-center justify-center rounded-2xl bg-primary text-base font-extrabold text-primary-foreground">Back to log in</Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <div>
            <label htmlFor="fp-email" className="mb-1.5 block text-sm font-semibold">Email</label>
            <input id="fp-email" type="email" inputMode="email" autoComplete="email" autoFocus required className={field}
              placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          {error && <Notice text={error} />}
          <button type="submit" disabled={loading} aria-busy={loading}
            className="press flex h-14 w-full items-center justify-center rounded-2xl bg-gold text-base font-extrabold text-gold-foreground disabled:opacity-60">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Sending" /> : 'Send reset link'}
          </button>
        </form>
      )}
    </Shell>
  );
};

type Gate = 'checking' | 'ready' | 'invalid';
const Reset = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [gate, setGate] = useState<Gate>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The client may already have consumed the URL hash, so rely on the recovery event / session, not the hash.
  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY' && active) setGate('ready'); });
    void supabase.auth.getSession().then(({ data }) => { if (active) setGate(g => (g === 'ready' || data.session ? 'ready' : 'invalid')); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (password.length < MIN_LEN) return setError(`Use at least ${MIN_LEN} characters.`);
    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return setError('Include at least one letter and one number.');
    if (password !== confirm) return setError("The passwords don't match.");
    setError(null); setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) return setError(/same|different/i.test(err.message) ? 'Choose a password you have not used before.' : 'Could not update your password. Request a new link and try again.');
    toast({ title: 'Password updated' });
    navigate('/provider-panel', { replace: true });
  };

  return (
    <Shell title={gate === 'invalid' ? 'This link has expired' : 'Choose a new password'} sub={gate === 'invalid' ? 'Reset links work once and stop after a short time.' : `At least ${MIN_LEN} characters, with a letter and a number.`}>
      {gate === 'checking' && <div className="space-y-4" aria-busy="true"><div className="h-12 animate-pulse rounded-xl bg-secondary" /><div className="h-12 animate-pulse rounded-xl bg-secondary" /></div>}
      {gate === 'invalid' && (
        <div className="space-y-3">
          <Link to="/forgot-password" className="press flex h-14 items-center justify-center rounded-2xl bg-gold text-base font-extrabold text-gold-foreground">Request a new link</Link>
          <Link to="/provider-login" className="press flex h-14 items-center justify-center rounded-2xl bg-secondary text-base font-bold">Back to log in</Link>
        </div>
      )}
      {gate === 'ready' && (
        <form onSubmit={submit} noValidate className="space-y-4">
          <div>
            <label htmlFor="rp-new" className="mb-1.5 block text-sm font-semibold">New password</label>
            <input id="rp-new" type="password" autoComplete="new-password" autoFocus className={field} value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <div>
            <label htmlFor="rp-confirm" className="mb-1.5 block text-sm font-semibold">Confirm new password</label>
            <input id="rp-confirm" type="password" autoComplete="new-password" className={field} value={confirm} onChange={e => setConfirm(e.target.value)} />
          </div>
          {error && <Notice text={error} />}
          <button type="submit" disabled={loading} aria-busy={loading}
            className="press flex h-14 w-full items-center justify-center rounded-2xl bg-gold text-base font-extrabold text-gold-foreground disabled:opacity-60">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Updating" /> : 'Update password'}
          </button>
        </form>
      )}
    </Shell>
  );
};

const ProviderRecovery = () => (useLocation().pathname.startsWith('/reset-password') ? <Reset /> : <Forgot />);
export default ProviderRecovery;
