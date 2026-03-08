

# Plan : Fluidité, synchronisation, QoL et suppression de bruit avancée

## Problèmes identifiés

1. **Synchronisation fragile** : Le chat de groupe utilise un polling de 10s en fallback, et les channels Realtime ne gèrent pas les reconnexions proprement.
2. **Voice chat instable** : Le `handleSignal` est dans les dépendances du `join` useCallback, ce qui peut provoquer des re-créations de channels.
3. **Pas de suppression de bruit spécialisée clavier/souris** : RNNoise est bon pour le bruit ambiant mais ne cible pas spécifiquement les bruits impulsifs (clics clavier, souris, respiration).
4. **Screen share pas fiable** : Les offres sont envoyées avec des `setTimeout` fragiles qui peuvent rater si la presence n'est pas encore propagée.

## Plan d'implémentation

### 1. Créer un AudioWorklet dédié aux bruits impulsifs (clavier, souris, respiration)

Nouveau fichier `public/audio-worklet/impulse-noise-gate.js` :
- Détection de **transitoires** (variation soudaine d'amplitude sur 1-3ms) typiques des clics clavier/souris
- Analyse spectrale simplifiée : les clics ont une signature large bande (énergie répartie sur toutes les fréquences), contrairement à la voix (concentrée 100-4000Hz)
- **Blanking** des transitoires détectés avec crossfade pour éviter les artefacts
- Détection de respiration : énergie concentrée sous 300Hz avec faible énergie dans les formants vocaux (800-3000Hz) = respiration → atténuation
- Paramètres ajustables : sensibilité, temps de blanking

### 2. Intégrer le processeur impulsif dans le pipeline audio

Dans `useNoiseProcessor.ts` :
- Ajouter le worklet `impulse-noise-gate` **après** RNNoise et **avant** les filtres biquad
- RNNoise gère le bruit continu (ventilateur, ambiance), le nouveau worklet gère les bruits impulsifs
- Pipeline final : `Mic → RNNoise → ImpulseGate → Filters → Compressor → Output`

### 3. Stabiliser la synchronisation voice/screen share

Dans `useWebRTCVoice.ts` :
- Utiliser `useRef` pour `handleSignal` et `initiateConnection` (comme déjà fait dans screen share) pour éviter les re-renders qui cassent les channels
- Supprimer ces callbacks des dépendances du `join`

Dans `useWebRTCScreenShare.ts` :
- Remplacer les `setTimeout` de retry par un pattern basé sur les events : écouter `presence.join` pour déclencher les offres immédiatement plutôt qu'attendre arbitrairement
- Ajouter un mécanisme de heartbeat pour détecter les déconnexions silencieuses

### 4. Améliorer la réactivité du chat de groupe

Dans `useGroupChat.ts` :
- Réduire le polling fallback de 10s à 5s
- Ajouter un optimistic update : le message apparaît immédiatement dans l'UI avant la confirmation serveur
- Dédupliquer proprement les messages (éviter le double affichage quand le realtime et le polling arrivent en même temps)

### 5. Améliorations QoL

- **Reconnexion automatique voice** : dans `useWebRTCVoice`, détecter quand tous les peers sont `disconnected` et tenter une reconnexion automatique après 3s
- **Indicateur de latence amélioré** : afficher le ping en temps réel dans le header des appels (déjà partiellement implémenté)
- **Son de connexion/déconnexion** : jouer un son quand un utilisateur rejoint ou quitte l'appel vocal
- **Scroll automatique intelligent** dans le chat : ne scroll vers le bas que si l'utilisateur est déjà en bas (pas de scroll forcé quand on lit l'historique)

## Fichiers concernés

| Fichier | Action |
|---------|--------|
| `public/audio-worklet/impulse-noise-gate.js` | Créer - AudioWorklet anti-clavier/souris/respiration |
| `src/hooks/useNoiseProcessor.ts` | Modifier - Intégrer le worklet impulsif dans le pipeline |
| `src/hooks/useWebRTCVoice.ts` | Modifier - Stabiliser avec refs, reconnexion auto, sons |
| `src/hooks/useWebRTCScreenShare.ts` | Modifier - Retry basé sur events au lieu de setTimeout |
| `src/hooks/useGroupChat.ts` | Modifier - Optimistic updates, meilleur polling |
| `src/components/groups/GroupChatPanel.tsx` | Modifier - Smart scroll |
| `src/components/friends/PrivateChatPanel.tsx` | Modifier - Smart scroll |

