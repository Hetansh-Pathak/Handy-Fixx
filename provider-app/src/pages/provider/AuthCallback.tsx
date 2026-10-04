import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const AuthCallback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const completeSignIn = async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.user) {
        throw sessionError ?? new Error('No authenticated session was found.');
      }

      const user = sessionData.session.user;
      const authMode = localStorage.getItem('handyfix_google_auth_mode') || 'login';
      localStorage.removeItem('handyfix_google_auth_mode');
      const displayName = user.user_metadata?.full_name
        || user.user_metadata?.display_name
        || user.user_metadata?.name
        || user.email?.split('@')[0]
        || '';
      const { data: existingProfile, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, full_name, phone, created_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      const profileCreatedDuringThisLogin = existingProfile?.created_at
        ? Date.now() - new Date(existingProfile.created_at).getTime() < 2 * 60 * 1000
        : false;
      let createdGoogleAccount = authMode === 'signup' && profileCreatedDuringThisLogin;
      if (authMode === 'login' && (!existingProfile || profileCreatedDuringThisLogin)) {
        await supabase.auth.signOut();
        toast({
          title: 'Account not found',
          description: 'No HandyFix Pro account was found for this Google account. Please create an account first.',
          variant: 'destructive',
        });
        navigate('/provider-login', { replace: true });
        return;
      }

      let profile = existingProfile;
      if (!profile) {
        const { data: createdProfile, error: createError } = await supabase
          .from('profiles')
          .insert({ user_id: user.id, full_name: displayName })
          .select('user_id, full_name, phone, created_at')
          .single();
        if (createError) throw createError;
        profile = createdProfile;
        createdGoogleAccount = true;
      }

      const { data: provider, error: providerError } = await supabase
        .from('service_providers')
        .select('id, full_name, status')
        .eq('user_id', user.id)
        .maybeSingle();
      if (providerError) throw providerError;

      if (!provider) {
        const { error: createProviderError } = await supabase.from('service_providers').insert({
          user_id: user.id,
          full_name: profile?.full_name || displayName,
          phone: profile?.phone || null,
          email: user.email,
          status: 'active',
        });
        if (createProviderError) throw createProviderError;
        createdGoogleAccount = true;
      } else if (provider.status === 'suspended' || provider.status === 'pending_approval') {
        await supabase.auth.signOut();
        toast({
          title: provider.status === 'suspended' ? 'Account Suspended' : 'Application Under Review',
          description: provider.status === 'suspended'
            ? 'Your account has been suspended. Email support@handyfix.com for help.'
            : "Your pro application is being reviewed. We'll contact you within 3 business days.",
          variant: 'destructive',
        });
        navigate('/provider-login', { replace: true });
        return;
      }

      if (user.email) {
        void supabase.functions.invoke('send-welcome-email', {
          body: {
            email: user.email,
            display_name: profile?.full_name || displayName,
            event: createdGoogleAccount ? 'signup' : 'login',
          },
        }).catch((emailError) => {
          console.error('Google welcome email failed:', emailError);
        });
      }

      if (!profile?.full_name || !profile?.phone) {
        navigate('/provider-panel/profile?setup=true', { replace: true });
      } else {
        navigate('/provider-panel', { replace: true });
      }
    };

    completeSignIn().catch((error: Error) => {
      toast({ title: 'Google sign-in failed', description: error.message, variant: 'destructive' });
      navigate('/provider-login', { replace: true });
    });
  }, [navigate, toast]);

  return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Completing Google sign-in...</div>;
};

export default AuthCallback;