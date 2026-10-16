"use client";

import { useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/states";
import { useApi } from "@/lib/use-api";
import { getProviderWork } from "@/lib/api/endpoints";
import { ProviderWorkDetail } from "./provider-work-detail";

export function ProviderWorkDetailPage({ executionId }: { executionId: string }) {
  const { data, error, loading, reload } = useApi(
    () => getProviderWork(executionId),
    [executionId],
  );

  if (loading && !data) return <LoadingState label="Loading assignment..." />;
  if (error) {
    return (
      <ErrorState
        title="Could not load this assignment"
        description="You may not have access to this work, or it may no longer exist."
        onRetry={reload}
      />
    );
  }
  if (!data) return <ErrorState title="Assignment not found" />;

  return (
    <div className="flex flex-col gap-4">
      <Button variant="outline" size="sm" className="w-fit" asChild>
        <Link href="/provider">
          <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Back to available work
        </Link>
      </Button>
      <ProviderWorkDetail work={data} onChanged={reload} />
    </div>
  );
}
