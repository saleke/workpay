"use client";

import { Check, FlaskConical, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useSystemMode } from "@/lib/mode";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function EnvironmentToggle() {
  const { isDemo, setMode } = useSystemMode();

  const handleSelectMode = (mode: "demo" | "production") => {
    if ((mode === "demo" && isDemo) || (mode === "production" && !isDemo)) return;
    setMode(mode);
    if (mode === "demo") {
      toast.success("Switched to Sandbox Environment");
    } else {
      toast.success("Switched to Live Production Mode");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Select execution environment"
          className="flex items-center gap-2 text-xs font-medium text-[var(--wp-text-secondary)] hover:text-[var(--wp-text-primary)] transition-all duration-150 px-2.5 py-1.5 rounded-lg border border-[var(--wp-border)] bg-white/90 hover:bg-[var(--wp-surface-subtle)] hover:border-[var(--wp-border-strong)] shadow-xs active:scale-[0.98] cursor-pointer"
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isDemo ? "bg-[var(--wp-accent)] shadow-[0_0_8px_rgba(183,121,45,0.4)]" : "bg-[var(--wp-success)] shadow-[0_0_8px_rgba(40,122,83,0.4)]"
            }`}
          />
          <span className="font-medium">{isDemo ? "Sandbox" : "Production"}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-2">
        <DropdownMenuLabel className="px-2 py-1 text-muted-foreground font-medium text-[11px] uppercase tracking-wider">
          Execution Environment
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-1 bg-[var(--wp-border)]" />

        <DropdownMenuItem
          onClick={() => handleSelectMode("demo")}
          className={`flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer transition-all ${
            isDemo ? "bg-[var(--wp-surface-subtle)] font-medium border border-[var(--wp-border)]" : "hover:bg-[var(--wp-surface-subtle)]"
          }`}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--wp-accent-subtle)] text-[var(--wp-accent)] mt-0.5">
            <FlaskConical className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-[var(--wp-text-primary)]">Sandbox Mode</span>
              {isDemo && <Check className="h-3.5 w-3.5 text-[var(--wp-accent)]" />}
            </div>
            <p className="text-[11px] text-[var(--wp-text-secondary)] leading-tight mt-0.5">
              Simulated PayPal authorizations and test verification runs.
            </p>
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => handleSelectMode("production")}
          className={`flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer transition-all ${
            !isDemo ? "bg-[var(--wp-surface-subtle)] font-medium border border-[var(--wp-border)]" : "hover:bg-[var(--wp-surface-subtle)]"
          }`}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--wp-success-subtle)] text-[var(--wp-success)] mt-0.5">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-[var(--wp-text-primary)]">Live Production Mode</span>
              {!isDemo && <Check className="h-3.5 w-3.5 text-[var(--wp-success)]" />}
            </div>
            <p className="text-[11px] text-[var(--wp-text-secondary)] leading-tight mt-0.5">
              Production PayPal settlement and live account credentials.
            </p>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
