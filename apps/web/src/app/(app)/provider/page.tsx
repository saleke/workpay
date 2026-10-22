import { Briefcase, ListTodo, Sliders, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProviderWorkList } from "@/components/provider/provider-work-list";
import { TalentRegistryView } from "@/components/provider/talent-registry-view";
import { ProviderProfileManager } from "@/components/provider/provider-profile-manager";

export default function ProviderPortalPage() {
  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl text-foreground">
              Work Studio &amp; Talent Network
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage assignments, submit deliverables, explore specialists across the talent network, and configure direct PayPal settlement payouts.
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="assignments" className="space-y-4">
        <TabsList className="bg-muted/60 p-1 border border-border/60">
          <TabsTrigger value="assignments" className="gap-2 text-xs font-semibold">
            <ListTodo className="h-3.5 w-3.5" />
            <span>Active Assignments</span>
          </TabsTrigger>
          <TabsTrigger value="registry" className="gap-2 text-xs font-semibold">
            <Users className="h-3.5 w-3.5" />
            <span>Specialist Talent Network</span>
          </TabsTrigger>
          <TabsTrigger value="profile" className="gap-2 text-xs font-semibold">
            <Sliders className="h-3.5 w-3.5" />
            <span>Specialist Profile &amp; Payouts</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assignments" className="space-y-4">
          <ProviderWorkList />
        </TabsContent>

        <TabsContent value="registry" className="space-y-4">
          <TalentRegistryView />
        </TabsContent>

        <TabsContent value="profile" className="space-y-4">
          <ProviderProfileManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
