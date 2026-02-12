import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Session } from "@supabase/supabase-js";
import { Loader2, Sparkles } from "lucide-react";

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    <div className="min-h-screen flex items-center justify-center aurora-bg p-4 overflow-hidden relative">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Primary glow */}
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-primary/15 rounded-full blur-[150px] animate-float-slow" />
        
        {/* Cyan accent */}
        <div 
          className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full blur-[130px]"
          style={{ background: 'hsl(var(--accent-cyan) / 0.1)' }}
        />
        
        {/* Rose accent */}
        <div 
          className="absolute top-1/2 right-1/3 w-[400px] h-[400px] rounded-full blur-[120px] float-subtle"
          style={{ background: 'hsl(var(--accent-rose) / 0.08)', animationDelay: '2s' }}
        />

        {/* Floating particles */}
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-primary/30 float-subtle"
            style={{
              left: `${15 + i * 15}%`,
              top: `${20 + (i % 3) * 25}%`,
              animationDelay: `${i * 0.8}s`,
              animationDuration: `${5 + i}s`,
            }}
          />
        ))}
      </div>

      {/* Noise texture */}
      <div className="absolute inset-0 noise" />

      {/* Main content */}
      <div 
        className={`w-full max-w-[420px] relative z-10 transition-all duration-1000 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        {/* Logo & Brand */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-8">
            <div className="relative group">
              {/* Outer glow ring */}
              <div className="absolute -inset-4 bg-primary/20 rounded-[2rem] blur-2xl group-hover:bg-primary/30 transition-all duration-700" />
              
              {/* Holographic effect */}
              <div className="absolute -inset-1 rounded-[1.75rem] holographic opacity-50" />
              
              {/* Main logo container */}
              <div className="relative w-28 h-28 rounded-[1.5rem] bg-gradient-to-br from-primary/30 via-primary/15 to-transparent border border-white/10 flex items-center justify-center shadow-2xl glow-primary float-subtle backdrop-blur-xl overflow-hidden">
                {/* Inner shine */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
                
                {/* Logo text */}
                <span className="text-6xl font-bold gradient-text relative z-10">V</span>
                
                {/* Sparkle */}
                <Sparkles className="absolute top-3 right-3 w-4 h-4 text-primary/60 animate-pulse" />
              </div>
            </div>
          </div>
          
          <h1 className="text-5xl font-bold tracking-tight mb-4 gradient-text">
            Bienvenue
          </h1>
          <p className="text-muted-foreground text-lg font-light">
            Connecte-toi pour retrouver tes amis
          </p>
        </div>

        {/* Auth Card */}
        <div className="glass-premium rounded-3xl p-8 shimmer-border">
          <Button
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full h-16 rounded-2xl font-semibold text-base bg-foreground text-background hover:bg-foreground/90 transition-all duration-400 hover:shadow-[0_8px_40px_rgba(255,255,255,0.15)] hover:scale-[1.02] active:scale-[0.98] group relative overflow-hidden"
          >
            {/* Shine effect on hover */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
            
            {googleLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <svg className="h-5 w-5 mr-3 relative z-10" viewBox="0 0 24 24">
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
                <span className="relative z-10">Continuer avec Google</span>
              </>
            )}
          </Button>

          <div className="mt-8 pt-6 border-t border-white/[0.06]">
            <p className="text-center text-sm text-muted-foreground/50 font-light">
              En continuant, tu acceptes nos conditions d'utilisation
            </p>
          </div>
        </div>

        {/* Bottom decoration */}
        <div className="mt-10 flex justify-center items-center gap-2">
          <div className="w-12 h-1 rounded-full bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          <div className="w-2 h-2 rounded-full bg-primary/30 animate-pulse" />
          <div className="w-12 h-1 rounded-full bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        </div>
      </div>
    </div>
  );
};

export default Auth;
