import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

const Login: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isAdmin, user } = useAdminAuth();

  // Redirect if already logged in as admin
  React.useEffect(() => {
    if (user && isAdmin) navigate('/dashboard', { replace: true });
  }, [user, isAdmin, navigate]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      if (!data.user) throw new Error('Login failed.');

      // Check admin role
      const { data: roleData } = await supabase.rpc('has_role', {
        p_user_id: data.user.id,
        p_role: 'admin',
      });

      if (roleData !== true) {
        // Sign out immediately — not an admin
        await supabase.auth.signOut();
        setError('This account is not authorised for the admin panel.');
        setLoading(false);
        return;
      }

      toast({ title: 'Welcome back, Admin 👋' });
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        {/* Header card */}
        <div className="glass-card p-8 space-y-6">
          {/* Logo + branding */}
          <div className="text-center space-y-3">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center shadow-gold p-2">
              <img src="/logo.png" alt="HandyFix" className="w-12 h-12 object-contain" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">HandyFix Admin</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Secure operations panel — authorised personnel only
              </p>
            </div>
          </div>

          {/* Login form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-foreground">
                Admin Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@handyfix.in"
                  className="pl-9 glass-input"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold text-foreground">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 pr-10 glass-input"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive font-medium"
                role="alert"
              >
                {error}
              </motion.div>
            )}

            <Button
              type="submit"
              className="w-full gold-gradient text-primary-foreground font-bold h-11 text-sm"
              disabled={loading}
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Verifying…</>
              ) : (
                <><Shield className="h-4 w-4 mr-2" /> Sign in to Admin Panel</>
              )}
            </Button>
          </form>

          {/* Warning */}
          <p className="text-[10px] text-muted-foreground/70 text-center">
            This is an internal tool. Unauthorized access is prohibited and monitored.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
