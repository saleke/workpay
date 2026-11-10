"use client";

import { useEffect, useState } from "react";
import { getTabAuthUser, getTabSessionToken } from "./tab-session";

export type SystemMode = "demo" | "production";

const MODE_OVERRIDE_KEY = "workpay_mode_override";

/**
 * Returns true if the system should run in Sandbox mode.
 * Authenticated sections and active user sessions ALWAYS default to production, never demo.
 */
export function isDemoMode(): boolean {
  if (typeof window !== "undefined") {
    const authUser = getTabAuthUser();
    const hasTabSession = Boolean(getTabSessionToken());
    const pathname = window.location.pathname;
    const isAuthenticatedSection =
      pathname.startsWith("/tasks") ||
      pathname.startsWith("/payments") ||
      pathname.startsWith("/activity") ||
      pathname.startsWith("/provider") ||
      pathname.startsWith("/review") ||
      pathname.startsWith("/settings");

    // Authenticated sections and users must always default to production
    if (authUser || hasTabSession || isAuthenticatedSection) {
      const override = window.sessionStorage.getItem(MODE_OVERRIDE_KEY);
      if (override === "demo") return true;
      return false;
    }

    const override = window.sessionStorage.getItem(MODE_OVERRIDE_KEY);
    if (override === "production") return false;
    if (override === "demo") return true;
  }
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true" && process.env.WORKPAY_MODE !== "production";
}

export function getSystemMode(): SystemMode {
  return isDemoMode() ? "demo" : "production";
}

export function setSystemModeOverride(mode: SystemMode | null): void {
  if (typeof window === "undefined") return;
  if (!mode) {
    window.sessionStorage.removeItem(MODE_OVERRIDE_KEY);
  } else {
    window.sessionStorage.setItem(MODE_OVERRIDE_KEY, mode);
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
  const envDefault: SystemMode =
    process.env.NEXT_PUBLIC_DEMO_MODE === "true" && process.env.WORKPAY_MODE !== "production"
      ? "demo"
      : "production";
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
