import { useCallback } from "react";

// ══════════════════════════════════════════════
//  PREMIUM SOUND ENGINE
//  Musical, warm, satisfying UI sounds using
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
  /** Low-pass filter cutoff (Hz). Adds warmth. */
  lpf?: number;
  /** Delay in seconds from ctx.currentTime */
  delay?: number;
}

const tone = (opts: ToneOpts) => {
  try {
    const ctx = getCtx();
    const {
      freq, dur, vol,
      type = "sine",
      fadeIn = 0.008,
      fadeOut = 0.06,
      detune = 0,
      lpf,
      delay = 0,
    } = opts;

    const t = ctx.currentTime + delay;
    const v = Math.min(vol, 0.4);

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (detune) osc.detune.setValueAtTime(detune, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(v, t + fadeIn);
    gain.gain.setValueAtTime(v, t + dur - fadeOut);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    let lastNode: AudioNode = osc;
    lastNode.connect(gain);
    lastNode = gain;

    // Optional low-pass filter for warmth
    if (lpf) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(lpf, t);
      filter.Q.setValueAtTime(0.7, t);
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
      fadeOut: dur * 0.4,
    });
  });
};

/** Frequency slide (portamento) — creates smooth swoosh feel */
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
    const v = Math.min(vol, 0.35);

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(v, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(gain);

    if (lpf) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(lpf, t);
      filter.Q.setValueAtTime(0.5, t);
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
//  SOUND PRESETS — warm, musical, satisfying
// ══════════════════════════════════════════════

/** ✨ Gentle crystalline chime — notifications */
const notification = () => {
  // Layered major triad arpeggio (C5–E5–G5) with warmth
  tone({ freq: 523, dur: 0.15, vol: 0.06, type: "sine", fadeOut: 0.1, lpf: 4000 });
  tone({ freq: 659, dur: 0.18, vol: 0.055, type: "sine", fadeOut: 0.12, delay: 0.08, lpf: 5000 });
  tone({ freq: 784, dur: 0.28, vol: 0.045, type: "sine", fadeOut: 0.2, delay: 0.16, lpf: 4500 });
  // Soft harmonic shimmer on top
  tone({ freq: 1568, dur: 0.22, vol: 0.012, type: "sine", fadeOut: 0.18, delay: 0.16, lpf: 3000 });
};

/** 🖱️ Subtle haptic pop — button clicks */
const click = () => {
  // Short filtered burst that feels tactile, not harsh
  tone({ freq: 800, dur: 0.025, vol: 0.035, type: "triangle", fadeIn: 0.001, fadeOut: 0.018, lpf: 2500 });
  // Tiny high harmonic for "snap"
  tone({ freq: 2200, dur: 0.012, vol: 0.01, type: "sine", fadeIn: 0.001, fadeOut: 0.008, delay: 0.005, lpf: 3500 });
};

/** 🟢 Warm ascending fifth — user join */
const join = () => {
  // A4 → E5 (perfect fifth, universally pleasant)
  tone({ freq: 440, dur: 0.14, vol: 0.055, type: "sine", fadeOut: 0.1, lpf: 3500 });
  tone({ freq: 659, dur: 0.2, vol: 0.05, type: "sine", fadeOut: 0.14, delay: 0.1, lpf: 3500 });
  // Soft sub-harmonic for body
  tone({ freq: 220, dur: 0.18, vol: 0.02, type: "sine", fadeOut: 0.14, lpf: 800 });
};

/** 🔴 Gentle descending minor third — user leave */
const leave = () => {
  // E5 → C#5 (minor third descent, slightly melancholic but not sad)
  tone({ freq: 659, dur: 0.13, vol: 0.045, type: "sine", fadeOut: 0.09, lpf: 3000 });
  tone({ freq: 554, dur: 0.2, vol: 0.04, type: "sine", fadeOut: 0.16, delay: 0.1, lpf: 2800 });
};

/** ✉️ Satisfying whoosh up — message sent */
const messageSent = () => {
  // Quick ascending slide with filtered warmth
  slide(500, 1100, 0.08, 0.03, "triangle", 3000);
  // Light percussive tap
  tone({ freq: 1200, dur: 0.03, vol: 0.015, type: "sine", fadeIn: 0.002, fadeOut: 0.02, delay: 0.04, lpf: 4000 });
};

/** 📩 Soft bubble pop — message received */
const messageReceived = () => {
  // Two-note "bloop" with natural decay
  tone({ freq: 587, dur: 0.1, vol: 0.05, type: "sine", fadeOut: 0.07, lpf: 3500 });
  tone({ freq: 784, dur: 0.14, vol: 0.04, type: "sine", fadeOut: 0.1, delay: 0.06, lpf: 3200 });
  // Subtle sub for roundness
  tone({ freq: 294, dur: 0.12, vol: 0.015, type: "sine", fadeOut: 0.1, lpf: 600 });
};

/** 🔇 Soft thud down — mute */
const mute = () => {
  slide(500, 280, 0.07, 0.04, "triangle", 1800);
};

/** 🔊 Airy pop up — unmute */
const unmute = () => {
  slide(350, 700, 0.06, 0.04, "triangle", 2500);
  tone({ freq: 1050, dur: 0.04, vol: 0.012, type: "sine", fadeOut: 0.03, delay: 0.04, lpf: 3000 });
};

/** 🎙️ PTT on — crisp engage */
const pttOn = () => {
  tone({ freq: 600, dur: 0.035, vol: 0.04, type: "sine", fadeIn: 0.002, fadeOut: 0.02, lpf: 2500 });
  tone({ freq: 900, dur: 0.025, vol: 0.02, type: "sine", fadeIn: 0.002, fadeOut: 0.015, delay: 0.02, lpf: 3000 });
};

/** 🎙️ PTT off — soft release */
const pttOff = () => {
  tone({ freq: 700, dur: 0.03, vol: 0.03, type: "sine", fadeIn: 0.002, fadeOut: 0.02, lpf: 2000 });
  tone({ freq: 450, dur: 0.04, vol: 0.025, type: "sine", fadeIn: 0.002, fadeOut: 0.025, delay: 0.015, lpf: 1800 });
};

/** 📞 Musical ringtone — warm arpeggiated chords */
const ringtone = () => {
  // First chord: Cmaj7 arpeggio
  chord([392, 494, 587, 740], 0.3, 0.09, "sine", 40, 3500);
  // Second chord: Fmaj7 arpeggio (warmer resolution)
  setTimeout(() => {
    chord([349, 440, 523, 659], 0.35, 0.08, "sine", 40, 3200);
  }, 420);
  // Subtle bell overtone
  setTimeout(() => {
    tone({ freq: 1175, dur: 0.25, vol: 0.01, type: "sine", fadeOut: 0.2, lpf: 2000 });
  }, 300);
};

/** 🎉 Success — bright ascending major arpeggio */
const success = () => {
  tone({ freq: 523, dur: 0.1, vol: 0.05, type: "sine", fadeOut: 0.07, lpf: 4000 });
  tone({ freq: 659, dur: 0.1, vol: 0.045, type: "sine", fadeOut: 0.07, delay: 0.07, lpf: 4000 });
  tone({ freq: 784, dur: 0.12, vol: 0.04, type: "sine", fadeOut: 0.09, delay: 0.14, lpf: 4000 });
  tone({ freq: 1047, dur: 0.25, vol: 0.035, type: "sine", fadeOut: 0.2, delay: 0.21, lpf: 3500 });
};

/** ❌ Error — soft dissonant buzz */
const error = () => {
  tone({ freq: 280, dur: 0.12, vol: 0.05, type: "triangle", fadeOut: 0.08, lpf: 1500 });
  tone({ freq: 260, dur: 0.15, vol: 0.04, type: "triangle", fadeOut: 0.1, delay: 0.08, lpf: 1200 });
};

/** 🔔 Tab switch — minimal tick */
const tabSwitch = () => {
  tone({ freq: 900, dur: 0.02, vol: 0.025, type: "triangle", fadeIn: 0.001, fadeOut: 0.014, lpf: 3000 });
};

/** 📎 Hover — barely-there presence */
const hover = () => {
  tone({ freq: 1200, dur: 0.015, vol: 0.008, type: "sine", fadeIn: 0.001, fadeOut: 0.01, lpf: 2000 });
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

  start(intervalMs = 3200) {
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
