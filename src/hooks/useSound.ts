import { useCallback } from "react";

// ══════════════════════════════════════════════
//  iOS SOUND ENGINE v4
//  Faithful recreation of Apple iOS system sounds
//  Crystalline, precise, haptic-feeling tones
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
  hpf?: number;
  delay?: number;
}

const tone = (opts: ToneOpts) => {
  try {
    const ctx = getCtx();
    const {
      freq, dur, vol,
      type = "sine",
      fadeIn = 0.003,
      fadeOut = 0.06,
      detune = 0,
      lpf,
      hpf,
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

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, t);
    compressor.knee.setValueAtTime(12, t);
    compressor.ratio.setValueAtTime(4, t);

    let chain: AudioNode = gain;

    if (hpf) {
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.setValueAtTime(hpf, t);
      hp.Q.setValueAtTime(0.5, t);
      osc.connect(hp);
      hp.connect(gain);
    } else {
      osc.connect(gain);
    }

    if (lpf) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(lpf, t);
      filter.Q.setValueAtTime(0.7, t);
      chain.connect(filter);
      chain = filter;
    }

    chain.connect(compressor);
    compressor.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + dur + 0.01);
  } catch {
    // Silently ignore
  }
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
    gain.gain.linearRampToValueAtTime(v, t + 0.003);
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

/** Short noise burst for haptic feel */
const noiseBurst = (dur: number, vol: number, lpf = 3000) => {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }
    
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.min(vol, 0.15), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(lpf, t);
    filter.Q.setValueAtTime(1.5, t);
    
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    source.start(t);
  } catch {}
};

// ══════════════════════════════════════════════
//  iOS SOUND PRESETS
// ══════════════════════════════════════════════

/** 📱 iOS Haptic Tap — ultra-short crystalline tick like Taptic Engine */
const click = () => {
  noiseBurst(0.012, 0.06, 4500);
  tone({ freq: 1800, dur: 0.008, vol: 0.03, type: "sine", fadeIn: 0.001, fadeOut: 0.005, lpf: 5000 });
};

/** 📱 iOS Light Tap — softer than click, for hover/selection */
const hover = () => {
  noiseBurst(0.006, 0.025, 5000);
  tone({ freq: 2200, dur: 0.005, vol: 0.012, type: "sine", fadeIn: 0.001, fadeOut: 0.003, lpf: 6000 });
};

/** 🔔 iOS Tri-tone Notification — the iconic ascending crystalline triplet */
const notification = () => {
  tone({ freq: 1175, dur: 0.09, vol: 0.045, type: "sine", fadeIn: 0.002, fadeOut: 0.06, lpf: 6000 });
  tone({ freq: 1480, dur: 0.09, vol: 0.04, type: "sine", fadeIn: 0.002, fadeOut: 0.06, delay: 0.1, lpf: 5500 });
  tone({ freq: 1760, dur: 0.15, vol: 0.035, type: "sine", fadeIn: 0.002, fadeOut: 0.12, delay: 0.2, lpf: 5000 });
};

/** 🟢 iOS FaceTime Connect — warm ascending dyad */
const join = () => {
  tone({ freq: 880, dur: 0.12, vol: 0.04, type: "sine", fadeOut: 0.09, lpf: 4500 });
  tone({ freq: 1109, dur: 0.15, vol: 0.035, type: "sine", fadeOut: 0.12, delay: 0.08, lpf: 4200 });
  tone({ freq: 1319, dur: 0.22, vol: 0.03, type: "sine", fadeOut: 0.18, delay: 0.16, lpf: 4000 });
  noiseBurst(0.015, 0.02, 3000);
};

/** 🔴 iOS Disconnect — gentle descending minor */
const leave = () => {
  tone({ freq: 880, dur: 0.1, vol: 0.035, type: "sine", fadeOut: 0.08, lpf: 3500 });
  tone({ freq: 698, dur: 0.14, vol: 0.03, type: "sine", fadeOut: 0.11, delay: 0.08, lpf: 3000 });
  tone({ freq: 523, dur: 0.2, vol: 0.025, type: "sine", fadeOut: 0.16, delay: 0.16, lpf: 2500 });
};

/** ✉️ iOS Message Sent — the iconic swoosh (upward sweep + noise) */
const messageSent = () => {
  slide(600, 1400, 0.08, 0.03, "sine", 5000);
  noiseBurst(0.04, 0.04, 6000);
  tone({ freq: 1760, dur: 0.025, vol: 0.01, type: "sine", fadeIn: 0.002, fadeOut: 0.018, delay: 0.05, lpf: 6000 });
};

/** 📩 iOS Message Received — soft crystalline double-chime */
const messageReceived = () => {
  tone({ freq: 1319, dur: 0.07, vol: 0.04, type: "sine", fadeOut: 0.05, lpf: 5000 });
  tone({ freq: 1568, dur: 0.1, vol: 0.035, type: "sine", fadeOut: 0.08, delay: 0.08, lpf: 4500 });
};

/** 🔇 iOS Mute — short descending with haptic */
const mute = () => {
  noiseBurst(0.01, 0.04, 2000);
  slide(800, 400, 0.06, 0.03, "sine", 2500);
};

/** 🔊 iOS Unmute — crisp ascending with haptic */
const unmute = () => {
  noiseBurst(0.01, 0.04, 4000);
  slide(500, 1100, 0.05, 0.03, "sine", 4500);
};

/** 🔇 Deafen — deep descending double-tone */
const deafen = () => {
  tone({ freq: 600, dur: 0.08, vol: 0.035, type: "sine", fadeOut: 0.06, lpf: 2500 });
  tone({ freq: 400, dur: 0.12, vol: 0.03, type: "sine", fadeOut: 0.09, delay: 0.06, lpf: 2000 });
  noiseBurst(0.015, 0.03, 1500);
};

/** 🔊 Undeafen — warm ascending restore */
const undeafen = () => {
  tone({ freq: 500, dur: 0.08, vol: 0.035, type: "sine", fadeOut: 0.06, lpf: 3500 });
  tone({ freq: 800, dur: 0.1, vol: 0.03, type: "sine", fadeOut: 0.08, delay: 0.06, lpf: 4000 });
  tone({ freq: 1100, dur: 0.12, vol: 0.025, type: "sine", fadeOut: 0.1, delay: 0.12, lpf: 4500 });
};

/** 🖥️ Screen share start — tech ascending chirp */
const screenShareStart = () => {
  noiseBurst(0.01, 0.03, 5000);
  tone({ freq: 880, dur: 0.06, vol: 0.03, type: "sine", fadeOut: 0.04, lpf: 5000 });
  tone({ freq: 1320, dur: 0.08, vol: 0.025, type: "sine", fadeOut: 0.06, delay: 0.05, lpf: 4500 });
  tone({ freq: 1760, dur: 0.1, vol: 0.02, type: "sine", fadeOut: 0.08, delay: 0.1, lpf: 4000 });
};

/** 🖥️ Screen share stop — tech descending chirp */
const screenShareStop = () => {
  tone({ freq: 1320, dur: 0.06, vol: 0.025, type: "sine", fadeOut: 0.04, lpf: 4000 });
  tone({ freq: 880, dur: 0.08, vol: 0.02, type: "sine", fadeOut: 0.06, delay: 0.05, lpf: 3000 });
  noiseBurst(0.01, 0.025, 2500);
};

/** 👤 User joined voice — soft pop */
const userJoined = () => {
  noiseBurst(0.008, 0.03, 4000);
  tone({ freq: 1047, dur: 0.05, vol: 0.025, type: "sine", fadeOut: 0.04, lpf: 4500 });
  tone({ freq: 1319, dur: 0.06, vol: 0.02, type: "sine", fadeOut: 0.05, delay: 0.04, lpf: 4000 });
};

/** 👤 User left voice — soft descending */
const userLeft = () => {
  tone({ freq: 1047, dur: 0.05, vol: 0.02, type: "sine", fadeOut: 0.04, lpf: 3500 });
  tone({ freq: 784, dur: 0.07, vol: 0.015, type: "sine", fadeOut: 0.05, delay: 0.04, lpf: 3000 });
};

/** 🎙️ PTT on — sharp engage */
const pttOn = () => {
  noiseBurst(0.008, 0.05, 5000);
  tone({ freq: 1047, dur: 0.02, vol: 0.03, type: "sine", fadeIn: 0.001, fadeOut: 0.015, lpf: 4000 });
  tone({ freq: 1568, dur: 0.015, vol: 0.015, type: "sine", fadeIn: 0.001, fadeOut: 0.01, delay: 0.012, lpf: 5000 });
};

/** 🎙️ PTT off — soft disengage */
const pttOff = () => {
  noiseBurst(0.008, 0.04, 3000);
  tone({ freq: 1200, dur: 0.018, vol: 0.025, type: "sine", fadeIn: 0.001, fadeOut: 0.013, lpf: 3000 });
  tone({ freq: 800, dur: 0.025, vol: 0.018, type: "sine", fadeIn: 0.001, fadeOut: 0.018, delay: 0.01, lpf: 2500 });
};

/** 📞 iOS Ringtone — crystalline arpeggiated pattern */
const ringtone = () => {
  const notes = [1319, 1568, 1760, 2093];
  notes.forEach((freq, i) => {
    tone({ freq, dur: 0.12, vol: 0.04 / (i * 0.3 + 1), type: "sine", fadeOut: 0.09, delay: i * 0.1, lpf: 5000 });
  });
  setTimeout(() => {
    [1175, 1397, 1568, 1760].forEach((freq, i) => {
      tone({ freq, dur: 0.15, vol: 0.035 / (i * 0.3 + 1), type: "sine", fadeOut: 0.12, delay: i * 0.1, lpf: 4500 });
    });
  }, 500);
};

/** ✅ iOS Success — the warm ascending major 4th */
const success = () => {
  tone({ freq: 880, dur: 0.08, vol: 0.04, type: "sine", fadeOut: 0.06, lpf: 4500 });
  tone({ freq: 1109, dur: 0.08, vol: 0.035, type: "sine", fadeOut: 0.06, delay: 0.06, lpf: 4200 });
  tone({ freq: 1319, dur: 0.1, vol: 0.03, type: "sine", fadeOut: 0.08, delay: 0.12, lpf: 4000 });
  tone({ freq: 1760, dur: 0.25, vol: 0.025, type: "sine", fadeOut: 0.2, delay: 0.18, lpf: 3800 });
  noiseBurst(0.01, 0.02, 4000);
};

/** ❌ iOS Error — the subtle double low-tone with haptic */
const error = () => {
  noiseBurst(0.015, 0.05, 1500);
  tone({ freq: 350, dur: 0.1, vol: 0.04, type: "triangle", fadeOut: 0.07, lpf: 1800 });
  tone({ freq: 330, dur: 0.12, vol: 0.035, type: "triangle", fadeOut: 0.09, delay: 0.1, lpf: 1500 });
  noiseBurst(0.015, 0.03, 1200);
};

/** 🔔 iOS Tab Switch — precise haptic tick */
const tabSwitch = () => {
  noiseBurst(0.008, 0.04, 4500);
  tone({ freq: 1400, dur: 0.01, vol: 0.02, type: "sine", fadeIn: 0.001, fadeOut: 0.007, lpf: 5000 });
};

/** 🔘 iOS Toggle — soft pop */
const toggle = () => {
  noiseBurst(0.01, 0.05, 3500);
  tone({ freq: 1100, dur: 0.015, vol: 0.025, type: "sine", fadeIn: 0.001, fadeOut: 0.01, lpf: 4000 });
};

/** 🗑️ iOS Delete — soft whoosh down */
const deleteSound = () => {
  slide(1200, 300, 0.12, 0.025, "sine", 3000);
  noiseBurst(0.03, 0.03, 2000);
};

/** 📋 iOS Copy/Action — quick snap */
const action = () => {
  noiseBurst(0.006, 0.05, 5500);
  tone({ freq: 2000, dur: 0.006, vol: 0.02, type: "sine", fadeIn: 0.001, fadeOut: 0.004, lpf: 6000 });
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
  playToggle: useCallback(toggle, []),
  playDelete: useCallback(deleteSound, []),
  playAction: useCallback(action, []),
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
export const playToggleSound = toggle;
export const playDeleteSound = deleteSound;
export const playActionSound = action;

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
