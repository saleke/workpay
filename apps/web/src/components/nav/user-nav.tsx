"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, ChevronDown, LogIn, LogOut, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  clearTabSession,
  getTabAuthUser,
  getTabSessionToken,
  tabSessionFetch,
  updateTabAuthUser,
} from "@/lib/tab-session";

export interface AuthUser {
  id: string;
  name: string | null;
  username?: string | null;
  displayName?: string | null;
  email: string;
  role: "buyer" | "provider" | "admin_reviewer";
  image?: string | null;
}

export function UserNav() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const syncUser = async () => {
      const tabUser = getTabAuthUser<AuthUser>();
      if (tabUser?.id) setUser(tabUser);

      try {
        const res = await tabSessionFetch("/api/v1/auth/me", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (json.data?.user) {
            setUser(json.data.user);
            updateTabAuthUser(json.data.user);
            return;
          }
          if (getTabSessionToken()) clearTabSession();
        }
      } catch {
        if (tabUser?.id) return;
      }

      setUser(null);
    };

    syncUser();
    window.addEventListener("workpay_auth_change", syncUser);
    return () => {
      window.removeEventListener("workpay_auth_change", syncUser);
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await tabSessionFetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // Ignore
    }

    clearTabSession();
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
          className="flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--wp-border)] bg-white px-3 text-xs font-semibold text-[var(--wp-text-primary)] shadow-2xs transition-all duration-150 hover:bg-[var(--wp-surface-subtle)] active:scale-[0.98]"
        >
          <LogIn className="h-3.5 w-3.5" />
          <span>Sign In</span>
        </Link>
        <Link
          href="/register"
          className="flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--wp-accent)] px-3 text-xs font-semibold text-white shadow-2xs transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
        >
          <span>Sign Up</span>
        </Link>
      </div>
    );
  }

  const roleLabel = "Member";

  const initials = (user.name || user.username || user.email || "U").slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-h-10 items-center gap-2 rounded-xl border border-[var(--wp-border)] bg-white px-2.5 shadow-2xs transition-all duration-150 select-none group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wp-accent)] focus-visible:ring-offset-2"
        >
          <div className="h-5 w-5 overflow-hidden rounded-md bg-[var(--wp-surface-subtle)] border border-[var(--wp-border)] flex items-center justify-center text-[10px] font-bold text-[var(--wp-text-primary)] shrink-0">
            {user.image ? (
              <img src={user.image} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
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
