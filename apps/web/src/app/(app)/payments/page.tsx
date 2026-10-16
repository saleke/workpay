import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function PaymentsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold md:text-2xl">Payments</h1>
        <p className="text-sm text-muted-foreground">Authorized and captured payments.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardDescription>Nothing here yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Payments will appear after authorization. Authorized means funds are reserved — they are
            not released until verification passes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
