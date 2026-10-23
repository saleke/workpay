"use client";

import { Check, FlaskConical, ShieldCheck } from "lucide-react";
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Select execution environment"
          className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all hover:opacity-90 focus:outline-hidden"
          style={{
            borderColor: isDemo ? "rgba(245, 158, 11, 0.4)" : "rgba(16, 185, 129, 0.4)",
            backgroundColor: isDemo ? "rgba(245, 158, 11, 0.08)" : "rgba(16, 185, 129, 0.08)",
            color: isDemo ? "rgb(217, 119, 6)" : "rgb(5, 150, 105)",
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              backgroundColor: isDemo ? "rgb(245, 158, 11)" : "rgb(16, 185, 129)",
            }}
          />
          <span className="font-semibold">{isDemo ? "Sandbox" : "Live Escrow"}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-2 text-xs">
        <DropdownMenuLabel className="text-muted-foreground font-normal text-[11px] uppercase tracking-wider">
          Execution Environment
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-1" />

        <DropdownMenuItem
          onClick={() => setMode("demo")}
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
          onClick={() => setMode("production")}
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
