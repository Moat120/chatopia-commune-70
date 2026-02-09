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
 *   [AudioWorklet "NoiseGateProcessor"] (noise gate adaptatif)
 *       |
 *       v
 *   [BiquadFilter Chain]
 *       |  - Highpass 85Hz Q=0.8 (rumble)
 *       |  - Peaking 200Hz gain=-3dB (muddiness)
 *       |  - Highshelf 3kHz gain=+2dB (présence vocale)
 *       |  - Lowpass 14kHz Q=0.7 (hiss)
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
 * - "standard" : filtrage léger, compressor doux, gate avec grande marge
 * - "aggressive" : gate agressif, filtrage vocal fort, compressor fort
 * 
 * Fallback : Si AudioWorklet n'est pas supporté, le gate est ignoré
 * et seul le filtrage + compressor est appliqué.
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
  private workletNode: AudioWorkletNode | null = null;
  private mode: NoiseSuppressionMode = 'standard';
  private processingStartTime: number = 0;
  private _latencyMs: number = 0;
  private useWorklet: boolean = false;

  /**
   * Traite un MediaStream audio à travers le pipeline de suppression de bruit.
   * Retourne un nouveau MediaStream traité.
   */
  async process(stream: MediaStream): Promise<MediaStream> {
    try {
      this.processingStartTime = performance.now();
      this.mode = getNoiseSuppressionMode();

      // Créer le contexte audio à 48kHz pour qualité optimale
      this.audioContext = new AudioContext({ sampleRate: 48000 });
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.destinationNode = this.audioContext.createMediaStreamDestination();

      // Tenter de charger l'AudioWorklet pour le noise gate
      let lastNode: AudioNode = this.sourceNode;
      
      try {
        await this.audioContext.audioWorklet.addModule('/audio-worklet/noise-gate-processor.js');
        this.workletNode = new AudioWorkletNode(this.audioContext, 'noise-gate-processor');
        this.workletNode.port.postMessage({ type: 'setMode', mode: this.mode });
        this.useWorklet = true;
        
        // Connecter source -> worklet
        lastNode.connect(this.workletNode);
        lastNode = this.workletNode;
        
        console.log('[AdvancedNoiseProcessor] AudioWorklet noise gate loaded');
      } catch (workletError) {
        // Fallback : pas de noise gate, on continue avec le filtrage
        console.warn('[AdvancedNoiseProcessor] AudioWorklet not supported, using filter-only pipeline:', workletError);
        this.useWorklet = false;
      }

      // === Chain de filtres BiquadFilter ===

      // 1. Highpass 85Hz - Supprime le rumble basse fréquence
      this.highpassFilter = this.audioContext.createBiquadFilter();
      this.highpassFilter.type = 'highpass';
      this.highpassFilter.frequency.value = 85;
      this.highpassFilter.Q.value = 0.8;

      // 2. Peaking à 200Hz gain=-3dB - Réduit le "muddiness"
      this.peakingFilter = this.audioContext.createBiquadFilter();
      this.peakingFilter.type = 'peaking';
      this.peakingFilter.frequency.value = 200;
      this.peakingFilter.Q.value = 1.0;
      this.peakingFilter.gain.value = this.mode === 'aggressive' ? -5 : -3;

      // 3. Highshelf à 3kHz gain=+2dB - Boost la présence vocale
      this.highshelfFilter = this.audioContext.createBiquadFilter();
      this.highshelfFilter.type = 'highshelf';
      this.highshelfFilter.frequency.value = 3000;
      this.highshelfFilter.gain.value = this.mode === 'aggressive' ? 3 : 2;

      // 4. Lowpass 14kHz - Supprime le sifflement haute fréquence
      this.lowpassFilter = this.audioContext.createBiquadFilter();
      this.lowpassFilter.type = 'lowpass';
      this.lowpassFilter.frequency.value = this.mode === 'aggressive' ? 12000 : 14000;
      this.lowpassFilter.Q.value = 0.7;

      // === Compresseur dynamique optimisé pour la voix ===
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

      // Connecter la chaîne complète
      lastNode
        .connect(this.highpassFilter)
        .connect(this.peakingFilter)
        .connect(this.highshelfFilter)
        .connect(this.lowpassFilter)
        .connect(this.compressor)
        .connect(this.gainNode)
        .connect(this.destinationNode);

      this._latencyMs = performance.now() - this.processingStartTime;
      
      console.log(`[AdvancedNoiseProcessor] Pipeline created in ${this._latencyMs.toFixed(1)}ms | mode=${this.mode} | worklet=${this.useWorklet}`);

      return this.destinationNode.stream;
    } catch (error) {
      console.error('[AdvancedNoiseProcessor] Failed to create pipeline:', error);
      return stream; // Fallback : retourne le stream original
    }
  }

  /**
   * Change le mode de suppression de bruit en temps réel.
   * Met à jour le noise gate et les paramètres des filtres.
   */
  setMode(mode: NoiseSuppressionMode) {
    this.mode = mode;
    setNoiseSuppressionMode(mode);

    // Mettre à jour le noise gate via le port de l'AudioWorklet
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'setMode', mode });
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
   * Basé sur la taille du buffer AudioWorklet (128 samples à 48kHz ≈ 2.67ms)
   * plus le traitement des filtres.
   */
  getLatency(): number {
    if (!this.audioContext) return 0;
    // Base latency: AudioContext base latency + output latency
    const baseLatency = (this.audioContext.baseLatency || 0) * 1000;
    const outputLatency = (this.audioContext.outputLatency || 0) * 1000;
    // AudioWorklet block size: 128 samples at 48kHz = ~2.67ms
    const workletLatency = this.useWorklet ? (128 / 48000) * 1000 : 0;
    return Math.round(baseLatency + outputLatency + workletLatency);
  }

  /**
   * Nettoie toutes les ressources audio.
   */
  cleanup() {
    try {
      this.sourceNode?.disconnect();
      this.workletNode?.disconnect();
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
    this.workletNode = null;
    this.highpassFilter = null;
    this.peakingFilter = null;
    this.highshelfFilter = null;
    this.lowpassFilter = null;
    this.compressor = null;
    this.gainNode = null;
  }
}
