import { CasesReviewList } from "@/components/cases/cases-review-list";

export default function ReviewPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold md:text-2xl">Human Review</h1>
        <p className="text-sm text-muted-foreground">
          Cases opened for UNCERTAIN verification or exceptions. Admin/reviewer only in production;
          read-only by default in the MVP; resolution is idempotent.
        </p>
      </div>
      <CasesReviewList />
    </div>
  );
}
