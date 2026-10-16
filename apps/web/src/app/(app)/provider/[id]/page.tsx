import { ProviderWorkDetailPage } from "@/components/provider/provider-work-detail-page";

export default async function ProviderWorkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProviderWorkDetailPage executionId={id} />;
}
