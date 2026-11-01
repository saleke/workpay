import { ReviewerEngagementInbox } from "@/components/reviewers/reviewer-engagement-inbox";

export default function ReviewerEngagementsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Reviewer workspace</p>
        <h1 className="text-2xl font-semibold">Independent review engagements</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Review invitations appear here after both task participants agree to the reviewer,
          criteria, and fee arrangement. Reports are tied to the exact contract version.
        </p>
      </header>
      <ReviewerEngagementInbox />
    </div>
  );
}
