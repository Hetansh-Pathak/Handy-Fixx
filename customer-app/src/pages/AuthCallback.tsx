import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const AuthCallback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [message, setMessage] = useState("Completing Google sign-in...");

  useEffect(() => {
    const completeSignIn = async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.user) {
        toast({
          title: "Google sign-in failed",
          description: sessionError?.message ?? "No authenticated session was found.",
          variant: "destructive",
        });
        navigate("/auth", { replace: true });
        return;
      }

      const user = sessionData.session.user;
      const authMode = localStorage.getItem("handyfix_google_auth_mode") || "login";
      localStorage.removeItem("handyfix_google_auth_mode");
      const { data: existingProfile, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone, created_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      let profile = existingProfile as { full_name: string | null; phone: string | null; created_at: string | null } | null;
      const profileCreatedDuringThisLogin = profile?.created_at
        ? Date.now() - new Date(profile.created_at).getTime() < 2 * 60 * 1000
        : false;
      let createdGoogleAccount = authMode === "signup" && profileCreatedDuringThisLogin;

      if (authMode === "login" && (!profile || profileCreatedDuringThisLogin)) {
        await supabase.auth.signOut();
        navigate("/auth?mode=signup&error=account_not_found", { replace: true });
        return;
      }

      if (!profile) {
        const fullName = user.user_metadata?.display_name
          || user.user_metadata?.full_name
          || user.user_metadata?.name
          || user.email?.split("@")[0]
          || "";
        const { data: createdProfile, error: createError } = await supabase
          .from("profiles")
          .insert({ user_id: user.id, full_name: fullName })
          .select("user_id, full_name, phone, created_at")
          .single();
        if (createError) throw createError;
        profile = createdProfile;
        createdGoogleAccount = true;
      }

      if (user.email) {
        void supabase.functions.invoke("send-welcome-email", {
          body: {
            email: user.email,
            display_name: profile?.full_name || user.email.split("@")[0],
            event: createdGoogleAccount ? "signup" : "login",
          },
        }).catch((emailError) => {
          console.error("Google welcome email failed:", emailError);
        });
      }

      if (!profile?.full_name || !profile?.phone) {
        navigate("/profile?setup=true", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    };

    completeSignIn().catch((error: Error) => {
      setMessage("Unable to finish sign-in.");
      toast({ title: "Google sign-in failed", description: error.message, variant: "destructive" });
      navigate("/auth", { replace: true });
    });
  }, [navigate, toast]);

  return <div className="min-h-dvh bg-background flex items-center justify-center text-muted-foreground">{message}</div>;
};

export default AuthCallback;