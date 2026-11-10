"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setTabSession, tabSessionFetch } from "@/lib/tab-session";

export default function OAuthCompletePage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const handoff = params.get("handoff");
    const requestedReturnTo = params.get("returnTo") || "/tasks";
    const returnTo =
      requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//")
        ? requestedReturnTo
        : "/tasks";
    window.history.replaceState({}, "", "/oauth-complete");
    if (!handoff) {
      setError("The OAuth return is missing its one-time browser handoff.");
      return;
    }

    void tabSessionFetch("/api/v1/auth/handoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handoff }),
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message || "OAuth sign-in failed.");
        const user = payload.data?.user;
        const sessionToken = payload.data?.sessionToken;
        if (!user || !sessionToken) throw new Error("OAuth sign-in returned no browser session.");
        setTabSession(sessionToken, user);
        window.location.replace(returnTo);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "OAuth sign-in failed.");
      });
  }, []);

  return (
    <div className="space-y-5 rounded-2xl border border-[var(--wp-border)] bg-card p-6 text-center shadow-lg">
      {error ? (
        <>
          <div>
            <h1 className="text-lg font-semibold">Sign-in could not be completed</h1>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{error}</p>
          </div>
          <Button asChild className="w-full">
            <Link href="/login">Return to sign in</Link>
          </Button>
        </>
      ) : (
        <>
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-[var(--wp-accent)]" />
          <div>
            <h1 className="text-lg font-semibold">Securing this browser tab</h1>
            <p className="mt-2 text-xs text-muted-foreground">
              Completing the one-time OAuth handoff without changing your other open tabs.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
