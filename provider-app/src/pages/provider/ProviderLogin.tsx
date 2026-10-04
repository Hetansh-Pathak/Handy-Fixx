import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import logo from '@/assets/logo.png';
import {
  Loader2, Eye, EyeOff, Mail, Lock, User, Phone,
  ArrowRight, Sparkles, Shield, Star
} from 'lucide-react';

type Mode = 'signin' | 'signup';

const ProviderLogin: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>('signin');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Sign In state
  const [siEmail, setSiEmail] = useState('');
  const [siPassword, setSiPassword] = useState('');

  // Sign Up state
  const [suName, setSuName] = useState('');
  const [suPhone, setSuPhone] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suPassword, setSuPassword] = useState('');
  const [suConfirm, setSuConfirm] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    localStorage.setItem('handyfix_google_auth_mode', mode === 'signin' ? 'login' : 'signup');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    });

    if (error) {
      toast({ title: 'Google sign-in failed', description: error.message, variant: 'destructive' });
      setLoading(false);
    }
  };

  /* ───────── SIGN IN ───────── */
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Auto-confirm helper — fixes "Email not confirmed" silently
    const autoConfirmAndSignIn = async (email: string, password: string) => {
      await (supabase.rpc as any)('confirm_user_email', { user_email: email });
      return supabase.auth.signInWithPassword({ email, password });
    };

    let { data, error } = await supabase.auth.signInWithPassword({
      email: siEmail,
      password: siPassword,
    });

    // If email not confirmed — auto-confirm via RPC and retry once
    if (error?.message?.toLowerCase().includes('email not confirmed')) {
      const retry = await autoConfirmAndSignIn(siEmail, siPassword);
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      toast({ title: 'Login failed', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    const { data: providerData } = await supabase
      .from('service_providers')
      .select('id, full_name, status')
      .eq('user_id', data.user.id)
      .maybeSingle();

    if (!providerData) {
      await supabase.auth.signOut();
      toast({
        title: 'Not a provider account',
        description: 'This email is not registered as a HandyFix Pro.',
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    if (providerData.status === 'suspended') {
      await supabase.auth.signOut();
      toast({
        title: 'Account Suspended',
        description: 'Your account has been suspended. Email support@handyfix.com for help.',
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    if (providerData.status === 'pending_approval') {
      await supabase.auth.signOut();
      toast({
        title: 'Application Under Review',
        description: "Your pro application is being reviewed. We'll contact you within 3 business days.",
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    toast({ title: `Welcome back, ${providerData.full_name}! 👋`, description: "Ready to take on today's jobs?" });
    navigate('/provider-panel');
    setLoading(false);
  };

  /* ───────── SIGN UP ───────── */
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (suPassword !== suConfirm) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (suPassword.length < 6) {
      toast({ title: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }

    setLoading(true);

    // 1. Create auth user — when email confirmation is OFF, signUp returns a session immediately
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: suEmail,
      password: suPassword,
      options: { data: { full_name: suName } },
    });

    if (signUpError) {
      toast({ title: 'Sign up failed', description: signUpError.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    // 2. Get active user — either from signUp session directly (confirmation OFF)
    //    or by signing in immediately after (fallback)
    let activeUserId: string | null = signUpData.session?.user?.id ?? signUpData.user?.id ?? null;

    if (!signUpData.session) {
      // Session not returned — email confirmation may still be blocking, try signing in
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: suEmail,
        password: suPassword,
      });

      if (signInError) {
        // Email confirmation is blocking login — guide the user
        toast({
          title: 'Confirm your email 📧',
          description: 'Check your inbox, click the confirmation link, then come back and sign in.',
        });
        setSiEmail(suEmail);
        setMode('signin');
        setLoading(false);
        return;
      }

      activeUserId = signInData.user?.id ?? null;
    }

    if (!activeUserId) {
      toast({ title: 'Something went wrong. Please try again.', variant: 'destructive' });
      setLoading(false);
      return;
    }

    // 3. Insert provider row — auth.uid() is now valid because session is active
    const { error: provErr } = await supabase.from('service_providers').insert({
      user_id: activeUserId,
      full_name: suName,
      phone: suPhone || null,
      email: suEmail,
      status: 'active',
    });

    if (provErr) {
      toast({ title: 'Profile creation failed', description: provErr.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    // 4. All good — go straight to provider dashboard
    toast({
      title: `Welcome to HandyFix Pro, ${suName}! 🎉`,
      description: "Your account is ready. Let's get started!",
    });
    navigate('/provider-panel');
    setLoading(false);
  };

  const features = [
    { icon: Star, text: 'Manage bookings & earnings' },
    { icon: Shield, text: 'Secure provider dashboard' },
    { icon: Sparkles, text: 'Real-time job notifications' },
  ];

  return (
    <div className="min-h-screen bg-background flex">

      {/* ── Left Panel (decorative, hidden on mobile) ── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-secondary items-center justify-center p-12">
        {/* Glow blobs */}
        <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-56 h-56 rounded-full bg-primary/5 blur-3xl" />

        <div className="relative z-10 text-center max-w-sm">
          {/* Logo */}
          <img
            src={logo}
            alt="HandyFix"
            className="w-20 h-20 rounded-3xl object-cover mx-auto mb-6 shadow-2xl"
            style={{ boxShadow: '0 0 48px 8px hsl(22 61% 47% / 0.35)' }}
          />
          <h1 className="text-4xl font-bold gold-text mb-3">HandyFix Pro</h1>
          <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
            Your all-in-one provider dashboard to manage jobs, track earnings, and grow your business.
          </p>

          <div className="space-y-4">
            {features.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 bg-card/70 rounded-xl px-4 py-3 border border-border">
                <div className="w-8 h-8 rounded-lg gold-gradient flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="text-sm text-secondary-foreground">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right Panel (form) ── */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <img
              src={logo}
              alt="HandyFix"
              className="w-14 h-14 rounded-2xl object-cover mx-auto mb-3 shadow-lg"
              style={{ boxShadow: '0 0 24px 4px hsl(22 61% 47% / 0.35)' }}
            />
            <h1 className="text-2xl font-bold gold-text">HandyFix Provider</h1>
          </div>

          {/* Tab switcher */}
          <div className="flex rounded-xl bg-secondary/40 p-1 mb-8 border border-border">
            {(['signin', 'signup'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setShowPassword(false); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  mode === m
                    ? 'gold-gradient text-primary-foreground shadow-md'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">

            {/* ── SIGN IN FORM ── */}
            {mode === 'signin' && (
              <motion.form
                key="signin"
                onSubmit={handleSignIn}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <div>
                  <p className="text-2xl font-bold mb-1">Welcome back 👋</p>
                  <p className="text-muted-foreground text-sm">Sign in to your provider account</p>
                </div>

                <div className="space-y-4 pt-2">
                  {/* Email */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signin-email"
                        type="email"
                        value={siEmail}
                        onChange={e => setSiEmail(e.target.value)}
                        className="glass-input pl-10"
                        placeholder="your@email.com"
                        required
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signin-password"
                        type={showPassword ? 'text' : 'password'}
                        value={siPassword}
                        onChange={e => setSiPassword(e.target.value)}
                        className="glass-input pl-10 pr-10"
                        placeholder="••••••••"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <Button
                  id="signin-submit"
                  type="submit"
                  disabled={loading}
                  className="w-full gold-gradient text-primary-foreground font-semibold h-11 text-base"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                    <span className="flex items-center gap-2">Sign In <ArrowRight className="h-4 w-4" /></span>
                  )}
                </Button>

                <div className="relative flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">OR</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={handleGoogleSignIn}
                  className="w-full border-primary/40 bg-secondary/40 text-foreground font-semibold h-11 text-base hover:bg-primary/10"
                >
                  <span className="mr-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-sm font-bold text-[#4285F4]">G</span>
                  Continue with Google
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  New provider?{' '}
                  <button type="button" onClick={() => setMode('signup')} className="text-primary hover:underline font-medium">
                    Create account
                  </button>
                </p>
              </motion.form>
            )}

            {/* ── SIGN UP FORM ── */}
            {mode === 'signup' && (
              <motion.form
                key="signup"
                onSubmit={handleSignUp}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <div>
                  <p className="text-2xl font-bold mb-1">Join HandyFix Pro 🚀</p>
                  <p className="text-muted-foreground text-sm">Create your provider account and start earning</p>
                </div>

                <div className="space-y-4 pt-2">
                  {/* Full Name */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-name"
                        value={suName}
                        onChange={e => setSuName(e.target.value)}
                        className="glass-input pl-10"
                        placeholder="Ravi Kumar"
                        required
                      />
                    </div>
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">
                      Phone <span className="text-muted-foreground font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-phone"
                        type="tel"
                        value={suPhone}
                        onChange={e => setSuPhone(e.target.value)}
                        className="glass-input pl-10"
                        placeholder="9876543210"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        value={suEmail}
                        onChange={e => setSuEmail(e.target.value)}
                        className="glass-input pl-10"
                        placeholder="your@email.com"
                        required
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type={showPassword ? 'text' : 'password'}
                        value={suPassword}
                        onChange={e => setSuPassword(e.target.value)}
                        className="glass-input pl-10 pr-10"
                        placeholder="Min. 6 characters"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Confirm Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-confirm"
                        type={showPassword ? 'text' : 'password'}
                        value={suConfirm}
                        onChange={e => setSuConfirm(e.target.value)}
                        className={`glass-input pl-10 ${
                          suConfirm && suConfirm !== suPassword ? 'border-destructive' : ''
                        }`}
                        placeholder="Re-enter password"
                        required
                      />
                    </div>
                    {suConfirm && suConfirm !== suPassword && (
                      <p className="text-xs text-destructive mt-1">Passwords do not match</p>
                    )}
                  </div>
                </div>

                <Button
                  id="signup-submit"
                  type="submit"
                  disabled={loading || (!!suConfirm && suConfirm !== suPassword)}
                  className="w-full gold-gradient text-primary-foreground font-semibold h-11 text-base"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                    <span className="flex items-center gap-2">Create Account <ArrowRight className="h-4 w-4" /></span>
                  )}
                </Button>

                <div className="relative flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">OR</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={handleGoogleSignIn}
                  className="w-full border-primary/40 bg-secondary/40 text-foreground font-semibold h-11 text-base hover:bg-primary/10"
                >
                  <span className="mr-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-sm font-bold text-[#4285F4]">G</span>
                  Continue with Google
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  By signing up, you agree to HandyFix's Terms of Service and Privacy Policy.
                </p>

                <p className="text-center text-sm text-muted-foreground">
                  Already have an account?{' '}
                  <button type="button" onClick={() => setMode('signin')} className="text-primary hover:underline font-medium">
                    Sign in
                  </button>
                </p>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default ProviderLogin;
