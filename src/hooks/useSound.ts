import { useCallback } from "react";

// ══════════════════════════════════════════════
//  PREMIUM SOUND ENGINE v2
//  Warmer, more musical, satisfying UI sounds
//  Web Audio API with filters & layered harmonics
// ══════════════════════════════════════════════

let audioCtx: AudioContext | null = null;

const getCtx = (): AudioContext => {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContext({ sampleRate: 48000 });
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
};

// ── Core primitives ──

interface ToneOpts {
  freq: number;
  dur: number;
  vol: number;
  type?: OscillatorType;
  fadeIn?: number;
  fadeOut?: number;
  detune?: number;
  lpf?: number;
  delay?: number;
}

const tone = (opts: ToneOpts) => {
  try {
    const ctx = getCtx();
    const {
      freq, dur, vol,
      type = "sine",
      fadeIn = 0.01,
      fadeOut = 0.08,
      detune = 0,
      lpf,
      delay = 0,
    } = opts;

    const t = ctx.currentTime + delay;
    const v = Math.min(vol, 0.35);

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (detune) osc.detune.setValueAtTime(detune, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(v, t + fadeIn);
    gain.gain.setValueAtTime(v, t + dur - fadeOut);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    // Compressor for consistent volume
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-24, t);
    compressor.knee.setValueAtTime(12, t);
    compressor.ratio.setValueAtTime(4, t);

    osc.connect(gain);

    if (lpf) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(lpf, t);
      filter.Q.setValueAtTime(0.5, t);
      gain.connect(filter);
      filter.connect(compressor);
    } else {
      gain.connect(compressor);
    }

    compressor.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + dur + 0.01);
  } catch {
    // Silently ignore
  }
};

/** Play a warm chord with optional stagger and filter */
const chord = (
  freqs: number[],
  dur: number,
  vol: number,
  type: OscillatorType = "sine",
  stagger = 0,
  lpf?: number
) => {
  freqs.forEach((freq, i) => {
    tone({
      freq,
      dur,
      vol: vol / freqs.length,
      type,
      delay: i * stagger / 1000,
      lpf,
      fadeOut: dur * 0.35,
    });
  });
};

/** Frequency slide (portamento) */
const slide = (
  freqStart: number,
  freqEnd: number,
  dur: number,
  vol: number,
  type: OscillatorType = "sine",
  lpf?: number
) => {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    const v = Math.min(vol, 0.3);

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(v, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(gain);

    if (lpf) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(lpf, t);
      filter.Q.setValueAtTime(0.4, t);
      gain.connect(filter);
      filter.connect(ctx.destination);
    } else {
      gain.connect(ctx.destination);
    }

    osc.start(t);
    osc.stop(t + dur + 0.01);
  } catch {
    // Silently ignore
  }
};

// ══════════════════════════════════════════════
//  SOUND PRESETS — warmer, rounder, more musical
// ══════════════════════════════════════════════

/** ✨ Crystalline chime — notifications (warmer, less piercing) */
const notification = () => {
  tone({ freq: 493, dur: 0.18, vol: 0.05, type: "sine", fadeOut: 0.14, lpf: 3200 });
  tone({ freq: 622, dur: 0.22, vol: 0.04, type: "sine", fadeOut: 0.16, delay: 0.1, lpf: 3000 });
  tone({ freq: 740, dur: 0.32, vol: 0.035, type: "sine", fadeOut: 0.25, delay: 0.2, lpf: 2800 });
  // Warm sub-harmonic body
  tone({ freq: 247, dur: 0.25, vol: 0.015, type: "sine", fadeOut: 0.2, delay: 0.1, lpf: 600 });
};

/** 🖱️ Subtle haptic pop — button clicks (softer, more tactile) */
const click = () => {
  tone({ freq: 680, dur: 0.02, vol: 0.025, type: "triangle", fadeIn: 0.001, fadeOut: 0.015, lpf: 2000 });
  tone({ freq: 1400, dur: 0.01, vol: 0.008, type: "sine", fadeIn: 0.001, fadeOut: 0.007, delay: 0.004, lpf: 2500 });
};

/** 🟢 Warm ascending fifth — user join (more melodic) */
const join = () => {
  tone({ freq: 392, dur: 0.16, vol: 0.045, type: "sine", fadeOut: 0.12, lpf: 2800 });
  tone({ freq: 523, dur: 0.22, vol: 0.04, type: "sine", fadeOut: 0.16, delay: 0.12, lpf: 2800 });
  tone({ freq: 659, dur: 0.28, vol: 0.035, type: "sine", fadeOut: 0.2, delay: 0.24, lpf: 2500 });
  // Sub body
  tone({ freq: 196, dur: 0.2, vol: 0.015, type: "sine", fadeOut: 0.16, lpf: 500 });
};

/** 🔴 Gentle descending — user leave (softer, less abrupt) */
const leave = () => {
  tone({ freq: 587, dur: 0.15, vol: 0.035, type: "sine", fadeOut: 0.12, lpf: 2200 });
  tone({ freq: 440, dur: 0.22, vol: 0.03, type: "sine", fadeOut: 0.18, delay: 0.12, lpf: 2000 });
};

/** ✉️ Satisfying whoosh up — message sent (smoother glide) */
const messageSent = () => {
  slide(420, 880, 0.09, 0.025, "triangle", 2500);
  tone({ freq: 1000, dur: 0.025, vol: 0.01, type: "sine", fadeIn: 0.002, fadeOut: 0.018, delay: 0.05, lpf: 3000 });
};

/** 📩 Soft bubble pop — message received (rounder, warmer) */
const messageReceived = () => {
  tone({ freq: 523, dur: 0.12, vol: 0.04, type: "sine", fadeOut: 0.09, lpf: 2800 });
  tone({ freq: 698, dur: 0.16, vol: 0.03, type: "sine", fadeOut: 0.12, delay: 0.07, lpf: 2500 });
  tone({ freq: 262, dur: 0.14, vol: 0.012, type: "sine", fadeOut: 0.11, lpf: 500 });
};

/** 🔇 Soft thud down — mute */
const mute = () => {
  slide(440, 250, 0.08, 0.03, "triangle", 1500);
};

/** 🔊 Airy pop up — unmute */
const unmute = () => {
  slide(320, 640, 0.07, 0.03, "triangle", 2200);
  tone({ freq: 960, dur: 0.035, vol: 0.01, type: "sine", fadeOut: 0.025, delay: 0.04, lpf: 2500 });
};

/** 🎙️ PTT on */
const pttOn = () => {
  tone({ freq: 550, dur: 0.03, vol: 0.03, type: "sine", fadeIn: 0.002, fadeOut: 0.02, lpf: 2000 });
  tone({ freq: 825, dur: 0.025, vol: 0.015, type: "sine", fadeIn: 0.002, fadeOut: 0.015, delay: 0.02, lpf: 2500 });
};

/** 🎙️ PTT off */
const pttOff = () => {
  tone({ freq: 650, dur: 0.025, vol: 0.025, type: "sine", fadeIn: 0.002, fadeOut: 0.018, lpf: 1800 });
  tone({ freq: 400, dur: 0.035, vol: 0.02, type: "sine", fadeIn: 0.002, fadeOut: 0.025, delay: 0.015, lpf: 1500 });
};

/** 📞 Musical ringtone — warmer arpeggiated chords */
const ringtone = () => {
  chord([349, 440, 523, 659], 0.35, 0.07, "sine", 45, 2800);
  setTimeout(() => {
    chord([330, 392, 494, 587], 0.4, 0.06, "sine", 45, 2500);
  }, 450);
  setTimeout(() => {
    tone({ freq: 1047, dur: 0.3, vol: 0.008, type: "sine", fadeOut: 0.25, lpf: 1800 });
  }, 350);
};

/** 🎉 Success — bright ascending major arpeggio */
const success = () => {
  tone({ freq: 440, dur: 0.12, vol: 0.04, type: "sine", fadeOut: 0.09, lpf: 3000 });
  tone({ freq: 554, dur: 0.12, vol: 0.035, type: "sine", fadeOut: 0.09, delay: 0.08, lpf: 3000 });
  tone({ freq: 659, dur: 0.14, vol: 0.03, type: "sine", fadeOut: 0.11, delay: 0.16, lpf: 3000 });
  tone({ freq: 880, dur: 0.3, vol: 0.025, type: "sine", fadeOut: 0.25, delay: 0.24, lpf: 2500 });
};

/** ❌ Error — soft dissonant buzz (less harsh) */
const error = () => {
  tone({ freq: 260, dur: 0.14, vol: 0.04, type: "triangle", fadeOut: 0.1, lpf: 1200 });
  tone({ freq: 245, dur: 0.18, vol: 0.03, type: "triangle", fadeOut: 0.14, delay: 0.08, lpf: 1000 });
};

/** 🔔 Tab switch — minimal tick (barely there) */
const tabSwitch = () => {
  tone({ freq: 800, dur: 0.018, vol: 0.018, type: "triangle", fadeIn: 0.001, fadeOut: 0.012, lpf: 2200 });
};

/** 📎 Hover — barely-there presence */
const hover = () => {
  tone({ freq: 1000, dur: 0.012, vol: 0.006, type: "sine", fadeIn: 0.001, fadeOut: 0.008, lpf: 1800 });
};

// ══════════════════════════════════════════════
//  React Hook
// ══════════════════════════════════════════════

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
  playSuccess: useCallback(success, []),
  playError: useCallback(error, []),
  playTabSwitch: useCallback(tabSwitch, []),
  playHover: useCallback(hover, []),
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
export const playSuccessSound = success;
export const playErrorSound = error;
export const playTabSwitchSound = tabSwitch;

// ── Ringtone Manager ──

export class RingtoneManager {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isPlaying = false;

  start(intervalMs = 3500) {
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
