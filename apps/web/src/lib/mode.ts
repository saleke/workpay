"use client";

import { useEffect, useState } from "react";

export type SystemMode = "demo" | "production";

const MODE_OVERRIDE_KEY = "workpay_mode_override";

/**
 * Returns true if the system should run in Sandbox mode.
 * Defaults to true for test evaluation unless explicitly configured
 * via NEXT_PUBLIC_DEMO_MODE="false" or client-side runtime override.
 */
export function isDemoMode(): boolean {
  if (typeof window !== "undefined") {
    const override = window.localStorage.getItem(MODE_OVERRIDE_KEY);
    if (override === "production") return false;
    if (override === "demo") return true;
  }
  return process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
}

export function getSystemMode(): SystemMode {
  return isDemoMode() ? "demo" : "production";
}

export function setSystemModeOverride(mode: SystemMode | null): void {
  if (typeof window === "undefined") return;
  if (!mode) {
    window.localStorage.removeItem(MODE_OVERRIDE_KEY);
    document.cookie = `${MODE_OVERRIDE_KEY}=; path=/; max-age=0`;
  } else {
    window.localStorage.setItem(MODE_OVERRIDE_KEY, mode);
    document.cookie = `${MODE_OVERRIDE_KEY}=${mode}; path=/; max-age=31536000`;
  }
  // Dispatch custom event so listeners update immediately
  window.dispatchEvent(new Event("workpay_mode_change"));
}

/**
 * React hook to listen to system mode changes.
 */
export function useSystemMode(): {
  mode: SystemMode;
  isDemo: boolean;
  setMode: (mode: SystemMode | null) => void;
  envDefault: SystemMode;
} {
  const envDefault: SystemMode = process.env.NEXT_PUBLIC_DEMO_MODE === "false" ? "production" : "demo";
  const [mode, setModeState] = useState<SystemMode>(envDefault);

  useEffect(() => {
    const update = () => {
      setModeState(getSystemMode());
    };
    update();
    window.addEventListener("workpay_mode_change", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("workpay_mode_change", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  const setMode = (newMode: SystemMode | null) => {
    setSystemModeOverride(newMode);
    setModeState(getSystemMode());
  };

  return {
    mode,
    isDemo: mode === "demo",
    setMode,
    envDefault,
  };
}
