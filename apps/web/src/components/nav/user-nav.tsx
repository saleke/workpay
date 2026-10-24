"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  ChevronDown,
  LogIn,
  LogOut,
  Settings,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface AuthUser {
  id: string;
  name: string | null;
  username?: string | null;
  displayName?: string | null;
  email: string;
  role: "buyer" | "provider" | "admin_reviewer";
}

export function UserNav() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const syncUser = async () => {
      // 1. Check server session first
      try {
        const res = await fetch("/api/v1/auth/me", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (json.data?.user) {
            setUser(json.data.user);
            window.localStorage.setItem("workpay_auth_user", JSON.stringify(json.data.user));
            window.localStorage.removeItem("workpay_signed_out");
            return;
          }
        }
      } catch {
        // Fall back to local check if network error
      }

      // 2. Check localStorage if offline
      const storedAuth = window.localStorage.getItem("workpay_auth_user");
      const explicitlySignedOut = window.localStorage.getItem("workpay_signed_out") === "true";

      if (storedAuth && !explicitlySignedOut) {
        try {
          const parsed = JSON.parse(storedAuth) as AuthUser;
          if (parsed?.id) {
            setUser(parsed);
            return;
          }
        } catch {
          // Ignore parse error
        }
      }

      setUser(null);
    };

    syncUser();
    window.addEventListener("storage", syncUser);
    window.addEventListener("workpay_auth_change", syncUser);
    return () => {
      window.removeEventListener("storage", syncUser);
      window.removeEventListener("workpay_auth_change", syncUser);
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // Ignore
    }

    window.localStorage.removeItem("workpay_auth_user");
    window.localStorage.removeItem("workpay_persona");
    window.localStorage.setItem("workpay_signed_out", "true");
    document.cookie = "workpay_persona=; path=/; max-age=0";
    document.cookie = "workpay_session=; path=/; max-age=0";
    document.cookie = "workpay_signed_out=true; path=/; max-age=31536000";
    window.dispatchEvent(new Event("workpay_auth_change"));
    setUser(null);
    router.push("/login");
    router.refresh();
  };

  if (!mounted) {
    return <div className="h-8 w-24 animate-pulse rounded-lg bg-[var(--wp-surface-subtle)]" />;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className="h-8 flex items-center gap-1.5 px-3 text-xs font-semibold text-[var(--wp-text-primary)] hover:bg-[var(--wp-surface-subtle)] rounded-lg border border-[var(--wp-border)] bg-white/90 shadow-2xs transition-all duration-150 shrink-0 whitespace-nowrap active:scale-[0.98]"
        >
          <LogIn className="h-3.5 w-3.5" />
          <span>Sign In</span>
        </Link>
        <Link
          href="/register"
          className="h-8 flex items-center gap-1.5 px-3 text-xs font-semibold text-white bg-[var(--wp-text-primary)] hover:opacity-90 rounded-lg shadow-2xs transition-all duration-150 shrink-0 whitespace-nowrap active:scale-[0.98]"
        >
          <span>Sign Up</span>
        </Link>
      </div>
    );
  }

  const roleLabel =
    user.role === "provider"
      ? "Specialist"
      : user.role === "admin_reviewer"
        ? "Arbitrator"
        : "Client";

  const initials = (user.name || user.username || user.email || "U")
    .slice(0, 2)
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="h-8 flex items-center gap-2 pl-2 pr-2.5 rounded-lg border border-[var(--wp-border)] bg-white/90 hover:bg-[var(--wp-surface-subtle)] shadow-2xs transition-all duration-150 shrink-0 select-none group focus:outline-none"
        >
          <div className="h-5 w-5 rounded-md bg-[var(--wp-surface-subtle)] border border-[var(--wp-border)] flex items-center justify-center text-[10px] font-bold text-[var(--wp-text-primary)] shrink-0">
            {initials}
          </div>
          <span className="text-xs font-semibold text-[var(--wp-text-primary)] max-w-[120px] truncate">
            {user.displayName || user.name || user.username || user.email.split("@")[0]}
          </span>
          <span className="text-[10px] font-medium text-[var(--wp-text-muted)] bg-[var(--wp-surface-subtle)] px-1.5 py-0.5 rounded border border-[var(--wp-border)]">
            {roleLabel}
          </span>
          <ChevronDown className="h-3 w-3 text-[var(--wp-text-muted)] group-hover:text-[var(--wp-text-primary)] transition-transform duration-150" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-56 p-1.5 bg-white border border-[var(--wp-border)] shadow-lg rounded-xl z-50 text-[var(--wp-text-primary)]"
      >
        <DropdownMenuLabel className="px-2.5 py-2 font-normal">
          <div className="text-xs font-semibold text-[var(--wp-text-primary)] truncate">
            {user.name || user.displayName || user.username}
          </div>
          <div className="text-[11px] text-[var(--wp-text-muted)] font-mono truncate">
            {user.email}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="my-1 bg-[var(--wp-border)]" />

        <DropdownMenuItem asChild className="cursor-pointer text-xs py-2 px-2.5 rounded-lg">
          <Link href="/settings" className="flex items-center gap-2">
            <Settings className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1 bg-[var(--wp-border)]" />

        <DropdownMenuItem
          onClick={handleSignOut}
          className="cursor-pointer text-xs py-2 px-2.5 rounded-lg text-rose-600 focus:text-rose-600 focus:bg-rose-50"
        >
          <LogOut className="h-3.5 w-3.5 mr-2" />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
