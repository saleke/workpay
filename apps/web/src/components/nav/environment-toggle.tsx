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
      toast.success("Switched to Live Production Escrow");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Select execution environment"
          className="flex items-center gap-1.5 text-[var(--text-small)] text-[var(--room-muted)] hover:text-[var(--room-text-strong)] transition-colors px-2 py-1 rounded-[var(--radius-control)] border border-[var(--room-rule)]"
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              backgroundColor: isDemo ? "var(--room-unsure)" : "var(--room-met)",
            }}
          />
          <span>{isDemo ? "Sandbox" : "Live Escrow"}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-2 text-xs">
        <DropdownMenuLabel className="text-muted-foreground font-normal text-[11px] uppercase tracking-wider">
          Execution Environment
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-1" />

        <DropdownMenuItem
          onClick={() => handleSelectMode("demo")}
          className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer ${
            isDemo ? "bg-accent/80 font-medium" : "hover:bg-muted/60"
          }`}
        >
          <FlaskConical className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Sandbox</span>
              {isDemo && <Check className="h-3.5 w-3.5 text-primary" />}
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
              Simulated PayPal authorizations and test verification runs.
            </p>
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => handleSelectMode("production")}
          className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer ${
            !isDemo ? "bg-accent/80 font-medium" : "hover:bg-muted/60"
          }`}
        >
          <ShieldCheck className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Live Escrow</span>
              {!isDemo && <Check className="h-3.5 w-3.5 text-primary" />}
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
              Production PayPal settlement and live account credentials.
            </p>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
