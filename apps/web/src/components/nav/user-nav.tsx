"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, Settings, User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AuthUser {
  id: string;
  name: string | null;
  email: string;
  role: "buyer" | "provider" | "admin_reviewer";
}

export function UserNav() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = window.localStorage.getItem("workpay_auth_user");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed?.id) setUser(parsed);
      } catch {
        // Ignore
      }
    }
  }, []);

  const handleSignOut = async () => {
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // Ignore
    }
    window.localStorage.removeItem("workpay_auth_user");
    setUser(null);
    router.push("/login");
    router.refresh();
  };

  if (!mounted) {
    return (
      <div className="h-8 w-20 animate-pulse rounded-md bg-muted/40" />
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium">
          <Link href="/login">
            <LogIn className="mr-1.5 h-3.5 w-3.5" />
            Sign In
          </Link>
        </Button>
        <Button asChild size="sm" className="h-8 text-xs font-semibold shadow-xs">
          <Link href="/register">
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
            Register
          </Link>
        </Button>
      </div>
    );
  }

  const initials = user.name
    ? user.name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : user.email.slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 border-border/80 bg-card px-2.5 text-xs font-medium shadow-xs hover:border-primary/50"
        >
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
            {initials}
          </div>
          <span className="font-semibold text-foreground max-w-[120px] truncate">
            {user.name || user.email.split("@")[0]}
          </span>
          <span className="rounded bg-primary/10 px-1.5 py-0.2 text-[9px] font-bold text-primary uppercase">
            {user.role}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-2">
        <DropdownMenuLabel className="flex flex-col px-2 py-1 text-xs">
          <span className="font-semibold text-foreground">{user.name || "User"}</span>
          <span className="text-[11px] font-mono text-muted-foreground truncate">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-1.5" />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild className="cursor-pointer text-xs">
            <Link href="/settings">
              <Settings className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              Settings &amp; Diagnostics
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="my-1.5" />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="cursor-pointer text-xs text-rose-600 dark:text-rose-400 focus:text-rose-600"
        >
          <LogOut className="mr-2 h-3.5 w-3.5" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
