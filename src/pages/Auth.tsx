import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Session } from "@supabase/supabase-js";
import { Loader2, Sparkles, Eye, EyeOff } from "lucide-react";

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session) {
          navigate("/");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      toast({ title: "Erreur", description: "Remplis tous les champs", variant: "destructive" });
      return;
    }

    if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
      toast({ title: "Erreur", description: "Le pseudo doit faire entre 3 et 20 caractères", variant: "destructive" });
      return;
    }

    if (password.length < 6) {
      toast({ title: "Erreur", description: "Le mot de passe doit faire au moins 6 caractères", variant: "destructive" });
      return;
    }

    // Use username as a fake email for Supabase auth
    const fakeEmail = `${trimmedUsername.toLowerCase()}@chatopia.local`;

    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email: fakeEmail,
          password,
        });
        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            throw new Error("Pseudo ou mot de passe incorrect");
          }
          throw error;
        }
      } else {
        if (password !== confirmPassword) {
          toast({ title: "Erreur", description: "Les mots de passe ne correspondent pas", variant: "destructive" });
          setLoading(false);
          return;
        }

        // Check if username is already taken
        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", trimmedUsername)
          .maybeSingle();

        if (existing) {
          toast({ title: "Erreur", description: "Ce pseudo est déjà pris", variant: "destructive" });
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.signUp({
          email: fakeEmail,
          password,
          options: {
            data: {
              full_name: trimmedUsername,
            },
          },
        });
        if (error) {
          if (error.message.includes("already registered")) {
            throw new Error("Ce pseudo est déjà pris");
          }
          throw error;
        }
        toast({ title: "Compte créé !", description: "Bienvenue sur Chatopia" });
      }
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center aurora-bg p-4 overflow-hidden relative">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-primary/15 rounded-full blur-[150px] animate-float-slow" />
        <div 
          className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full blur-[130px]"
          style={{ background: 'hsl(var(--accent-cyan) / 0.1)' }}
        />
        <div 
          className="absolute top-1/2 right-1/3 w-[400px] h-[400px] rounded-full blur-[120px] float-subtle"
          style={{ background: 'hsl(var(--accent-rose) / 0.08)', animationDelay: '2s' }}
        />
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

      <div className="absolute inset-0 noise" />

      <div 
        className={`w-full max-w-[420px] relative z-10 transition-all duration-1000 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        {/* Logo & Brand */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-8">
            <div className="relative group">
              <div className="absolute -inset-4 bg-primary/20 rounded-[2rem] blur-2xl group-hover:bg-primary/30 transition-all duration-700" />
              <div className="absolute -inset-1 rounded-[1.75rem] holographic opacity-50" />
              <div className="relative w-28 h-28 rounded-[1.5rem] bg-gradient-to-br from-primary/30 via-primary/15 to-transparent border border-white/10 flex items-center justify-center shadow-2xl glow-primary float-subtle backdrop-blur-xl overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
                <span className="text-6xl font-bold gradient-text relative z-10">V</span>
                <Sparkles className="absolute top-3 right-3 w-4 h-4 text-primary/60 animate-pulse" />
              </div>
            </div>
          </div>
          
          <h1 className="text-5xl font-bold tracking-tight mb-4 gradient-text">
            {isLogin ? "Bon retour" : "Bienvenue"}
          </h1>
          <p className="text-muted-foreground text-lg font-light">
            {isLogin ? "Connecte-toi pour retrouver tes amis" : "Crée ton compte pour commencer"}
          </p>
        </div>

        {/* Auth Card */}
        <div className="glass-premium rounded-3xl p-8 shimmer-border">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm text-muted-foreground">Pseudo</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="TonPseudo"
                maxLength={20}
                minLength={3}
                required
                autoFocus
                autoComplete="username"
                className="h-12 rounded-xl bg-background/50 border-white/10 focus:border-primary/50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-muted-foreground">Mot de passe</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  required
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  className="h-12 rounded-xl bg-background/50 border-white/10 focus:border-primary/50 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm text-muted-foreground">Confirmer le mot de passe</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  required
                  autoComplete="new-password"
                  className="h-12 rounded-xl bg-background/50 border-white/10 focus:border-primary/50"
                />
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              data-silent
              className="w-full h-14 rounded-2xl font-semibold text-base bg-foreground text-background hover:bg-foreground/90 transition-all duration-400 hover:shadow-[0_8px_40px_rgba(255,255,255,0.15)] hover:scale-[1.02] active:scale-[0.98] group relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <span className="relative z-10">
                  {isLogin ? "Se connecter" : "Créer mon compte"}
                </span>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/[0.06]">
            <button
              onClick={() => { setIsLogin(!isLogin); setConfirmPassword(""); }}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {isLogin ? "Pas encore de compte ? Inscris-toi" : "Déjà un compte ? Connecte-toi"}
            </button>
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
