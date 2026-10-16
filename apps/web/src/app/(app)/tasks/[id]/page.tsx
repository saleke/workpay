import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default async function TaskRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold md:text-2xl">Task Room</h1>
          <p className="text-sm text-muted-foreground">Task {id}</p>
        </div>
        <Badge variant="secondary">DRAFT</Badge>
      </div>
      <Tabs defaultValue="outcome" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="outcome">Outcome</TabsTrigger>
          <TabsTrigger value="state">State</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="money">Money</TabsTrigger>
        </TabsList>
        <TabsContent value="outcome" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Desired Outcome</CardTitle>
              <CardDescription>What success means and how it will be verified.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="grid gap-2">
                <div className="text-sm font-medium">Outcome</div>
                <p className="text-sm text-muted-foreground">
                  No outcome yet. Run planning from the task to see the Work Specification and
                  contract.
                </p>
              </div>
              <Separator />
              <div className="grid gap-2">
                <div className="text-sm font-medium">Contract Review</div>
                <p className="text-sm text-muted-foreground">
                  Contract will appear here after planning. The agent can/cannot panel will be shown
                  prior to approval.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="state" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>State</CardTitle>
              <CardDescription>What's happening right now.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="evidence" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Evidence</CardTitle>
              <CardDescription>Artifacts and verification results.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">No evidence yet.</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="money" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Money</CardTitle>
              <CardDescription>Payment state (authorized vs released).</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
