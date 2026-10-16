import { Check, Minus, ShieldCheck, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * "The agent can / cannot" panel (plan M1). This is explanatory copy that
 * mirrors the server-side authority policy (agent/authority.ts): the agent's
 * typed actions never include capture, refund, budget change, approval, or
 * verification override. The server remains the enforcement point; the UI only
 * explains it.
 */
const AGENT_CAN = [
  "Understand your request and draft a work plan",
  "Ask up to three clarifying questions",
  "Compile a draft contract for your approval",
  "Find and recommend an eligible provider",
  "Negotiate an offer within your budget",
  "Request payment authorization",
  "Request verification and a single revision",
  "Open a case for human review",
];

const AGENT_CANNOT = [
  "Capture or release funds",
  "Refund or void a payment",
  "Change your budget or deadline",
  "Approve the contract on your behalf",
  "Override a verification result",
  "Act outside the contract you approved",
];

export function AuthorityPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          The agent can
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <ul className="grid gap-2">
          {AGENT_CAN.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="rounded-lg border border-dashed p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            The agent cannot
          </div>
          <ul className="grid gap-2">
            {AGENT_CANNOT.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Minus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
