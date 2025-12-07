import { useCallback, useRef } from "react";

const NOTIFICATION_SOUND = "/sounds/notification.wav";

export const useSound = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playNotification = useCallback(() => {
    try {
      const audio = new Audio(NOTIFICATION_SOUND);
      audio.volume = 0.5;
      audio.play().catch((e) => console.log("[Sound] Play error:", e));
    } catch (error) {
      console.log("[Sound] Error:", error);
    }
  }, []);

  const playClick = useCallback(() => {
    try {
      const audio = new Audio(NOTIFICATION_SOUND);
      audio.volume = 0.3;
      audio.playbackRate = 1.5; // Slightly faster for clicks
      audio.play().catch((e) => console.log("[Sound] Play error:", e));
    } catch (error) {
      console.log("[Sound] Error:", error);
    }
  }, []);

  return { playNotification, playClick };
};

// Standalone functions for use outside of React components
export const playNotificationSound = () => {
  try {
    const audio = new Audio(NOTIFICATION_SOUND);
    audio.volume = 0.5;
    audio.play().catch((e) => console.log("[Sound] Play error:", e));
  } catch (error) {
    console.log("[Sound] Error:", error);
  }
};

export const playClickSound = () => {
  try {
    const audio = new Audio(NOTIFICATION_SOUND);
    audio.volume = 0.3;
    audio.playbackRate = 1.5;
    audio.play().catch((e) => console.log("[Sound] Play error:", e));
  } catch (error) {
    console.log("[Sound] Error:", error);
  }
};
