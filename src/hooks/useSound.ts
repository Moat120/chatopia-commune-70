import { useCallback, useRef, useEffect } from "react";

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
      audio.playbackRate = 1.5;
      audio.play().catch((e) => console.log("[Sound] Play error:", e));
    } catch (error) {
      console.log("[Sound] Error:", error);
    }
  }, []);

  const playJoin = useCallback(() => {
    try {
      const audio = new Audio(NOTIFICATION_SOUND);
      audio.volume = 0.4;
      audio.playbackRate = 1.2;
      audio.play().catch((e) => console.log("[Sound] Play error:", e));
    } catch (error) {
      console.log("[Sound] Error:", error);
    }
  }, []);

  const playLeave = useCallback(() => {
    try {
      const audio = new Audio(NOTIFICATION_SOUND);
      audio.volume = 0.4;
      audio.playbackRate = 0.8;
      audio.play().catch((e) => console.log("[Sound] Play error:", e));
    } catch (error) {
      console.log("[Sound] Error:", error);
    }
  }, []);

  const playRingtone = useCallback(() => {
    try {
      const audio = new Audio(NOTIFICATION_SOUND);
      audio.volume = 0.7;
      audio.playbackRate = 1.0;
      audio.play().catch((e) => console.log("[Sound] Play error:", e));
    } catch (error) {
      console.log("[Sound] Error:", error);
    }
  }, []);

  return { playNotification, playClick, playJoin, playLeave, playRingtone };
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

export const playJoinSound = () => {
  try {
    const audio = new Audio(NOTIFICATION_SOUND);
    audio.volume = 0.4;
    audio.playbackRate = 1.2;
    audio.play().catch((e) => console.log("[Sound] Play error:", e));
  } catch (error) {
    console.log("[Sound] Error:", error);
  }
};

export const playLeaveSound = () => {
  try {
    const audio = new Audio(NOTIFICATION_SOUND);
    audio.volume = 0.4;
    audio.playbackRate = 0.8;
    audio.play().catch((e) => console.log("[Sound] Play error:", e));
  } catch (error) {
    console.log("[Sound] Error:", error);
  }
};

// Ringtone with higher volume for incoming calls
export const playRingtoneSound = () => {
  try {
    const audio = new Audio(NOTIFICATION_SOUND);
    audio.volume = 0.8;
    audio.playbackRate = 1.0;
    audio.play().catch((e) => console.log("[Sound] Play error:", e));
  } catch (error) {
    console.log("[Sound] Error:", error);
  }
};

// Ringtone manager for continuous ringing
export class RingtoneManager {
  private intervalId: NodeJS.Timeout | null = null;
  private isPlaying = false;

  start(intervalMs: number = 2000) {
    if (this.isPlaying) return;
    
    this.isPlaying = true;
    playRingtoneSound();
    
    this.intervalId = setInterval(() => {
      if (this.isPlaying) {
        playRingtoneSound();
      }
    }, intervalMs);
  }

  stop() {
    this.isPlaying = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
