import { ReviewerMarketplace } from "@/components/reviewers/reviewer-marketplace";

export default async function ReviewersPage({
  searchParams,
}: {
  searchParams: Promise<{ taskId?: string }>;
}) {
  const { taskId } = await searchParams;
  return <ReviewerMarketplace taskId={taskId} />;
}
