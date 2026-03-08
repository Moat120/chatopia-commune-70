import { useCallback } from "react";

// ══════════════════════════════════════════════
//  AIRY SOUND ENGINE v3
//  Bright, open, spacious UI sounds
//  Higher frequencies, more reverb-like tails
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
    const v = Math.min(vol, 0.3);

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (detune) osc.detune.setValueAtTime(detune, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(v, t + fadeIn);
    gain.gain.setValueAtTime(v, t + dur - fadeOut);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-20, t);
    compressor.knee.setValueAtTime(15, t);
    compressor.ratio.setValueAtTime(3, t);

    osc.connect(gain);

    if (lpf) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(lpf, t);
      filter.Q.setValueAtTime(0.3, t);
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

/** Play a bright chord with stagger */
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
    const v = Math.min(vol, 0.25);

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(v, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(gain);

    if (lpf) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(lpf, t);
      filter.Q.setValueAtTime(0.3, t);
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
//  SOUND PRESETS — bright, airy, open
// ══════════════════════════════════════════════

/** ✨ Bright wind-chime — notification */
const notification = () => {
  tone({ freq: 587, dur: 0.2, vol: 0.04, type: "sine", fadeOut: 0.16, lpf: 4500 });
  tone({ freq: 784, dur: 0.25, vol: 0.035, type: "sine", fadeOut: 0.2, delay: 0.1, lpf: 4200 });
  tone({ freq: 988, dur: 0.35, vol: 0.025, type: "sine", fadeOut: 0.3, delay: 0.2, lpf: 3800 });
};

/** 🖱️ Light tap — button click */
const click = () => {
  tone({ freq: 880, dur: 0.015, vol: 0.02, type: "sine", fadeIn: 0.001, fadeOut: 0.01, lpf: 3500 });
  tone({ freq: 1760, dur: 0.008, vol: 0.006, type: "sine", fadeIn: 0.001, fadeOut: 0.005, delay: 0.003, lpf: 4000 });
};

/** 🟢 Bright ascending — user join */
const join = () => {
  tone({ freq: 523, dur: 0.14, vol: 0.035, type: "sine", fadeOut: 0.11, lpf: 4000 });
  tone({ freq: 659, dur: 0.18, vol: 0.03, type: "sine", fadeOut: 0.14, delay: 0.1, lpf: 3800 });
  tone({ freq: 880, dur: 0.28, vol: 0.025, type: "sine", fadeOut: 0.22, delay: 0.2, lpf: 3500 });
};

/** 🔴 Soft descending — user leave */
const leave = () => {
  tone({ freq: 698, dur: 0.14, vol: 0.03, type: "sine", fadeOut: 0.11, lpf: 3000 });
  tone({ freq: 523, dur: 0.2, vol: 0.025, type: "sine", fadeOut: 0.16, delay: 0.1, lpf: 2800 });
};

/** ✉️ Airy whoosh — message sent */
const messageSent = () => {
  slide(550, 1100, 0.08, 0.02, "sine", 4000);
  tone({ freq: 1320, dur: 0.03, vol: 0.008, type: "sine", fadeIn: 0.002, fadeOut: 0.02, delay: 0.05, lpf: 4500 });
};

/** 📩 Crystal drop — message received */
const messageReceived = () => {
  tone({ freq: 659, dur: 0.1, vol: 0.035, type: "sine", fadeOut: 0.08, lpf: 4000 });
  tone({ freq: 880, dur: 0.15, vol: 0.025, type: "sine", fadeOut: 0.12, delay: 0.06, lpf: 3500 });
};

/** 🔇 Soft fade down — mute */
const mute = () => {
  slide(550, 330, 0.07, 0.025, "sine", 2200);
};

/** 🔊 Breeze up — unmute */
const unmute = () => {
  slide(400, 800, 0.06, 0.025, "sine", 3500);
  tone({ freq: 1100, dur: 0.03, vol: 0.008, type: "sine", fadeOut: 0.02, delay: 0.04, lpf: 4000 });
};

/** 🎙️ PTT on */
const pttOn = () => {
  tone({ freq: 700, dur: 0.025, vol: 0.025, type: "sine", fadeIn: 0.002, fadeOut: 0.018, lpf: 3000 });
  tone({ freq: 1050, dur: 0.02, vol: 0.012, type: "sine", fadeIn: 0.002, fadeOut: 0.012, delay: 0.015, lpf: 3500 });
};

/** 🎙️ PTT off */
const pttOff = () => {
  tone({ freq: 800, dur: 0.02, vol: 0.02, type: "sine", fadeIn: 0.002, fadeOut: 0.015, lpf: 2500 });
  tone({ freq: 500, dur: 0.03, vol: 0.015, type: "sine", fadeIn: 0.002, fadeOut: 0.02, delay: 0.012, lpf: 2000 });
};

/** 📞 Airy ringtone — bright arpeggiated chords */
const ringtone = () => {
  chord([523, 659, 784, 988], 0.35, 0.06, "sine", 40, 4000);
  setTimeout(() => {
    chord([494, 622, 740, 880], 0.4, 0.05, "sine", 40, 3800);
  }, 450);
};

/** 🎉 Success — bright ascending */
const success = () => {
  tone({ freq: 523, dur: 0.1, vol: 0.035, type: "sine", fadeOut: 0.08, lpf: 4000 });
  tone({ freq: 659, dur: 0.1, vol: 0.03, type: "sine", fadeOut: 0.08, delay: 0.07, lpf: 4000 });
  tone({ freq: 784, dur: 0.12, vol: 0.025, type: "sine", fadeOut: 0.1, delay: 0.14, lpf: 3800 });
  tone({ freq: 1047, dur: 0.3, vol: 0.02, type: "sine", fadeOut: 0.25, delay: 0.21, lpf: 3500 });
};

/** ❌ Error — gentle dissonance */
const error = () => {
  tone({ freq: 330, dur: 0.12, vol: 0.03, type: "triangle", fadeOut: 0.09, lpf: 1500 });
  tone({ freq: 310, dur: 0.16, vol: 0.025, type: "triangle", fadeOut: 0.12, delay: 0.07, lpf: 1200 });
};

/** 🔔 Tab switch — light tick */
const tabSwitch = () => {
  tone({ freq: 1000, dur: 0.015, vol: 0.015, type: "sine", fadeIn: 0.001, fadeOut: 0.01, lpf: 3500 });
};

/** 📎 Hover — whisper */
const hover = () => {
  tone({ freq: 1200, dur: 0.01, vol: 0.005, type: "sine", fadeIn: 0.001, fadeOut: 0.007, lpf: 2500 });
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
