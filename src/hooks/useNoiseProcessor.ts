/**
 * AdvancedNoiseProcessor - Pipeline audio avancé pour suppression de bruit
 * 
 * Architecture du pipeline :
 * 
 *   Microphone (MediaStream)
 *       |
 *       v
 *   [MediaTrackConstraints: noiseSuppression, echoCancellation, autoGainControl]
 *       |
 *       v
 *   [RNNoise WASM - Réseau neuronal récurrent pour séparation voix/bruit]
 *       |  - Modèle entraîné sur des milliers d'heures de données vocales
 *       |  - Traitement par blocs de 480 samples (10ms à 48kHz)
 *       |  - Suppression intelligente du bruit sans affecter la voix
 *       |  - Équivalent à la technologie utilisée par Discord/Krisp
 *       |
 *       v
 *   [BiquadFilter Chain - Post-traitement]
 *       |  - Highpass 85Hz Q=0.8 (rumble résiduel)
 *       |  - Peaking 200Hz gain=-3dB (muddiness)
 *       |  - Highshelf 3kHz gain=+2dB (présence vocale)
 *       |  - Lowpass 14kHz Q=0.7 (hiss résiduel)
 *       |
 *       v
 *   [DynamicsCompressor - optimisé voix]
 *       |
 *       v
 *   [GainNode - volume de sortie]
 *       |
 *       v
 *   MediaStreamDestination --> WebRTC
 * 
 * Modes :
 * - "standard" : RNNoise + filtrage léger, compressor doux
 * - "aggressive" : RNNoise + filtrage vocal fort, compressor fort
 * 
 * Fallback : Si RNNoise WASM ne charge pas, utilise le noise gate
 * AudioWorklet comme solution de repli.
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
  private fallbackWorkletNode: AudioWorkletNode | null = null;
  private mode: NoiseSuppressionMode = 'standard';
  private processingStartTime: number = 0;
  private _latencyMs: number = 0;
  private useRnnoise: boolean = false;
  private useFallbackWorklet: boolean = false;

  /**
   * Traite un MediaStream audio à travers le pipeline de suppression de bruit.
   * Cœur du pipeline : RNNoise WASM (réseau neuronal).
   * Retourne un nouveau MediaStream traité.
   */
  async process(stream: MediaStream): Promise<MediaStream> {
    try {
      this.processingStartTime = performance.now();
      this.mode = getNoiseSuppressionMode();

      // RNNoise requiert exactement 48kHz
      this.audioContext = new AudioContext({ sampleRate: 48000 });
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.destinationNode = this.audioContext.createMediaStreamDestination();

      let lastNode: AudioNode = this.sourceNode;

      // === Étape 1 : RNNoise WASM (cœur du pipeline) ===
      try {
        const { RnnoiseWorkletNode, loadRnnoise } = await import('@sapphi-red/web-noise-suppressor');

        // Charger les fichiers WASM et worklet via Vite
        const rnnoiseWorkletUrl = new URL(
          '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js',
          import.meta.url
        ).href;
        const rnnoiseWasmUrl = new URL(
          '@sapphi-red/web-noise-suppressor/rnnoise.wasm',
          import.meta.url
        ).href;
        const rnnoiseSimdWasmUrl = new URL(
          '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm',
          import.meta.url
        ).href;

        // Charger le binaire WASM (avec support SIMD automatique)
        const wasmBinary = await loadRnnoise({
          url: rnnoiseWasmUrl,
          simdUrl: rnnoiseSimdWasmUrl,
        });

        // Charger le worklet processor
        await this.audioContext.audioWorklet.addModule(rnnoiseWorkletUrl);

        // Créer le node RNNoise
        this.rnnoiseNode = new RnnoiseWorkletNode(this.audioContext, {
          wasmBinary,
          maxChannels: 1,
        });

        this.useRnnoise = true;
        lastNode.connect(this.rnnoiseNode);
        lastNode = this.rnnoiseNode;

        console.log('[AdvancedNoiseProcessor] ✅ RNNoise WASM loaded - neural network noise suppression active');
      } catch (rnnoiseError) {
        console.warn('[AdvancedNoiseProcessor] ⚠️ RNNoise WASM failed, trying fallback noise gate:', rnnoiseError);
        this.useRnnoise = false;

        // === Fallback : noise gate AudioWorklet ===
        try {
          await this.audioContext.audioWorklet.addModule('/audio-worklet/noise-gate-processor.js');
          this.fallbackWorkletNode = new AudioWorkletNode(this.audioContext, 'noise-gate-processor');
          this.fallbackWorkletNode.port.postMessage({ type: 'setMode', mode: this.mode });
          this.useFallbackWorklet = true;

          lastNode.connect(this.fallbackWorkletNode);
          lastNode = this.fallbackWorkletNode;

          console.log('[AdvancedNoiseProcessor] ✅ Fallback noise gate loaded');
        } catch (fallbackError) {
          console.warn('[AdvancedNoiseProcessor] ⚠️ No worklet available, filter-only pipeline:', fallbackError);
          this.useFallbackWorklet = false;
        }
      }

      // === Étape 2 : Chain de filtres BiquadFilter (post-traitement) ===

      // 1. Highpass 85Hz - Supprime le rumble basse fréquence résiduel
      this.highpassFilter = this.audioContext.createBiquadFilter();
      this.highpassFilter.type = 'highpass';
      this.highpassFilter.frequency.value = 85;
      this.highpassFilter.Q.value = 0.8;

      // 2. Peaking à 200Hz - Réduit le "muddiness"
      this.peakingFilter = this.audioContext.createBiquadFilter();
      this.peakingFilter.type = 'peaking';
      this.peakingFilter.frequency.value = 200;
      this.peakingFilter.Q.value = 1.0;
      this.peakingFilter.gain.value = this.mode === 'aggressive' ? -5 : -3;

      // 3. Highshelf à 3kHz - Boost la présence vocale
      this.highshelfFilter = this.audioContext.createBiquadFilter();
      this.highshelfFilter.type = 'highshelf';
      this.highshelfFilter.frequency.value = 3000;
      this.highshelfFilter.gain.value = this.mode === 'aggressive' ? 3 : 2;

      // 4. Lowpass 14kHz - Supprime le sifflement haute fréquence résiduel
      this.lowpassFilter = this.audioContext.createBiquadFilter();
      this.lowpassFilter.type = 'lowpass';
      this.lowpassFilter.frequency.value = this.mode === 'aggressive' ? 12000 : 14000;
      this.lowpassFilter.Q.value = 0.7;

      // === Étape 3 : Compresseur dynamique optimisé pour la voix ===
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

      // === Gain de sortie ===
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0;

      // Connecter la chaîne complète : [RNNoise|Gate|Source] → filters → compressor → gain → destination
      lastNode
        .connect(this.highpassFilter)
        .connect(this.peakingFilter)
        .connect(this.highshelfFilter)
        .connect(this.lowpassFilter)
        .connect(this.compressor)
        .connect(this.gainNode)
        .connect(this.destinationNode);

      this._latencyMs = performance.now() - this.processingStartTime;

      const engine = this.useRnnoise ? 'RNNoise-WASM' : this.useFallbackWorklet ? 'NoiseGate-Worklet' : 'Filters-only';
      console.log(`[AdvancedNoiseProcessor] Pipeline created in ${this._latencyMs.toFixed(1)}ms | mode=${this.mode} | engine=${engine}`);

      return this.destinationNode.stream;
    } catch (error) {
      console.error('[AdvancedNoiseProcessor] Failed to create pipeline:', error);
      return stream; // Fallback : retourne le stream original
    }
  }

  /**
   * Change le mode de suppression de bruit en temps réel.
   * Met à jour les paramètres des filtres et du compresseur.
   * Note: RNNoise n'a pas de mode - il traite toujours au maximum.
   * Le mode affecte uniquement le post-traitement (filtres + compresseur).
   */
  setMode(mode: NoiseSuppressionMode) {
    this.mode = mode;
    setNoiseSuppressionMode(mode);

    // Mettre à jour le noise gate fallback si utilisé
    if (this.fallbackWorkletNode) {
      this.fallbackWorkletNode.port.postMessage({ type: 'setMode', mode });
    }

    // Mettre à jour les paramètres des filtres
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

    console.log(`[AdvancedNoiseProcessor] Mode changed to: ${mode}`);
  }

  /**
   * Retourne la latence estimée du pipeline en millisecondes.
   * RNNoise traite par blocs de 480 samples à 48kHz = 10ms.
   */
  getLatency(): number {
    if (!this.audioContext) return 0;
    const baseLatency = (this.audioContext.baseLatency || 0) * 1000;
    const outputLatency = (this.audioContext.outputLatency || 0) * 1000;
    // RNNoise: 480 samples at 48kHz = 10ms
    // Fallback worklet: 128 samples at 48kHz = ~2.67ms
    const processingLatency = this.useRnnoise ? 10 : this.useFallbackWorklet ? (128 / 48000) * 1000 : 0;
    return Math.round(baseLatency + outputLatency + processingLatency);
  }

  /**
   * Indique si RNNoise est actif (true = neural network, false = fallback).
   */
  isRnnoiseActive(): boolean {
    return this.useRnnoise;
  }

  /**
   * Nettoie toutes les ressources audio.
   */
  cleanup() {
    try {
      this.sourceNode?.disconnect();
      
      // Cleanup RNNoise node
      if (this.rnnoiseNode) {
        (this.rnnoiseNode as any).destroy?.();
        this.rnnoiseNode.disconnect();
      }
      
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
      console.error('[AdvancedNoiseProcessor] Cleanup error:', error);
    }
    
    this.audioContext = null;
    this.sourceNode = null;
    this.destinationNode = null;
    this.rnnoiseNode = null;
    this.fallbackWorkletNode = null;
    this.highpassFilter = null;
    this.peakingFilter = null;
    this.highshelfFilter = null;
    this.lowpassFilter = null;
    this.compressor = null;
    this.gainNode = null;
  }
}
