import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getEventLabel } from "@/lib/event-labels";
import { formatDateTime } from "@/lib/format";
import type { ActivityEntryDto } from "@/lib/api/types";

function titleFor(entry: ActivityEntryDto): string {
  if (entry.title) return entry.title;
  return getEventLabel(entry.type).title;
}

function descriptionFor(entry: ActivityEntryDto): string {
  if (entry.description) return entry.description;
  return getEventLabel(entry.type).description;
}

export function ActivityTimeline({ entries }: { entries: ActivityEntryDto[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity</CardTitle>
        <CardDescription>The whole story, in order.</CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
        ) : (
          <ol className="relative grid gap-6 border-l pl-6">
            {entries.map((entry) => (
              <li key={entry.id} className="relative">
                <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{titleFor(entry)}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(entry.occurredAt)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{descriptionFor(entry)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
