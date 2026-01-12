import { useState, useEffect, useCallback, useRef } from "react";

// Storage keys
const PTT_ENABLED_KEY = "pushToTalkEnabled";
const PTT_KEY_KEY = "pushToTalkKey";

export const getPushToTalkEnabled = (): boolean => {
  const stored = localStorage.getItem(PTT_ENABLED_KEY);
  return stored === "true";
};

export const getPushToTalkKey = (): string => {
  return localStorage.getItem(PTT_KEY_KEY) || " "; // Default to Space
};

export const setPushToTalkEnabled = (enabled: boolean) => {
  localStorage.setItem(PTT_ENABLED_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent("pttSettingsChange"));
};

export const setPushToTalkKey = (key: string) => {
  localStorage.setItem(PTT_KEY_KEY, key);
  window.dispatchEvent(new CustomEvent("pttSettingsChange"));
};

export const getKeyDisplayName = (key: string): string => {
  const keyMap: Record<string, string> = {
    " ": "Espace",
    "Control": "Ctrl",
    "Alt": "Alt",
    "Shift": "Shift",
    "Tab": "Tab",
    "`": "`",
    "CapsLock": "Caps Lock",
  };
  return keyMap[key] || key.toUpperCase();
};

interface UsePushToTalkProps {
  onPush?: () => void;
  onRelease?: () => void;
  isEnabled?: boolean;
}

export const usePushToTalk = ({ onPush, onRelease, isEnabled = true }: UsePushToTalkProps = {}) => {
  const [isPushing, setIsPushing] = useState(false);
  const [pttEnabled, setPttEnabled] = useState(getPushToTalkEnabled());
  const [pttKey, setPttKey] = useState(getPushToTalkKey());
  const isPushingRef = useRef(false);
  const isActiveRef = useRef(false);

  // Listen for settings changes
  useEffect(() => {
    const handleSettingsChange = () => {
      setPttEnabled(getPushToTalkEnabled());
      setPttKey(getPushToTalkKey());
    };

    window.addEventListener("pttSettingsChange", handleSettingsChange);
    return () => window.removeEventListener("pttSettingsChange", handleSettingsChange);
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isEnabled || !pttEnabled) return;
    if (event.repeat) return; // Ignore key repeat
    
    // Don't trigger if typing in an input
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
      return;
    }

    if (event.key === pttKey && !isPushingRef.current) {
      event.preventDefault();
      isPushingRef.current = true;
      isActiveRef.current = true;
      setIsPushing(true);
      onPush?.();
    }
  }, [pttEnabled, pttKey, onPush, isEnabled]);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    if (!isEnabled || !pttEnabled) return;

    if (event.key === pttKey && isPushingRef.current) {
      event.preventDefault();
      isPushingRef.current = false;
      isActiveRef.current = false;
      setIsPushing(false);
      onRelease?.();
    }
  }, [pttEnabled, pttKey, onRelease, isEnabled]);

  // Handle blur to release key if window loses focus
  const handleBlur = useCallback(() => {
    if (isPushingRef.current) {
      isPushingRef.current = false;
      isActiveRef.current = false;
      setIsPushing(false);
      onRelease?.();
    }
  }, [onRelease]);

  useEffect(() => {
    if (!isEnabled) return;

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [handleKeyDown, handleKeyUp, handleBlur, isEnabled]);

  return {
    isPushing,
    pttEnabled,
    pttKey,
    isActive: isActiveRef.current,
  };
};

// Hook for capturing PTT key in settings
export const usePushToTalkKeyCapture = () => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedKey, setCapturedKey] = useState<string | null>(null);

  const startCapture = useCallback(() => {
    setIsCapturing(true);
    setCapturedKey(null);
  }, []);

  const cancelCapture = useCallback(() => {
    setIsCapturing(false);
    setCapturedKey(null);
  }, []);

  useEffect(() => {
    if (!isCapturing) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      
      // Allow specific keys only
      const allowedKeys = [" ", "Control", "Alt", "Shift", "Tab", "`", "CapsLock"];
      const letterKeys = "abcdefghijklmnopqrstuvwxyz".split("");
      const numberKeys = "0123456789".split("");
      
      if (allowedKeys.includes(event.key) || letterKeys.includes(event.key.toLowerCase()) || numberKeys.includes(event.key)) {
        setCapturedKey(event.key);
        setPushToTalkKey(event.key);
        setIsCapturing(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCapturing]);

  return {
    isCapturing,
    capturedKey,
    startCapture,
    cancelCapture,
  };
};
