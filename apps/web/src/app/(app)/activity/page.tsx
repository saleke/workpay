"use client";

import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  CreditCard,
  FileCheck,
  FileCode,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "@/components/states";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { listActivity } from "@/lib/api/endpoints";
import type { ActivityEntryDto } from "@/lib/api/types";

function EventIcon({ type }: { type: string }) {
  if (type.includes("PAYMENT")) {
    return <CreditCard className="h-4 w-4 text-emerald-500" />;
  }
  if (type.includes("CONTRACT") || type.includes("SPEC")) {
    return <FileText className="h-4 w-4 text-blue-500" />;
  }
  if (type.includes("VERIFICATION") || type.includes("VERIFIED")) {
    return <ShieldCheck className="h-4 w-4 text-indigo-500" />;
  }
  if (type.includes("SUBMISSION") || type.includes("SUBMITTED")) {
    return <FileCheck className="h-4 w-4 text-purple-500" />;
  }
  if (type.includes("PROVIDER")) {
    return <UserCheck className="h-4 w-4 text-cyan-500" />;
  }
  if (type.includes("CASE") || type.includes("DISPUTE") || type.includes("DENIED")) {
    return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  }
  if (type.includes("AGENT")) {
    return <Bot className="h-4 w-4 text-violet-500" />;
  }
  return <Activity className="h-4 w-4 text-muted-foreground" />;
}

function ActorBadge({ actorType }: { actorType: string }) {
  const isAgent = actorType === "AGENT" || actorType === "SYSTEM";
  const isBuyer = actorType === "BUYER" || actorType === "USER";
  const isProvider = actorType === "PROVIDER";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${
        isAgent
          ? "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/60 dark:bg-purple-950/40 dark:text-purple-300"
          : isBuyer
            ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
            : isProvider
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
      }`}
    >
      {isAgent && <Sparkles className="h-2.5 w-2.5" />}
      {actorType}
    </span>
  );
}

export default function ActivityPage() {
  const { data, error, loading, reload } = useApi(() => listActivity(), []);
  const [filter, setFilter] = useState<string>("ALL");

  if (loading && !data) return <LoadingState label="Loading audit activity timeline..." />;
  if (error) {
    return (
      <ErrorState
        title="Could not load activity feed"
        description="The event store is currently unavailable. Please try again."
        onRetry={reload}
      />
    );
  }

  const entries = data ?? [];

  const filteredEntries = entries.filter((e) => {
    if (filter === "ALL") return true;
    if (filter === "PAYMENTS") return e.type.includes("PAYMENT");
    if (filter === "CONTRACTS") return e.type.includes("CONTRACT") || e.type.includes("SPEC");
    if (filter === "VERIFICATION") return e.type.includes("VERIF") || e.type.includes("SUBMISSION");
    if (filter === "CASES") return e.type.includes("CASE") || e.type.includes("DISPUTE");
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Activity & Event Timeline
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Immutable, append-only audit trail of every agent action, contract approval, and PayPal
            settlement event.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => reload()} className="gap-1.5 self-start sm:self-auto">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Timeline
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-3">
        {[
          { key: "ALL", label: `All Events (${entries.length})` },
          { key: "PAYMENTS", label: "Payments & Escrow" },
          { key: "CONTRACTS", label: "Contracts & Planning" },
          { key: "VERIFICATION", label: "Verifications" },
          { key: "CASES", label: "Disputes & Review" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === tab.key
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Timeline Stream */}
      {filteredEntries.length === 0 ? (
        <EmptyState
          title="No events recorded"
          description="Activity appears automatically as tasks are created, agents orchestrate work, and payments settle."
        />
      ) : (
        <div className="relative border-l-2 border-border/70 ml-4 sm:ml-6 space-y-4 py-2">
          {filteredEntries.map((item) => (
            <div key={item.id} className="relative pl-6 sm:pl-8 group">
              {/* Node dot icon */}
              <div className="absolute -left-[17px] top-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-card shadow-xs group-hover:border-primary/50 transition-colors">
                <EventIcon type={item.type} />
              </div>

              {/* Event Card */}
              <Card className="border-border/70 shadow-xs hover:border-primary/30 transition-all bg-card">
                <CardHeader className="p-3.5 pb-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <CardTitle className="text-sm font-semibold text-foreground">
                        {item.title}
                      </CardTitle>
                      <ActorBadge actorType={item.actorType} />
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                      <Clock className="h-3 w-3" />
                      <span>{formatDateTime(item.occurredAt)}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-3.5 pt-0">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {item.description || item.type}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
                    <span>Event: {item.type}</span>
                    <span>•</span>
                    <span>Scope: {item.visibility}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
