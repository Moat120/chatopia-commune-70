# Plan d'action — Voice channel robuste + RNNoise

## État actuel (audit rapide)

L'application **a déjà** une grosse partie de ce que tu demandes :
- `src/hooks/useWebRTCVoice.ts` (924 lignes) gère déjà la signalisation via Supabase Realtime (Presence + Broadcast), avec offers/answers/ICE.
- `src/hooks/useNoiseProcessor.ts` intègre déjà `@timephy/rnnoise-wasm` avec fallback `sapphi-red` puis worklet custom.
- Les `MediaStream` / `RTCPeerConnection` sont déjà stockés en `useRef`, pas en state.
- Un bouton mode noise (standard/aggressive) existe déjà dans `SettingsDialog`.

Donc ce n'est **pas** une réécriture — c'est un **durcissement ciblé** des points qui causent encore le bug "salon fantôme" et les frictions UI.

## Étape 1 — Fiabiliser la signalisation (le bug fantôme)

Causes probables identifiées dans `useWebRTCVoice.ts` :
1. Race entre `presenceSync` et `broadcast offer` : un pair peut envoyer l'offer avant que l'autre ait fini d'attacher son handler `voice-offer`.
2. ICE candidates qui arrivent **avant** `setRemoteDescription` ne sont pas toujours mis en file d'attente proprement → handshake silencieux.
3. Glare resolution (deux pairs s'envoient un offer simultanément) non déterministe → un côté finit en `stable` sans média.
4. Cleanup partiel quand un pair part : la `RTCPeerConnection` reste en mémoire et bloque une re-connexion ultérieure.

Corrections :
- **Politicien/impoli déterministe** : comparer `odId` (lexicographique). Le plus petit = polite, l'autre = impolite. Ignore les offers entrants côté impolite si déjà en train d'envoyer.
- **File d'attente ICE explicite** : tableau `pendingIce[odId][]` vidé après `setRemoteDescription`.
- **Handshake déclenché uniquement après `subscribe` confirmé** (status `SUBSCRIBED`) avant d'annoncer la présence.
- **Heartbeat presence** + nettoyage agressif : sur `presence leave` ET sur timeout 8s sans broadcast → `pc.close()` + retrait UI.
- **Logs structurés** `[VOICE:pairId]` pour pouvoir debug en prod.

## Étape 2 — Perfs React

Vérifier et corriger uniquement ce qui rerender encore inutilement :
- `connectedUsers` est un `useState` → OK pour l'UI, mais on s'assure qu'on ne le réécrit pas à chaque ICE/stat update (dédupliquer via égalité shallow).
- Niveaux audio (`audioLevel`, `isSpeaking`) : passer à un store local par carte (`VoiceUserCard`) abonné à un `EventTarget` partagé pour éviter de re-render toute la liste 30×/s.
- `userVolumes` : déjà en state, mais débouncer l'écriture localStorage.

## Étape 3 — Noise suppression (déjà branché, on polish)

- Vérifier que `?url` (pas `?worker&url`) est bien la bonne syntaxe pour ce package : `NoiseSuppressorWorklet` est un **AudioWorklet processor**, pas un Web Worker → c'est `?url` qui est correct, pas `?worker&url`. Le prompt amont se trompe sur ce détail. Je garde `?url`.
- Ajouter un **bouton bypass live** dans `VoiceControls` (à côté de mute) pour activer/désactiver RNNoise sans rejoindre le salon. Implémenté en branchant/débranchant le `GainNode` de sortie du processor (bypass instantané, pas de glitch).
- Persister l'état bypass dans `localStorage` (`noiseSuppressionEnabled`).

## Fichiers à modifier

- `src/hooks/useWebRTCVoice.ts` — politeness deterministe, queue ICE, cleanup robuste, logs.
- `src/hooks/useNoiseProcessor.ts` — méthode `setBypass(boolean)`.
- `src/components/voice/VoiceControls.tsx` — bouton toggle noise suppression.
- `src/components/SettingsDialog.tsx` — exposer `getNoiseSuppressionEnabled()`.

## Hors scope

- Pas de réécriture complète du hook (déjà robuste à 80%).
- Pas de changement backend / RLS / migration.
- Pas de changement de palette ou de design.

Valide ce plan et je l'exécute.