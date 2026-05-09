/**
 * AdvancedNoiseProcessor - Pipeline temps réel ultra-propre
 *
 * Pipeline (ordre optimisé pour clarté maximale, latence minimale):
 *   Mic
 *    → HighPass 80Hz       (rumble/grondement avant la VAD)
 *    → RNNoise WASM        (DNN — bruit stationnaire + voix)
 *    → ImpulseGate         (clavier/souris/respiration résiduels)
 *    → DeEsser (aggressive) (sibilances 6.5kHz)
 *    → AirShelf            (présence aiguës +2dB @ 8kHz)
 *    → Limiter brick-wall  (sécurité de sortie, pas de pompage)
 *    → Gain
 *    → Output
 *
 * Moteur principal : @timephy/rnnoise-wasm (dérivé Jitsi, single-worklet,
 * pas besoin de COOP/COEP, latence 13.3ms).
 * Fallback : @sapphi-red/web-noise-suppressor.
 * Fallback ultime : worklet custom + filtres uniquement.
 *
 * NB: pas de Compressor pompant ni de LowPass brutal — la voix reste
 * naturelle, full-band jusqu'à 18kHz.
 */

export type NoiseSuppressionMode = 'standard' | 'aggressive';

const NOISE_MODE_KEY = 'noiseSuppressionMode';

export const getNoiseSuppressionMode = (): NoiseSuppressionMode => {
  const stored = localStorage.getItem(NOISE_MODE_KEY);
  return (stored === 'aggressive') ? 'aggressive' : 'standard';
};

export const setNoiseSuppressionMode = (mode: NoiseSuppressionMode) => {
  localStorage.setItem(NOISE_MODE_KEY, mode);
  window.dispatchEvent(new CustomEvent('audioSettingsChange'));
};

export class AdvancedNoiseProcessor {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private gainNode: GainNode | null = null;
  private highpassFilter: BiquadFilterNode | null = null;
  private deEsserFilter: BiquadFilterNode | null = null;
  private airShelfFilter: BiquadFilterNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private rnnoiseNode: AudioWorkletNode | null = null;
  private impulseGateNode: AudioWorkletNode | null = null;
  private fallbackWorkletNode: AudioWorkletNode | null = null;
  private mode: NoiseSuppressionMode = 'standard';
  private processingStartTime: number = 0;
  private _latencyMs: number = 0;
  private engineName: string = 'none';

  async process(stream: MediaStream): Promise<MediaStream> {
    try {
      this.processingStartTime = performance.now();
      this.mode = getNoiseSuppressionMode();

      // Use device sample rate when possible (avoids double resampling).
      // RNNoise s'attend à 48kHz; AudioContext resamplera depuis le device si besoin.
      this.audioContext = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.destinationNode = this.audioContext.createMediaStreamDestination();

      // === Stage 0: HighPass 80Hz (avant RNNoise pour nettoyer la VAD) ===
      this.highpassFilter = this.audioContext.createBiquadFilter();
      this.highpassFilter.type = 'highpass';
      this.highpassFilter.frequency.value = 80;
      this.highpassFilter.Q.value = 0.707;

      let lastNode: AudioNode = this.sourceNode;
      lastNode.connect(this.highpassFilter);
      lastNode = this.highpassFilter;

      // === Stage 1: RNNoise — moteur principal @timephy/rnnoise-wasm ===
      let rnnoiseLoaded = false;
      try {
        const { NoiseSuppressorWorklet_Name } = await import('@timephy/rnnoise-wasm');
        const workletUrl = (await import('@timephy/rnnoise-wasm/NoiseSuppressorWorklet?url')).default;
        await this.audioContext.audioWorklet.addModule(workletUrl);
        this.rnnoiseNode = new AudioWorkletNode(this.audioContext, NoiseSuppressorWorklet_Name);
        lastNode.connect(this.rnnoiseNode);
        lastNode = this.rnnoiseNode;
        rnnoiseLoaded = true;
        this.engineName = 'RNNoise(timephy)';
        console.log('[NoiseProcessor] ✅ RNNoise (timephy) loaded — single-worklet, no SAB');
      } catch (timephyErr) {
        console.warn('[NoiseProcessor] timephy unavailable, trying sapphi-red:', timephyErr);
      }

      // Fallback 1: sapphi-red
      if (!rnnoiseLoaded) {
        try {
          const { RnnoiseWorkletNode, loadRnnoise } = await import('@sapphi-red/web-noise-suppressor');
          const rnnoiseWorkletUrl = (await import('@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url')).default;
          const rnnoiseWasmUrl = (await import('@sapphi-red/web-noise-suppressor/rnnoise.wasm?url')).default;
          let simdUrl: string | undefined;
          try {
            simdUrl = (await import('@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url')).default;
          } catch {}
          const wasmBinary = await loadRnnoise({ url: rnnoiseWasmUrl, simdUrl });
          await this.audioContext.audioWorklet.addModule(rnnoiseWorkletUrl);
          this.rnnoiseNode = new RnnoiseWorkletNode(this.audioContext, { wasmBinary, maxChannels: 1 });
          lastNode.connect(this.rnnoiseNode);
          lastNode = this.rnnoiseNode;
          rnnoiseLoaded = true;
          this.engineName = 'RNNoise(sapphi)';
          console.log('[NoiseProcessor] ✅ RNNoise (sapphi-red) fallback loaded');
        } catch (sapphiErr) {
          console.warn('[NoiseProcessor] sapphi-red also unavailable:', sapphiErr);
        }
      }

      // Fallback 2: noise gate worklet
      if (!rnnoiseLoaded) {
        try {
          await this.audioContext.audioWorklet.addModule('/audio-worklet/noise-gate-processor.js');
          this.fallbackWorkletNode = new AudioWorkletNode(this.audioContext, 'noise-gate-processor');
          this.fallbackWorkletNode.port.postMessage({ type: 'setMode', mode: this.mode });
          lastNode.connect(this.fallbackWorkletNode);
          lastNode = this.fallbackWorkletNode;
          this.engineName = 'NoiseGate';
          console.log('[NoiseProcessor] ⚠️ Fallback noise gate active');
        } catch (gateErr) {
          console.warn('[NoiseProcessor] No worklet available, filters only:', gateErr);
          this.engineName = 'Filters-only';
        }
      }

      // === Stage 2: Impulse Noise Gate (clavier/souris/respiration résiduels) ===
      try {
        await this.audioContext.audioWorklet.addModule('/audio-worklet/impulse-noise-gate.js');
        this.impulseGateNode = new AudioWorkletNode(this.audioContext, 'impulse-noise-gate');
        this.impulseGateNode.port.postMessage({ type: 'setMode', mode: this.mode });
        lastNode.connect(this.impulseGateNode);
        lastNode = this.impulseGateNode;
        console.log('[NoiseProcessor] ✅ Impulse gate loaded');
      } catch (impulseError) {
        console.warn('[NoiseProcessor] Impulse gate unavailable:', impulseError);
      }

      // === Stage 3: De-esser (sibilances) — actif surtout en aggressive ===
      this.deEsserFilter = this.audioContext.createBiquadFilter();
      this.deEsserFilter.type = 'peaking';
      this.deEsserFilter.frequency.value = 6500;
      this.deEsserFilter.Q.value = 3.5;
      this.deEsserFilter.gain.value = this.mode === 'aggressive' ? -4 : -1.5;

      // === Stage 4: Air shelf (présence/intelligibilité) ===
      this.airShelfFilter = this.audioContext.createBiquadFilter();
      this.airShelfFilter.type = 'highshelf';
      this.airShelfFilter.frequency.value = 8000;
      this.airShelfFilter.gain.value = this.mode === 'aggressive' ? 2.5 : 1.5;

      // === Stage 5: Limiter brick-wall (sécurité, PAS un compressor pompant) ===
      this.limiter = this.audioContext.createDynamicsCompressor();
      this.limiter.threshold.value = -3;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.001;
      this.limiter.release.value = 0.05;

      // === Stage 6: Output gain ===
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0;

      lastNode
        .connect(this.deEsserFilter)
        .connect(this.airShelfFilter)
        .connect(this.limiter)
        .connect(this.gainNode)
        .connect(this.destinationNode);

      this._latencyMs = performance.now() - this.processingStartTime;
      console.log(`[NoiseProcessor] Pipeline ready in ${this._latencyMs.toFixed(1)}ms | mode=${this.mode} | engine=${this.engineName}`);

      return this.destinationNode.stream;
    } catch (error) {
      console.error('[NoiseProcessor] Pipeline failed, bypassing:', error);
      return stream;
    }
  }

  setMode(mode: NoiseSuppressionMode) {
    this.mode = mode;
    setNoiseSuppressionMode(mode);

    if (this.impulseGateNode) {
      this.impulseGateNode.port.postMessage({ type: 'setMode', mode });
    }
    if (this.fallbackWorkletNode) {
      this.fallbackWorkletNode.port.postMessage({ type: 'setMode', mode });
    }
    if (this.deEsserFilter) {
      this.deEsserFilter.gain.value = mode === 'aggressive' ? -4 : -1.5;
    }
    if (this.airShelfFilter) {
      this.airShelfFilter.gain.value = mode === 'aggressive' ? 2.5 : 1.5;
    }
    console.log(`[NoiseProcessor] Mode → ${mode}`);
  }

  getLatency(): number {
    if (!this.audioContext) return 0;
    const baseLatency = (this.audioContext.baseLatency || 0) * 1000;
    const outputLatency = (this.audioContext.outputLatency || 0) * 1000;
    const rnnoiseLatency = this.rnnoiseNode ? 13.3 : 0; // 640 samples @ 48kHz
    const impulseLatency = this.impulseGateNode ? (128 / 48000) * 1000 : 0;
    return Math.round(baseLatency + outputLatency + rnnoiseLatency + impulseLatency);
  }

  isRnnoiseActive(): boolean {
    return this.rnnoiseNode !== null;
  }

  isImpulseGateActive(): boolean {
    return this.impulseGateNode !== null;
  }

  getEngineName(): string {
    return this.engineName;
  }

  cleanup() {
    try {
      this.sourceNode?.disconnect();
      if (this.rnnoiseNode) {
        try { (this.rnnoiseNode as any).destroy?.(); } catch {}
        this.rnnoiseNode.disconnect();
      }
      this.impulseGateNode?.disconnect();
      this.fallbackWorkletNode?.disconnect();
      this.highpassFilter?.disconnect();
      this.deEsserFilter?.disconnect();
      this.airShelfFilter?.disconnect();
      this.limiter?.disconnect();
      this.gainNode?.disconnect();
      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close();
      }
    } catch (error) {
      console.error('[NoiseProcessor] Cleanup error:', error);
    }
    this.audioContext = null;
    this.sourceNode = null;
    this.destinationNode = null;
    this.rnnoiseNode = null;
    this.impulseGateNode = null;
    this.fallbackWorkletNode = null;
    this.highpassFilter = null;
    this.deEsserFilter = null;
    this.airShelfFilter = null;
    this.limiter = null;
    this.gainNode = null;
  }
}
