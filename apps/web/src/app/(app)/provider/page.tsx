import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProviderPortalPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold md:text-2xl">Provider Portal</h1>
        <p className="text-sm text-muted-foreground">
          Available work, accept assignments, submit deliverables.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Available work</CardTitle>
          <CardDescription>Nothing available yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Seeded providers can see eligible work here and accept within budget/deadline.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
