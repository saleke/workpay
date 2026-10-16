import { ProviderWorkList } from "@/components/provider/provider-work-list";

export default function ProviderPortalPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold md:text-2xl">Provider Portal</h1>
        <p className="text-sm text-muted-foreground">
          Available work, accept assignments, submit deliverables.
        </p>
      </div>
      <ProviderWorkList />
    </div>
  );
}
