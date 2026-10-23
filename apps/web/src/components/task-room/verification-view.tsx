import { CheckCircle2, HelpCircle, Lock, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { verificationOutcomeLabel, verificationOutcomeTone } from "@/lib/status";
import type { VerificationDto, VerificationOutcome } from "@/lib/api/types";
import { cn } from "@/lib/utils";

function OutcomeIcon({ outcome }: { outcome: VerificationOutcome }) {
  if (outcome === "PASS") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (outcome === "FAIL") return <XCircle className="h-4 w-4 text-rose-600" />;
  return <HelpCircle className="h-4 w-4 text-amber-600" />;
}

export function VerificationView({ verification }: { verification: VerificationDto }) {
  const isFailed = verification.outcome === "FAIL";
  const isUncertain = verification.outcome === "UNCERTAIN";
  const isPassed = verification.outcome === "PASS";

  return (
    <div className="grid gap-4">
      {isFailed || isUncertain ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300/80 bg-amber-50/90 p-4 text-sm text-amber-900 shadow-xs dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200 shrink-0">
            <Lock className="h-4 w-4" />
          </div>
          <div>
            <div className="font-semibold text-base">PayPal Authorization Hold Maintained</div>
            <p className="mt-0.5 text-xs sm:text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
              {isFailed
                ? "The deliverable failed deterministic validation checks. Funds are strictly held in PayPal authorization hold and cannot be captured until a compliant revision is verified."
                : "Verification requires human arbitration. Funds remain protected in PayPal authorization hold until an arbitrator resolves the case."}
            </p>
          </div>
        </div>
      ) : isPassed ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-300/80 bg-emerald-50/90 p-4 text-sm text-emerald-900 shadow-xs dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200 shrink-0">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <div className="font-semibold text-base">Cryptographic Proof Verified</div>
            <p className="mt-0.5 text-xs sm:text-sm text-emerald-800 dark:text-emerald-300 leading-relaxed">
              All acceptance criteria passed deterministic and semantic evaluation. PayPal capture policy gate has approved fund release to the provider.
            </p>
          </div>
        </div>
      ) : null}

      <Card className="border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/60 bg-muted/20 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold">Verification Proof Matrix</CardTitle>
              <CardDescription className="mt-0.5">
                Evaluated against Contract Version {verification.contractVersion}:{" "}
                <strong className="text-emerald-600 font-medium">{verification.passedRequirements} passed</strong>,{" "}
                <strong className={verification.failedRequirements > 0 ? "text-rose-600 font-medium" : "text-muted-foreground"}>
                  {verification.failedRequirements} failed
                </strong>.
              </CardDescription>
            </div>
            {verification.outcome ? (
              <StatusBadge tone={verificationOutcomeTone(verification.outcome)}>
                {verificationOutcomeLabel(verification.outcome)}
              </StatusBadge>
            ) : (
              <StatusBadge tone="progress">Evaluating Proofs...</StatusBadge>
            )}
          </div>
        </CardHeader>

        <CardContent className="grid gap-3 p-6">
          {verification.results.map((result) => {
            const isItemPass = result.outcome === "PASS";
            const isItemFail = result.outcome === "FAIL";

            return (
              <div
                key={result.id}
                className={cn(
                  "grid gap-2 rounded-xl border p-4 transition-colors",
                  isItemPass
                    ? "border-emerald-200/70 bg-emerald-50/20 dark:border-emerald-900/40 dark:bg-emerald-950/10"
                    : isItemFail
                      ? "border-rose-200/80 bg-rose-50/30 dark:border-rose-900/40 dark:bg-rose-950/10"
                      : "border-border/60 bg-card",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <OutcomeIcon outcome={result.outcome} />
                    <span className="text-sm font-semibold text-foreground">{result.statement}</span>
                  </div>
                  <StatusBadge tone={verificationOutcomeTone(result.outcome)}>
                    {verificationOutcomeLabel(result.outcome)}
                  </StatusBadge>
                </div>

                {result.expected || result.actual ? (
                  <div className="grid gap-2 pl-6 pt-1 text-xs sm:grid-cols-2">
                    <div className="rounded-md bg-muted/60 p-2 font-mono">
                      <span className="font-semibold text-foreground block text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">
                        Expected Criterion:
                      </span>
                      {result.expected ?? "N/A"}
                    </div>
                    <div className="rounded-md bg-muted/60 p-2 font-mono">
                      <span className="font-semibold text-foreground block text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">
                        Actual Deliverable Proof:
                      </span>
                      <span className={isItemFail ? "text-rose-600 font-semibold" : ""}>
                        {result.actual ?? "N/A"}
                      </span>
                    </div>
                  </div>
                ) : null}

                {result.explanation ? (
                  <p className="pl-6 text-xs text-muted-foreground leading-relaxed">
                    {result.explanation}
                  </p>
                ) : null}

                {result.evidence.length > 0 ? (
                  <ul className="grid gap-1 pl-6 pt-1">
                    {result.evidence.map((ev) => (
                      <li key={ev.id} className="text-xs text-muted-foreground flex items-center gap-1.5 font-mono">
                        <span className="inline-block h-1 w-1 rounded-full bg-primary" />
                        <span className="font-medium text-foreground">{ev.label}:</span>
                        <span>{ev.value ?? ev.detail ?? ev.type.toLowerCase()}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
