import { useCallback } from "react";

const NOTIFICATION_SOUND = "/sounds/notification.wav";

// Create audio context for better sound control
let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
};

// Play sound with custom settings
const playSound = (options: {
  volume?: number;
  playbackRate?: number;
  detune?: number;
}) => {
  const { volume = 0.5, playbackRate = 1, detune = 0 } = options;
  
  try {
    const audio = new Audio(NOTIFICATION_SOUND);
    audio.volume = Math.min(Math.max(volume, 0), 1);
    audio.playbackRate = playbackRate;
    audio.play().catch((e) => console.log("[Sound] Play error:", e));
  } catch (error) {
    console.log("[Sound] Error:", error);
  }
};

export const useSound = () => {
  const playNotification = useCallback(() => {
    playSound({ volume: 0.5, playbackRate: 1.0 });
  }, []);

  const playClick = useCallback(() => {
    playSound({ volume: 0.25, playbackRate: 1.6 });
  }, []);

  const playJoin = useCallback(() => {
    playSound({ volume: 0.4, playbackRate: 1.25 });
  }, []);

  const playLeave = useCallback(() => {
    playSound({ volume: 0.35, playbackRate: 0.75 });
  }, []);

  const playRingtone = useCallback(() => {
    playSound({ volume: 0.7, playbackRate: 1.0 });
  }, []);

  const playMessageSent = useCallback(() => {
    playSound({ volume: 0.2, playbackRate: 1.8 });
  }, []);

  const playMessageReceived = useCallback(() => {
    playSound({ volume: 0.35, playbackRate: 1.4 });
  }, []);

  const playMute = useCallback(() => {
    playSound({ volume: 0.25, playbackRate: 0.9 });
  }, []);

  const playUnmute = useCallback(() => {
    playSound({ volume: 0.3, playbackRate: 1.3 });
  }, []);

  const playPttOn = useCallback(() => {
    playSound({ volume: 0.3, playbackRate: 1.5 });
  }, []);

  const playPttOff = useCallback(() => {
    playSound({ volume: 0.25, playbackRate: 1.1 });
  }, []);

  return { 
    playNotification, 
    playClick, 
    playJoin, 
    playLeave, 
    playRingtone,
    playMessageSent,
    playMessageReceived,
    playMute,
    playUnmute,
    playPttOn,
    playPttOff
  };
};

// Standalone functions for use outside of React components
export const playNotificationSound = () => {
  playSound({ volume: 0.5, playbackRate: 1.0 });
};

export const playClickSound = () => {
  playSound({ volume: 0.2, playbackRate: 1.7 });
};

export const playJoinSound = () => {
  playSound({ volume: 0.4, playbackRate: 1.25 });
};

export const playLeaveSound = () => {
  playSound({ volume: 0.35, playbackRate: 0.75 });
};

export const playRingtoneSound = () => {
  playSound({ volume: 0.75, playbackRate: 1.0 });
};

export const playMessageSentSound = () => {
  playSound({ volume: 0.2, playbackRate: 1.8 });
};

export const playMessageReceivedSound = () => {
  playSound({ volume: 0.35, playbackRate: 1.4 });
};

export const playMuteSound = () => {
  playSound({ volume: 0.25, playbackRate: 0.85 });
};

export const playUnmuteSound = () => {
  playSound({ volume: 0.3, playbackRate: 1.35 });
};

export const playPttOnSound = () => {
  playSound({ volume: 0.3, playbackRate: 1.5 });
};

export const playPttOffSound = () => {
  playSound({ volume: 0.25, playbackRate: 1.0 });
};

// Ringtone manager for continuous ringing
export class RingtoneManager {
  private intervalId: NodeJS.Timeout | null = null;
  private isPlaying = false;

  start(intervalMs: number = 2500) {
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
