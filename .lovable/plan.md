

# Plan de refonte : Controle de volume individuel, suppression de bruit avancee et corrections

## Partie 1 : Suppression de bruit avancee (niveau Discord)

Le systeme actuel utilise un simple filtre highpass/lowpass + compressor, ce qui est insuffisant. L'objectif est d'implementer un pipeline audio multi-couches.

### Pipeline audio propose

```text
Microphone
    |
    v
[MediaTrackConstraints: noiseSuppression, echoCancellation, autoGainControl]
    |
    v
[Web Audio API - AudioWorkletProcessor "NoiseGateProcessor"]
    |  - Analyse spectrale en temps reel (FFT)
    |  - Noise gate intelligent avec seuil adaptatif
    |  - Suppression des frequences non-vocales
    |  - Lissage temporel pour eviter les coupures
    |
    v
[BiquadFilter Chain]
    |  - Highpass 85Hz Q=0.8 (rumble)
    |  - Peaking 200Hz gain=-3dB (muddiness)
    |  - Highshelf 3kHz gain=+2dB (presence vocale)
    |  - Lowpass 14kHz Q=0.7 (hiss)
    |
    v
[DynamicsCompressor - optimise voix]
    |
    v
[GainNode - volume de sortie]
    |
    v
MediaStreamDestination --> WebRTC
```

### Fichiers a creer/modifier

**Nouveau fichier : `src/hooks/useNoiseProcessor.ts`**
- Classe `AdvancedNoiseProcessor` avec :
  - Mode "standard" : filtrage leger (highpass + lowpass + compressor doux)
  - Mode "agressif" : noise gate adaptatif + filtrage vocal + compressor fort
  - Methode `process(stream)` qui retourne un `MediaStream` traite
  - Methode `setMode(mode: 'standard' | 'aggressive')`
  - Methode `cleanup()`
  - Statistiques de latence audio (`getLatency()`)
  - Fallback automatique si AudioWorklet non supporte : utilise ScriptProcessorNode

**Nouveau fichier : `public/audio-worklet/noise-gate-processor.js`**
- AudioWorkletProcessor qui :
  - Calcule le niveau RMS par bloc de 128 samples
  - Maintient un seuil adaptatif (noise floor qui s'ajuste)
  - Applique un gate avec attack/release smooth (pas de clic)
  - Priorite aux frequences vocales (300Hz-3400Hz)
  - Latence cible < 10ms

**Modification : `src/components/SettingsDialog.tsx`**
- Ajouter un selecteur de mode de suppression : "Standard" / "Agressif"
- Ajouter un indicateur de latence audio en temps reel
- Corriger le debordement avec `max-h-[80vh]` et meilleure gestion du ScrollArea
- Stocker le mode dans localStorage (`noiseSuppressionMode`)

**Modification : `src/hooks/useWebRTCVoice.ts`**
- Remplacer `NoiseProcessor` par `AdvancedNoiseProcessor`
- Integrer le nouveau pipeline

**Modification : `src/components/friends/PrivateCallPanel.tsx`**
- Remplacer `PrivateCallNoiseProcessor` par `AdvancedNoiseProcessor`

## Partie 2 : Controle de volume individuel par utilisateur

### Architecture

Dans `useWebRTCVoice.ts`, chaque utilisateur distant a deja un element `<audio>` dans `remoteAudiosRef`. On va exposer une methode `setUserVolume(userId, volume)` et stocker les volumes dans un state.

**Modification : `src/hooks/useWebRTCVoice.ts`**
- Ajouter un state `userVolumes: Map<string, number>`
- Ajouter `setUserVolume(userId: string, volume: number)` qui :
  - Met a jour `remoteAudiosRef.current.get(userId).volume`
  - Persiste dans localStorage (`userVolume_${userId}`)
- Exposer `userVolumes` et `setUserVolume` dans le retour du hook
- Au `ontrack`, appliquer le volume sauvegarde

**Modification : `src/components/voice/VoiceUserCard.tsx`**
- Ajouter un slider de volume au hover/clic (0-200% pour boost)
- Icone de volume avec indicateur visuel
- Props: `volume`, `onVolumeChange`

**Modification : `src/components/VoiceChannel.tsx` et `src/components/groups/GroupVoiceChannel.tsx`**
- Passer `userVolumes` et `setUserVolume` aux `VoiceUserCard`

## Partie 3 : Fix du Settings Dialog (debordement)

**Modification : `src/components/SettingsDialog.tsx`**
- Changer `max-h-[85vh]` en `max-h-[80vh]`
- Ajouter `overflow-hidden` au DialogContent
- S'assurer que le ScrollArea prend exactement l'espace disponible avec `min-h-0`
- Regrouper les sections dans des panneaux collapsibles (Accordion) pour reduire la hauteur

## Partie 4 : Verification des appels vocaux et partage d'ecran

**Corrections identifiees dans `useWebRTCVoice.ts` :**
- Le `handleSignal` est dans les deps de `join` mais pas mis a jour quand `createPeerConnection` change (potentiel stale closure)
- Ajouter un timeout de reconnexion automatique si `connectionState === "disconnected"` pendant plus de 5s

**Corrections identifiees dans `useWebRTCScreenShare.ts` :**
- Le `cleanup` dans le `useEffect` de retour n'a pas `cleanup` en dep, risque de ne pas se declencher correctement
- Ajouter une verification que `presenceChannel` est bien subscribe avant de tracker

**Corrections identifiees dans `PrivateCallPanel.tsx` :**
- Le `handleSignal` n'est pas dans un `useCallback` et est recree a chaque render, ce qui pourrait causer des problemes de signaling
- L'effet qui subscribe au signaling channel n'a pas `handleSignal` en dep

## Ordre d'implementation

1. Creer `public/audio-worklet/noise-gate-processor.js`
2. Creer `src/hooks/useNoiseProcessor.ts`
3. Mettre a jour `src/components/SettingsDialog.tsx` (fix overflow + mode de suppression)
4. Mettre a jour `src/hooks/useWebRTCVoice.ts` (volume individuel + nouveau noise processor + fixes)
5. Mettre a jour `src/components/voice/VoiceUserCard.tsx` (slider volume)
6. Mettre a jour `src/components/VoiceChannel.tsx` (passer volume props)
7. Mettre a jour `src/components/groups/GroupVoiceChannel.tsx` (passer volume props)
8. Mettre a jour `src/components/friends/PrivateCallPanel.tsx` (nouveau noise processor + fix handleSignal)

## Details techniques : Noise Gate Adaptatif

Le processeur `noise-gate-processor.js` fonctionne ainsi :

1. **Calcul RMS** : Pour chaque bloc de 128 samples, calcul du niveau RMS
2. **Noise floor adaptatif** : Le seuil s'adapte lentement au bruit ambiant (constante de temps ~2s pour monter, ~200ms pour descendre)
3. **Gate intelligent** :
   - Si RMS > noiseFloor + marge (6dB) : ouvrir le gate (attack ~5ms)
   - Si RMS < noiseFloor + marge : fermer le gate (release ~100ms)
   - Transition smooth avec un gain qui monte/descend lineairement
4. **Hold time** : Le gate reste ouvert 150ms apres le dernier son detecte (evite les coupures entre les mots)
5. **Pas d'effet robot** : Le gain ne descend jamais en dessous de -40dB (pas de coupure totale)

Parametres ajustables via le mode :
- Standard : marge = 10dB, release = 150ms, floor min = -50dB
- Agressif : marge = 6dB, release = 80ms, floor min = -60dB

