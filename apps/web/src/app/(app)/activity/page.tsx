import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ActivityPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold md:text-2xl">Activity</h1>
        <p className="text-sm text-muted-foreground">Timeline of what happened.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
          <CardDescription>No activity yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Activity will populate as events occur (finding provider, submissions, verification,
            payments).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
