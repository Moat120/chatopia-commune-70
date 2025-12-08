import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Session } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        if (session) {
          navigate("/");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        navigate("/");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });

      if (error) throw error;
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center mesh-gradient p-4 noise overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-primary/5 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in-up">
        {/* Logo/Brand */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center mb-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/40 via-primary/20 to-transparent border border-white/10 flex items-center justify-center shadow-2xl glow-primary float-subtle">
                <span className="text-5xl font-bold gradient-text">V</span>
              </div>
              <div className="absolute -inset-4 bg-primary/20 rounded-[2rem] blur-2xl -z-10" />
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-3">
            Bienvenue
          </h1>
          <p className="text-muted-foreground text-lg">
            Connecte-toi pour retrouver tes amis
          </p>
        </div>

        {/* Auth Card */}
        <div className="card-modern p-8 border-gradient">
          <Button
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full h-14 rounded-xl font-medium text-base bg-foreground text-background hover:bg-foreground/90 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(255,255,255,0.1)] hover:scale-[1.02] active:scale-[0.98] btn-modern"
          >
            {googleLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <svg className="h-5 w-5 mr-3" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continuer avec Google
              </>
            )}
          </Button>

          <div className="mt-8 pt-6 border-t border-white/[0.08]">
            <p className="text-center text-sm text-muted-foreground/60">
              En continuant, tu acceptes nos conditions d'utilisation
            </p>
          </div>
        </div>

        {/* Bottom decoration */}
        <div className="mt-8 flex justify-center gap-1">
          <div className="w-8 h-1 rounded-full bg-primary/40" />
          <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
        </div>
      </div>
    </div>
  );
};

export default Auth;
