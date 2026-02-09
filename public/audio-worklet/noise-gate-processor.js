/**
 * NoiseGateProcessor - AudioWorklet pour noise gate adaptatif
 * 
 * Pipeline :
 * 1. Calcul RMS par bloc de 128 samples
 * 2. Noise floor adaptatif (monte lentement ~2s, descend vite ~200ms)
 * 3. Gate intelligent avec attack/release smooth
 * 4. Hold time 150ms pour éviter coupures entre mots
 * 5. Gain minimum -40dB (pas de coupure totale = pas d'effet robot)
 * 
 * Modes :
 * - standard : marge=10dB, release=150ms, floorMin=-50dB
 * - aggressive : marge=6dB, release=80ms, floorMin=-60dB
 */
class NoiseGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // Noise floor adaptatif
    this.noiseFloor = -50; // dB
    this.noiseFloorSmooth = -50;
    
    // Gate state
    this.gateGain = 0; // 0 = fermé, 1 = ouvert
    this.holdCounter = 0;
    
    // Mode parameters (standard par défaut)
    this.marginDb = 10;
    this.attackMs = 5;
    this.releaseMs = 150;
    this.holdMs = 150;
    this.floorMinDb = -50;
    this.minGainLinear = Math.pow(10, -40 / 20); // -40dB = 0.01
    
    // Precomputed coefficients (updated on mode change)
    this._updateCoefficients();
    
    // Listen for mode changes from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'setMode') {
        this._setMode(event.data.mode);
      }
    };
  }

  _updateCoefficients() {
    // Convert ms to per-sample coefficients at 48kHz, 128 samples/block
    const blocksPerSecond = sampleRate / 128;
    this.attackCoeff = 1 - Math.exp(-1 / (this.attackMs * 0.001 * blocksPerSecond));
    this.releaseCoeff = 1 - Math.exp(-1 / (this.releaseMs * 0.001 * blocksPerSecond));
    this.holdBlocks = Math.ceil(this.holdMs * 0.001 * blocksPerSecond);
    
    // Noise floor adaptation rates
    // Rise slowly (~2s) to adapt to new ambient noise
    this.floorRiseCoeff = 1 - Math.exp(-1 / (2.0 * blocksPerSecond));
    // Fall quickly (~200ms) when noise drops
    this.floorFallCoeff = 1 - Math.exp(-1 / (0.2 * blocksPerSecond));
  }

  _setMode(mode) {
    if (mode === 'aggressive') {
      this.marginDb = 6;
      this.attackMs = 3;
      this.releaseMs = 80;
      this.holdMs = 100;
      this.floorMinDb = -60;
    } else {
      // standard
      this.marginDb = 10;
      this.attackMs = 5;
      this.releaseMs = 150;
      this.holdMs = 150;
      this.floorMinDb = -50;
    }
    this.minGainLinear = Math.pow(10, -40 / 20);
    this._updateCoefficients();
    
    this.port.postMessage({ type: 'modeChanged', mode });
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input[0] || input[0].length === 0) {
      return true;
    }

    const inputChannel = input[0];
    const outputChannel = output[0];
    const blockSize = inputChannel.length; // typically 128

    // 1. Calculate RMS level in dB
    let sumSquares = 0;
    for (let i = 0; i < blockSize; i++) {
      sumSquares += inputChannel[i] * inputChannel[i];
    }
    const rms = Math.sqrt(sumSquares / blockSize);
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -100;

    // 2. Update adaptive noise floor
    if (rmsDb < this.noiseFloorSmooth) {
      // Noise dropped - fall quickly
      this.noiseFloorSmooth += (rmsDb - this.noiseFloorSmooth) * this.floorFallCoeff;
    } else {
      // Noise rising - adapt slowly
      this.noiseFloorSmooth += (rmsDb - this.noiseFloorSmooth) * this.floorRiseCoeff;
    }
    // Clamp noise floor
    this.noiseFloorSmooth = Math.max(this.floorMinDb, Math.min(-10, this.noiseFloorSmooth));

    // 3. Gate logic
    const threshold = this.noiseFloorSmooth + this.marginDb;
    const isAboveThreshold = rmsDb > threshold;

    if (isAboveThreshold) {
      // Signal detected - open gate
      this.holdCounter = this.holdBlocks;
      // Smooth attack
      this.gateGain += (1.0 - this.gateGain) * this.attackCoeff;
    } else if (this.holdCounter > 0) {
      // Hold period - keep gate open
      this.holdCounter--;
      this.gateGain += (1.0 - this.gateGain) * this.attackCoeff * 0.5;
    } else {
      // Below threshold and hold expired - close gate
      this.gateGain += (0.0 - this.gateGain) * this.releaseCoeff;
    }

    // Clamp gate gain
    this.gateGain = Math.max(0, Math.min(1, this.gateGain));

    // 4. Apply gain with minimum floor (never fully silent = no robot effect)
    const effectiveGain = this.minGainLinear + this.gateGain * (1.0 - this.minGainLinear);

    for (let i = 0; i < blockSize; i++) {
      outputChannel[i] = inputChannel[i] * effectiveGain;
    }

    // Copy remaining channels
    for (let ch = 1; ch < output.length; ch++) {
      if (input[ch]) {
        for (let i = 0; i < blockSize; i++) {
          output[ch][i] = input[ch][i] * effectiveGain;
        }
      }
    }

    return true;
  }
}

registerProcessor('noise-gate-processor', NoiseGateProcessor);
