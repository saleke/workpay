import { redirect } from "next/navigation";

export default function ReviewerProfilePage() {
  redirect("/settings?tab=work-preferences&section=reviews");
}
