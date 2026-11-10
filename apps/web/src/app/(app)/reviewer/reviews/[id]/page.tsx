"use client";

import { useParams } from "next/navigation";
import { PaidReviewerWorkspace } from "@/components/reviewers/paid-reviewer-workspace";

export default function PaidReviewerReviewPage() {
  const params = useParams<{ id: string }>();
  return <PaidReviewerWorkspace reviewId={params.id} />;
}
