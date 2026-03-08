import { useCallback } from "react";

// Web Audio API synthesized sounds - pleasant, modern UI tones
let audioCtx: AudioContext | null = null;

const getCtx = (): AudioContext => {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
};

interface ToneOptions {
  frequency: number;
  duration: number;
  volume: number;
  type?: OscillatorType;
  fadeIn?: number;
  fadeOut?: number;
  detune?: number;
}

const playTone = (options: ToneOptions) => {
  try {
    const ctx = getCtx();
    const { frequency, duration, volume, type = "sine", fadeIn = 0.01, fadeOut = 0.08, detune = 0 } = options;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    if (detune) osc.detune.setValueAtTime(detune, ctx.currentTime);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(Math.min(volume, 0.5), ctx.currentTime + fadeIn);
    gain.gain.setValueAtTime(Math.min(volume, 0.5), ctx.currentTime + duration - fadeOut);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    // Silently ignore audio errors
  }
};

const playChord = (frequencies: number[], duration: number, volume: number, type: OscillatorType = "sine", stagger = 0) => {
  frequencies.forEach((freq, i) => {
    setTimeout(() => {
      playTone({ frequency: freq, duration, volume: volume / frequencies.length, type });
    }, i * stagger);
  });
};

// ── Sound Presets (soft / musical / non-aggressive) ──

/** Gentle ascending chime - notifications */
const notification = () => {
  playTone({ frequency: 523, duration: 0.11, volume: 0.07, type: "sine", fadeIn: 0.01, fadeOut: 0.06 });
  setTimeout(() => playTone({ frequency: 659, duration: 0.14, volume: 0.06, type: "sine", fadeIn: 0.01, fadeOut: 0.08 }), 90);
  setTimeout(() => playTone({ frequency: 784, duration: 0.2, volume: 0.05, type: "sine", fadeIn: 0.01, fadeOut: 0.12 }), 180);
};

/** Soft tactile click - buttons */
const click = () => {
  playTone({ frequency: 740, duration: 0.03, volume: 0.05, type: "triangle", fadeIn: 0.002, fadeOut: 0.02 });
  setTimeout(() => playTone({ frequency: 980, duration: 0.024, volume: 0.03, type: "sine", fadeIn: 0.002, fadeOut: 0.016 }), 14);
};

/** Warm ascending two-tone - user joining */
const join = () => {
  playTone({ frequency: 440, duration: 0.12, volume: 0.07, type: "sine", fadeOut: 0.08 });
  setTimeout(() => playTone({ frequency: 554, duration: 0.16, volume: 0.06, type: "sine", fadeOut: 0.1 }), 110);
};

/** Soft descending tone - user leaving */
const leave = () => {
  playTone({ frequency: 554, duration: 0.12, volume: 0.06, type: "sine", fadeOut: 0.08 });
  setTimeout(() => playTone({ frequency: 415, duration: 0.16, volume: 0.055, type: "sine", fadeOut: 0.1 }), 110);
};

/** Light swoosh up - message sent */
const messageSent = () => {
  playTone({ frequency: 660, duration: 0.06, volume: 0.04, type: "triangle", fadeIn: 0.004, fadeOut: 0.03 });
  setTimeout(() => playTone({ frequency: 880, duration: 0.045, volume: 0.03, type: "sine", fadeIn: 0.004, fadeOut: 0.025 }), 35);
};

/** Gentle ding - message received */
const messageReceived = () => {
  playTone({ frequency: 622, duration: 0.09, volume: 0.06, type: "sine", fadeOut: 0.06 });
  setTimeout(() => playTone({ frequency: 831, duration: 0.11, volume: 0.045, type: "sine", fadeOut: 0.08 }), 70);
};

/** Low click - mute */
const mute = () => {
  playTone({ frequency: 320, duration: 0.06, volume: 0.06, type: "triangle", fadeIn: 0.004, fadeOut: 0.03 });
};

/** Higher click - unmute */
const unmute = () => {
  playTone({ frequency: 520, duration: 0.06, volume: 0.06, type: "triangle", fadeIn: 0.004, fadeOut: 0.03 });
};

/** Push-to-talk on */
const pttOn = () => {
  playTone({ frequency: 540, duration: 0.04, volume: 0.045, type: "sine", fadeIn: 0.002, fadeOut: 0.02 });
};

/** Push-to-talk off */
const pttOff = () => {
  playTone({ frequency: 420, duration: 0.04, volume: 0.04, type: "sine", fadeIn: 0.002, fadeOut: 0.02 });
};

/** Ringtone - pleasant chord pattern */
const ringtone = () => {
  playChord([392, 494, 587], 0.26, 0.11, "sine", 55);
  setTimeout(() => playChord([440, 523, 659], 0.3, 0.1, "sine", 55), 420);
};

// ── React Hook ──

export const useSound = () => ({
  playNotification: useCallback(notification, []),
  playClick: useCallback(click, []),
  playJoin: useCallback(join, []),
  playLeave: useCallback(leave, []),
  playRingtone: useCallback(ringtone, []),
  playMessageSent: useCallback(messageSent, []),
  playMessageReceived: useCallback(messageReceived, []),
  playMute: useCallback(mute, []),
  playUnmute: useCallback(unmute, []),
  playPttOn: useCallback(pttOn, []),
  playPttOff: useCallback(pttOff, []),
});

// ── Standalone exports ──

export const playNotificationSound = notification;
export const playClickSound = click;
export const playJoinSound = join;
export const playLeaveSound = leave;
export const playRingtoneSound = ringtone;
export const playMessageSentSound = messageSent;
export const playMessageReceivedSound = messageReceived;
export const playMuteSound = mute;
export const playUnmuteSound = unmute;
export const playPttOnSound = pttOn;
export const playPttOffSound = pttOff;

// ── Ringtone Manager ──

export class RingtoneManager {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isPlaying = false;

  start(intervalMs = 3000) {
    if (this.isPlaying) return;
    this.isPlaying = true;
    ringtone();
    this.intervalId = setInterval(() => {
      if (this.isPlaying) ringtone();
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
