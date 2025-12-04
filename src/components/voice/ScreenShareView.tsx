import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Monitor, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ScreenShareViewProps {
  stream: MediaStream | null;
  username: string;
  isLocal?: boolean;
  onStop?: () => void;
}

const ScreenShareView = ({
  stream,
  username,
  isLocal = false,
  onStop,
}: ScreenShareViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream) return null;

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden bg-black/90 border border-border/30">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="w-full h-full object-contain"
      />
      
      {/* Overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-primary" />
            <span className="text-sm text-white font-medium">
              {isLocal ? "Ton écran" : `Écran de ${username}`}
            </span>
          </div>
          
          {isLocal && onStop && (
            <Button
              variant="destructive"
              size="sm"
              onClick={onStop}
              className="h-8"
            >
              <X className="h-4 w-4 mr-1" />
              Arrêter
            </Button>
          )}
        </div>
      </div>

      {/* Live indicator */}
      <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/90 text-white text-xs font-medium">
        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
        LIVE
      </div>
    </div>
  );
};

export default ScreenShareView;
