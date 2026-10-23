"use client";

import { useMemo } from "react";
import Link from "next/link";
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
  const entries = data ?? [];

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
      <div className="py-20 text-center text-[var(--room-muted)] font-serif">
        Retrieving activity log...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="py-20 text-center">
        <h1 className="font-serif text-[1.5rem] text-[var(--room-text-strong)] font-normal">
          No activity recorded yet
        </h1>
        <p className="text-[var(--room-muted)] mt-2 text-[var(--text-body)]">
          Actions, verifications, and payment releases will be recorded here in sequence.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="screen-label">Activity</p>
      <div className="sheet">
        <div className="sheet-meta">Audit record of events and state changes</div>

        {grouped.map((group, gIdx) => (
          <div key={group.day} className={gIdx > 0 ? "mt-6" : "mt-4"}>
            <p className="group-heading">{group.day}</p>
            <div className="mt-2 divide-y divide-[var(--paper-rule)]">
              {group.items.map((entry) => (
                <div
                  key={entry.id}
                  className="py-2.5 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 text-[var(--text-body)]"
                >
                  <div className="font-serif text-[var(--ink)]">
                    <span className="font-medium">{entry.title}</span>
                    {entry.description && (
                      <span className="block text-sm text-[var(--ink-soft)] mt-0.5">
                        {entry.description}
                      </span>
                    )}
                  </div>
                  <span className="lbl shrink-0">
                    {new Date(entry.occurredAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
