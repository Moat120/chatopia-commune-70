import { useState, useEffect } from "react";
import { MessageCircle } from "lucide-react";

const tips = [
  "Connexion aux serveurs…",
  "Chargement des messages…",
  "Synchronisation des contacts…",
  "Préparation de l'interface…",
  "Presque prêt…",
];

const LoadingScreen = ({ onFinished }: { onFinished: () => void }) => {
  const [progress, setProgress] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + Math.random() * 15 + 5;
        return next >= 100 ? 100 : next;
      });
    }, 200);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % tips.length);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (progress >= 100) {
      setTimeout(() => setFadeOut(true), 300);
      setTimeout(() => onFinished(), 800);
    }
  }, [progress, onFinished]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background transition-opacity duration-500 ${
        fadeOut ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 left-1/3 w-[300px] h-[300px] rounded-full bg-accent/5 blur-[80px] animate-pulse" style={{ animationDelay: "0.5s" }} />
      </div>

      <div className="relative flex flex-col items-center gap-8">
        {/* Logo */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl scale-150 animate-pulse" />
          <div className="relative w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center backdrop-blur-sm">
            <MessageCircle className="w-10 h-10 text-primary animate-bounce" style={{ animationDuration: "2s" }} />
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Chatopia</h1>
          <p className="text-sm text-muted-foreground h-5 transition-all duration-300">
            {tips[tipIndex]}
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-64 space-y-2">
          <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
