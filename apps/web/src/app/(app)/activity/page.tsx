"use client";

import { useMemo } from "react";
import Link from "next/link";
import { History, Clock, ArrowRight, ShieldCheck } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { listActivity } from "@/lib/api/endpoints";
import type { ActivityEntryDto } from "@/lib/api/types";

function formatDayHeading(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Today";

    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";

    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "Recent";
  }
}

export default function ActivityPage() {
  const { data, loading } = useApi(() => listActivity(), [], "activity");
  const entries: ActivityEntryDto[] = data ?? [];

  const grouped = useMemo(() => {
    const groups: { day: string; items: ActivityEntryDto[] }[] = [];
    let currentDay = "";
    let currentGroup: ActivityEntryDto[] = [];

    for (const entry of entries) {
      const day = formatDayHeading(entry.occurredAt);
      if (day !== currentDay) {
        if (currentGroup.length > 0) {
          groups.push({ day: currentDay, items: currentGroup });
        }
        currentDay = day;
        currentGroup = [entry];
      } else {
        currentGroup.push(entry);
      }
    }

    if (currentGroup.length > 0) {
      groups.push({ day: currentDay, items: currentGroup });
    }

    return groups;
  }, [entries]);

  if (loading && entries.length === 0) {
    return (
      <div className="py-20 text-center text-sm text-[var(--text-muted)]">
        Retrieving activity log...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="py-20 text-center max-w-md mx-auto">
        <History className="h-8 w-8 text-[var(--amber)] mx-auto mb-3" />
        <h1 className="text-xl font-semibold tracking-tight text-[var(--charcoal)]">
          No activity recorded yet
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1.5">
          Important lifecycle events, specification approvals, deliverable submissions, and cryptographic verifications will be recorded here in immutable sequence.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-4 border-b border-[var(--border-subtle)] pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--charcoal)]">
            Activity & Audit Log
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Immutable chronological record of approvals, contract revisions, proof verification, and settlement.
          </p>
        </div>
      </div>

      {/* 2. Grouped Timeline Cards */}
      <div className="space-y-6">
        {grouped.map((group) => (
          <div key={group.day} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" />
              <span>{group.day}</span>
            </h2>

            <div className="workpay-card divide-y divide-[var(--border-subtle)]">
              {group.items.map((entry) => {
                const timeStr = new Date(entry.occurredAt).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                });

                return (
                  <div
                    key={entry.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 text-sm"
                  >
                    <div className="flex items-start gap-3 flex-1">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 mt-2 ${
                          entry.isSelf
                            ? "bg-[var(--wp-accent)]"
                            : entry.actorType === "AGENT"
                              ? "bg-purple-500"
                              : entry.actorType === "SYSTEM"
                                ? "bg-blue-500"
                                : "bg-emerald-500"
                        }`}
                      />
                      <div>
                        <div className="font-semibold text-[var(--charcoal)] flex items-center gap-2">
                          <span>{entry.title}</span>
                          {entry.isSelf && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                              You
                            </span>
                          )}
                        </div>
                        {entry.description && (
                          <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                            {entry.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto text-xs shrink-0">
                      <span className="rounded-md px-2 py-0.5 text-[11px] font-medium bg-[var(--surface-subtle)] text-[var(--charcoal)] border border-[var(--border-subtle)]">
                        {entry.actorName
                          ? entry.isSelf
                            ? "You"
                            : `${entry.actorName} (${entry.actorRoleTitle})`
                          : entry.actorRoleTitle || "Platform"}
                      </span>
                      <span className="text-xs text-[var(--text-muted)] font-mono">{timeStr}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
