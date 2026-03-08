/**
 * AdvancedNoiseProcessor - Pipeline audio avancé pour suppression de bruit
 * 
 * Pipeline :
 *   Mic → [RNNoise WASM] → [ImpulseNoiseGate] → [BiquadFilters] → [Compressor] → [Gain] → Output
 * 
 * - RNNoise : suppression bruit continu (ventilateur, ambiance)
 * - ImpulseNoiseGate : suppression bruits impulsifs (clavier, souris, respiration)
 * - BiquadFilters : post-traitement spectral
 * - Compressor : normalisation dynamique
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
  private peakingFilter: BiquadFilterNode | null = null;
  private highshelfFilter: BiquadFilterNode | null = null;
  private lowpassFilter: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private rnnoiseNode: AudioWorkletNode | null = null;
  private impulseGateNode: AudioWorkletNode | null = null;
  private fallbackWorkletNode: AudioWorkletNode | null = null;
  private mode: NoiseSuppressionMode = 'standard';
  private processingStartTime: number = 0;
  private _latencyMs: number = 0;
  private useRnnoise: boolean = false;
  private useImpulseGate: boolean = false;
  private useFallbackWorklet: boolean = false;

  async process(stream: MediaStream): Promise<MediaStream> {
    try {
      this.processingStartTime = performance.now();
      this.mode = getNoiseSuppressionMode();

      this.audioContext = new AudioContext({ sampleRate: 48000 });
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.destinationNode = this.audioContext.createMediaStreamDestination();

      let lastNode: AudioNode = this.sourceNode;

      // === Stage 1: RNNoise WASM ===
      try {
        const rnnoiseModule = await import('@sapphi-red/web-noise-suppressor');
        const { RnnoiseWorkletNode, loadRnnoise } = rnnoiseModule;

        let wasmBinary: any;
        let rnnoiseSource = 'public/rnnoise';

        try {
          const rnnoiseWorkletUrl = (await import('@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url')).default;
          const rnnoiseWasmUrl = (await import('@sapphi-red/web-noise-suppressor/rnnoise.wasm?url')).default;

          let rnnoiseSimdWasmUrl: string | undefined;
          try {
            rnnoiseSimdWasmUrl = (await import('@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url')).default;
          } catch {
            console.log('[NoiseProcessor] SIMD WASM not available');
          }

          wasmBinary = await loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl });
          await this.audioContext.audioWorklet.addModule(rnnoiseWorkletUrl);
          rnnoiseSource = 'vite-bundled';
        } catch (bundledErr) {
          await this.audioContext.audioWorklet.addModule('/rnnoise/rnnoiseWorklet.js');
          try {
            wasmBinary = await loadRnnoise({ url: '/rnnoise/rnnoise.wasm', simdUrl: '/rnnoise/rnnoise_simd.wasm' });
          } catch {
            wasmBinary = await loadRnnoise({ url: '/rnnoise/rnnoise.wasm', simdUrl: undefined });
          }
          rnnoiseSource = 'public/rnnoise';
          console.warn('[NoiseProcessor] Vite RNNoise unavailable, fallback used:', bundledErr);
        }

        this.rnnoiseNode = new RnnoiseWorkletNode(this.audioContext, { wasmBinary, maxChannels: 1 });
        this.useRnnoise = true;
        lastNode.connect(this.rnnoiseNode);
        lastNode = this.rnnoiseNode;
        console.log(`[NoiseProcessor] ✅ RNNoise loaded from ${rnnoiseSource}`);
      } catch (rnnoiseError) {
        console.warn('[NoiseProcessor] ⚠️ RNNoise failed, trying fallback:', rnnoiseError);
        this.useRnnoise = false;

        try {
          await this.audioContext.audioWorklet.addModule('/audio-worklet/noise-gate-processor.js');
          this.fallbackWorkletNode = new AudioWorkletNode(this.audioContext, 'noise-gate-processor');
          this.fallbackWorkletNode.port.postMessage({ type: 'setMode', mode: this.mode });
          this.useFallbackWorklet = true;
          lastNode.connect(this.fallbackWorkletNode);
          lastNode = this.fallbackWorkletNode;
          console.log('[NoiseProcessor] ✅ Fallback noise gate loaded');
        } catch (fallbackError) {
          console.warn('[NoiseProcessor] ⚠️ No worklet available, filter-only:', fallbackError);
          this.useFallbackWorklet = false;
        }
      }

      // === Stage 2: Impulse Noise Gate (keyboard/mouse/breathing) ===
      try {
        await this.audioContext.audioWorklet.addModule('/audio-worklet/impulse-noise-gate.js');
        this.impulseGateNode = new AudioWorkletNode(this.audioContext, 'impulse-noise-gate');
        this.impulseGateNode.port.postMessage({ type: 'setMode', mode: this.mode });
        this.useImpulseGate = true;
        lastNode.connect(this.impulseGateNode);
        lastNode = this.impulseGateNode;
        console.log('[NoiseProcessor] ✅ Impulse noise gate loaded (keyboard/mouse/breathing suppression)');
      } catch (impulseError) {
        console.warn('[NoiseProcessor] ⚠️ Impulse gate failed:', impulseError);
        this.useImpulseGate = false;
      }

      // === Stage 3: BiquadFilter chain ===
      this.highpassFilter = this.audioContext.createBiquadFilter();
      this.highpassFilter.type = 'highpass';
      this.highpassFilter.frequency.value = 85;
      this.highpassFilter.Q.value = 0.8;

      this.peakingFilter = this.audioContext.createBiquadFilter();
      this.peakingFilter.type = 'peaking';
      this.peakingFilter.frequency.value = 200;
      this.peakingFilter.Q.value = 1.0;
      this.peakingFilter.gain.value = this.mode === 'aggressive' ? -5 : -3;

      this.highshelfFilter = this.audioContext.createBiquadFilter();
      this.highshelfFilter.type = 'highshelf';
      this.highshelfFilter.frequency.value = 3000;
      this.highshelfFilter.gain.value = this.mode === 'aggressive' ? 3 : 2;

      this.lowpassFilter = this.audioContext.createBiquadFilter();
      this.lowpassFilter.type = 'lowpass';
      this.lowpassFilter.frequency.value = this.mode === 'aggressive' ? 12000 : 14000;
      this.lowpassFilter.Q.value = 0.7;

      // === Stage 4: Compressor ===
      this.compressor = this.audioContext.createDynamicsCompressor();
      if (this.mode === 'aggressive') {
        this.compressor.threshold.value = -30;
        this.compressor.knee.value = 20;
        this.compressor.ratio.value = 16;
        this.compressor.attack.value = 0.002;
        this.compressor.release.value = 0.15;
      } else {
        this.compressor.threshold.value = -24;
        this.compressor.knee.value = 30;
        this.compressor.ratio.value = 8;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.25;
      }

      // === Stage 5: Output gain ===
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0;

      // Connect chain
      lastNode
        .connect(this.highpassFilter)
        .connect(this.peakingFilter)
        .connect(this.highshelfFilter)
        .connect(this.lowpassFilter)
        .connect(this.compressor)
        .connect(this.gainNode)
        .connect(this.destinationNode);

      this._latencyMs = performance.now() - this.processingStartTime;

      const engines = [
        this.useRnnoise ? 'RNNoise' : this.useFallbackWorklet ? 'NoiseGate' : null,
        this.useImpulseGate ? 'ImpulseGate' : null,
      ].filter(Boolean).join('+') || 'Filters-only';

      console.log(`[NoiseProcessor] Pipeline ready in ${this._latencyMs.toFixed(1)}ms | mode=${this.mode} | engine=${engines}`);

      return this.destinationNode.stream;
    } catch (error) {
      console.error('[NoiseProcessor] Pipeline failed:', error);
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
    if (this.peakingFilter) {
      this.peakingFilter.gain.value = mode === 'aggressive' ? -5 : -3;
    }
    if (this.highshelfFilter) {
      this.highshelfFilter.gain.value = mode === 'aggressive' ? 3 : 2;
    }
    if (this.lowpassFilter) {
      this.lowpassFilter.frequency.value = mode === 'aggressive' ? 12000 : 14000;
    }
    if (this.compressor) {
      if (mode === 'aggressive') {
        this.compressor.threshold.value = -30;
        this.compressor.knee.value = 20;
        this.compressor.ratio.value = 16;
        this.compressor.attack.value = 0.002;
        this.compressor.release.value = 0.15;
      } else {
        this.compressor.threshold.value = -24;
        this.compressor.knee.value = 30;
        this.compressor.ratio.value = 8;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.25;
      }
    }
    console.log(`[NoiseProcessor] Mode changed to: ${mode}`);
  }

  getLatency(): number {
    if (!this.audioContext) return 0;
    const baseLatency = (this.audioContext.baseLatency || 0) * 1000;
    const outputLatency = (this.audioContext.outputLatency || 0) * 1000;
    const rnnoiseLatency = this.useRnnoise ? 10 : this.useFallbackWorklet ? (128 / 48000) * 1000 : 0;
    const impulseLatency = this.useImpulseGate ? (128 / 48000) * 1000 : 0;
    return Math.round(baseLatency + outputLatency + rnnoiseLatency + impulseLatency);
  }

  isRnnoiseActive(): boolean {
    return this.useRnnoise;
  }

  isImpulseGateActive(): boolean {
    return this.useImpulseGate;
  }

  cleanup() {
    try {
      this.sourceNode?.disconnect();
      if (this.rnnoiseNode) {
        (this.rnnoiseNode as any).destroy?.();
        this.rnnoiseNode.disconnect();
      }
      this.impulseGateNode?.disconnect();
      this.fallbackWorkletNode?.disconnect();
      this.highpassFilter?.disconnect();
      this.peakingFilter?.disconnect();
      this.highshelfFilter?.disconnect();
      this.lowpassFilter?.disconnect();
      this.compressor?.disconnect();
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
    this.peakingFilter = null;
    this.highshelfFilter = null;
    this.lowpassFilter = null;
    this.compressor = null;
    this.gainNode = null;
  }
}
