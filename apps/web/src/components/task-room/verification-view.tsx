import { CheckCircle2, HelpCircle, ShieldAlert, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { verificationOutcomeLabel, verificationOutcomeTone } from "@/lib/status";
import type { VerificationDto, VerificationOutcome } from "@/lib/api/types";

function OutcomeIcon({ outcome }: { outcome: VerificationOutcome }) {
  if (outcome === "PASS") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (outcome === "FAIL") return <XCircle className="h-4 w-4 text-red-600" />;
  return <HelpCircle className="h-4 w-4 text-amber-600" />;
}

export function VerificationView({ verification }: { verification: VerificationDto }) {
  const protectsPayment = verification.outcome === "FAIL" || verification.outcome === "UNCERTAIN";

  return (
    <div className="grid gap-4">
      {protectsPayment ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Payment remains protected</div>
            <p>
              {verification.outcome === "FAIL"
                ? "The work did not meet every requirement, so funds are not released. A revision can be requested."
                : "Verification is uncertain, so funds are held until a human reviews the evidence."}
            </p>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Verification</CardTitle>
            {verification.outcome ? (
              <StatusBadge tone={verificationOutcomeTone(verification.outcome)}>
                {verificationOutcomeLabel(verification.outcome)}
              </StatusBadge>
            ) : (
              <StatusBadge tone="progress">Running</StatusBadge>
            )}
          </div>
          <CardDescription>
            Checked against contract version {verification.contractVersion}.{" "}
            {verification.passedRequirements} passed, {verification.failedRequirements} failed.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {verification.results.map((result) => (
            <div key={result.id} className="grid gap-2 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <OutcomeIcon outcome={result.outcome} />
                  <span className="text-sm font-medium">{result.statement}</span>
                </div>
                <StatusBadge tone={verificationOutcomeTone(result.outcome)}>
                  {verificationOutcomeLabel(result.outcome)}
                </StatusBadge>
              </div>
              {result.expected || result.actual ? (
                <div className="grid gap-1 pl-6 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>
                    <span className="font-medium text-foreground">Expected:</span>{" "}
                    {result.expected ?? "—"}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Actual:</span>{" "}
                    {result.actual ?? "—"}
                  </div>
                </div>
              ) : null}
              {result.explanation ? (
                <p className="pl-6 text-sm text-muted-foreground">{result.explanation}</p>
              ) : null}
              {result.evidence.length > 0 ? (
                <ul className="grid gap-1 pl-6">
                  {result.evidence.map((ev) => (
                    <li key={ev.id} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{ev.label}:</span>{" "}
                      {ev.value ?? ev.detail ?? ev.type.toLowerCase()}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
