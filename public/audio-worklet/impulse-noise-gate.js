/**
 * ImpulseNoiseGateProcessor - AudioWorklet pour suppression de bruits impulsifs
 * 
 * Cible : clics clavier, clics souris, respiration
 * 
 * Techniques :
 * 1. Détection de transitoires : mesure la dérivée d'énergie sur 2-3ms
 *    Les clics ont une montée d'énergie très rapide (< 3ms) vs la voix (> 10ms)
 * 2. Analyse spectrale simplifiée : ratio bande large / bande vocale
 *    Clics = énergie répartie uniformément ; Voix = concentrée 100-4000Hz
 * 3. Détection de respiration : énergie < 300Hz sans formants vocaux (800-3000Hz)
 * 4. Blanking avec crossfade pour éviter les artefacts
 */
class ImpulseNoiseGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Ring buffer pour analyse temporelle (3ms @ 48kHz = 144 samples)
    this.prevEnergy = 0;
    this.prevPrevEnergy = 0;

    // Blanking state
    this.blankingSamples = 0;
    this.blankingDuration = 0; // set per mode
    this.fadeInSamples = 0;
    this.fadeInLength = 48; // ~1ms crossfade

    // Spectral analysis via autocorrelation approximation
    this.lowBandAccum = 0;  // < 300Hz
    this.midBandAccum = 0;  // 300-4000Hz (vocal)
    this.highBandAccum = 0; // > 4000Hz

    // Breathing detection
    this.breathingGain = 1.0;
    this.breathingAttackCoeff = 0.02;
    this.breathingReleaseCoeff = 0.005;

    // Mode params
    this.transientThreshold = 8.0;
    this.spectralRatioThreshold = 0.6;
    this.breathingThreshold = 2.5;
    this.blankingMs = 4;

    this._setMode('standard');

    this.port.onmessage = (event) => {
      if (event.data.type === 'setMode') {
        this._setMode(event.data.mode);
      }
    };
  }

  _setMode(mode) {
    if (mode === 'aggressive') {
      this.transientThreshold = 5.0;
      this.spectralRatioThreshold = 0.45;
      this.breathingThreshold = 1.8;
      this.blankingMs = 6;
      this.breathingAttackCoeff = 0.04;
      this.breathingReleaseCoeff = 0.008;
    } else {
      this.transientThreshold = 8.0;
      this.spectralRatioThreshold = 0.6;
      this.breathingThreshold = 2.5;
      this.blankingMs = 4;
      this.breathingAttackCoeff = 0.02;
      this.breathingReleaseCoeff = 0.005;
    }
    this.blankingDuration = Math.ceil((this.blankingMs / 1000) * sampleRate);
    this.port.postMessage({ type: 'modeChanged', mode });
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input[0] || input[0].length === 0) return true;

    const inCh = input[0];
    const outCh = output[0];
    const len = inCh.length;

    // === 1. Compute energy & spectral bands ===
    let energy = 0;
    let lowE = 0, midE = 0, highE = 0;

    // Simple band separation using sample differences (approximation)
    // Low-pass proxy: moving average of 8 samples ≈ <3kHz
    // High-pass proxy: sample-to-sample difference ≈ >3kHz
    for (let i = 0; i < len; i++) {
      const s = inCh[i];
      energy += s * s;
    }
    energy /= len;

    // Band energy approximation using first-order differences
    for (let i = 1; i < len; i++) {
      const diff = inCh[i] - inCh[i - 1]; // high frequency proxy
      highE += diff * diff;

      // Smooth proxy for low freq
      const avg = (inCh[i] + inCh[Math.max(0, i - 1)] + inCh[Math.max(0, i - 2)]) / 3;
      lowE += avg * avg;
    }
    highE /= len;
    lowE /= len;
    midE = Math.max(0, energy - lowE * 0.5 - highE * 0.5);

    // === 2. Transient detection ===
    const energyDerivative = energy - this.prevEnergy;
    const energyAccel = energyDerivative - (this.prevEnergy - this.prevPrevEnergy);
    this.prevPrevEnergy = this.prevEnergy;
    this.prevEnergy = energy;

    // Transient = sudden energy spike
    const isTransient = energyDerivative > 0 &&
      (energyDerivative / (energy + 1e-10)) > (1.0 / this.transientThreshold);

    // === 3. Spectral ratio: broadband (click) vs narrowband (voice) ===
    const totalBand = lowE + midE + highE + 1e-10;
    const highRatio = highE / totalBand;
    const isClickLike = isTransient && highRatio > this.spectralRatioThreshold;

    // === 4. Breathing detection ===
    // Breathing: low energy concentrated below 300Hz, low mid (no formants)
    const lowToMidRatio = (lowE + 1e-10) / (midE + 1e-10);
    const isBreathing = energy > 1e-8 && lowToMidRatio > this.breathingThreshold && highE < energy * 0.1;

    // === 5. Apply blanking for clicks ===
    if (isClickLike) {
      this.blankingSamples = this.blankingDuration;
    }

    // === 6. Update breathing gain ===
    if (isBreathing) {
      this.breathingGain -= this.breathingAttackCoeff;
    } else {
      this.breathingGain += this.breathingReleaseCoeff;
    }
    this.breathingGain = Math.max(0.05, Math.min(1.0, this.breathingGain));

    // === 7. Apply to output ===
    for (let i = 0; i < len; i++) {
      let gain = this.breathingGain;

      if (this.blankingSamples > 0) {
        gain = 0.01; // near-silent during blanking
        this.blankingSamples--;
        if (this.blankingSamples === 0) {
          this.fadeInSamples = this.fadeInLength;
        }
      } else if (this.fadeInSamples > 0) {
        // Smooth fade-in after blanking to avoid click
        const fadeProgress = 1.0 - (this.fadeInSamples / this.fadeInLength);
        gain *= fadeProgress;
        this.fadeInSamples--;
      }

      outCh[i] = inCh[i] * gain;
    }

    // Copy to other channels
    for (let ch = 1; ch < output.length; ch++) {
      if (input[ch]) {
        for (let i = 0; i < len; i++) {
          output[ch][i] = outCh[i];
        }
      }
    }

    return true;
  }
}

registerProcessor('impulse-noise-gate', ImpulseNoiseGateProcessor);
