import { useState, useRef, useCallback } from "react";

interface UseScreenShareProps {
  onError?: (error: string) => void;
}

export const useScreenShare = ({ onError }: UseScreenShareProps = {}) => {
  const [isSharing, setIsSharing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startScreenShare = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60, max: 60 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setIsSharing(true);

      // Handle when user stops sharing via browser UI
      mediaStream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

      return mediaStream;
    } catch (error: any) {
      console.error("[ScreenShare] Error:", error);
      if (error.name !== "NotAllowedError") {
        onError?.(error.message || "Impossible de partager l'écran");
      }
      return null;
    }
  }, [onError]);

  const stopScreenShare = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);
    setIsSharing(false);
  }, []);

  return {
    isSharing,
    stream,
    startScreenShare,
    stopScreenShare,
  };
};
