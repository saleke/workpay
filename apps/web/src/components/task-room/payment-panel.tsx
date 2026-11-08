import { CheckCircle2, Lock, ShieldAlert, ShieldCheck, ShieldX, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Separator } from "@/components/ui/separator";
import { formatMinorMoney } from "@/lib/format";
import { paymentStatusLabel, paymentStatusTone } from "@/lib/status";
import type { PaymentDto } from "@/lib/api/types";

const paymentLifecycle = [
  "Simulated authorization",
  "Evidence checks",
  "Buyer approval",
  "Release policy",
  "Completion",
];

export function PaymentPanel({ payment }: { payment: PaymentDto | null }) {
  if (!payment) {
    return (
      <Card className="border-border/70 shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Wallet className="h-4 w-4 text-primary" /> Payment activity
          </CardTitle>
          <CardDescription>
            No simulated payment record exists yet. Tenfo does not hold, charge, or pay funds in
            this validation environment.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const amount = formatMinorMoney({
    amountMinor: payment.amountMinor,
    currency: payment.currency,
  });
  const decision = payment.latestDecision;
  const isCaptured = payment.status === "CAPTURED";
  const isAuthorized = payment.status === "AUTHORIZED";

  return (
    <div className="grid gap-4">
      {isCaptured ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-300/80 bg-emerald-50/90 p-4 text-sm text-emerald-900 shadow-xs dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200 shrink-0">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <div className="font-semibold text-base">Simulated capture recorded</div>
            <p className="mt-0.5 text-xs sm:text-sm text-emerald-800 dark:text-emerald-300 leading-relaxed">
              Policy recorded a simulated capture for {amount} after buyer approval. No funds were
              charged or paid.
            </p>
          </div>
        </div>
      ) : isAuthorized ? (
        <div className="flex items-start gap-3 rounded-xl border border-blue-300/80 bg-blue-50/90 p-4 text-sm text-blue-900 shadow-xs dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200 shrink-0">
            <Lock className="h-4 w-4" />
          </div>
          <div>
            <div className="font-semibold text-base">Simulated authorization recorded</div>
            <p className="mt-0.5 text-xs sm:text-sm text-blue-800 dark:text-blue-300 leading-relaxed">
              The policy model recorded authorization for {amount}. This is not a hold and no funds
              moved. Buyer review remains required.
            </p>
          </div>
        </div>
      ) : null}

      <Card className="border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/60 bg-muted/20 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Wallet className="h-4 w-4 text-primary" /> Payment & release status
            </CardTitle>
            <StatusBadge tone={paymentStatusTone(payment.status)}>
              {paymentStatusLabel(payment.status)}
            </StatusBadge>
          </div>
          <CardDescription className="mt-0.5">
            These are validation-only policy states. No PayPal account, hold, charge, payout, or
            transfer is involved.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-6 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border/60 bg-card p-3.5 shadow-xs">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Agreed amount
              </span>
              <span className="text-xl font-bold font-mono text-foreground mt-1 block">
                {amount}
              </span>
              <span className="text-[11px] text-muted-foreground">Contract value</span>
            </div>

            <div className="rounded-xl border border-border/60 bg-card p-3.5 shadow-xs">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Environment
              </span>
              <span className="text-xs font-mono font-semibold text-foreground mt-1 block truncate">
                Simulation only
              </span>
              <span className="text-[11px] text-muted-foreground">No live gateway account</span>
            </div>

            <div className="rounded-xl border border-border/60 bg-card p-3.5 shadow-xs">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Authorization state
              </span>
              <span className="text-xs font-mono font-semibold text-foreground mt-1 block truncate">
                {payment.status === "AUTHORIZED"
                  ? "Policy authorized"
                  : payment.status.replaceAll("_", " ")}
              </span>
              <span className="text-[11px] text-muted-foreground">No funds held</span>
            </div>

            <div className="rounded-xl border border-border/60 bg-card p-3.5 shadow-xs">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Release gate
              </span>
              <span className="text-xs font-semibold text-foreground mt-1 block">
                Human approval required
              </span>
              <span className="text-[11px] text-muted-foreground">Evidence + client decision</span>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Payment lifecycle
            </div>
            <div className="grid gap-2 sm:grid-cols-5">
              {paymentLifecycle.map((step, index) => (
                <div
                  key={step}
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-2 text-[11px] text-muted-foreground"
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                    {index + 1}
                  </div>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>

          {decision ? (
            <div className="grid gap-4 rounded-xl border border-border/70 bg-muted/10 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {decision.result === "ALLOW" ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <ShieldX className="h-4 w-4 text-rose-600" />
                  )}
                  <span>Release decision: {decision.result}</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">{decision.action}</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border/60 bg-card p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Reason code
                  </div>
                  <div className="mt-1 text-sm font-medium text-foreground break-all">
                    {decision.reasonCode}
                  </div>
                </div>

                <div className="rounded-lg border border-border/60 bg-card p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Policy version
                  </div>
                  <div className="mt-1 text-sm font-medium text-foreground break-all">
                    {decision.policyVersion}
                  </div>
                </div>

                <div className="rounded-lg border border-border/60 bg-card p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Human gate
                  </div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {decision.result === "ALLOW" ? "Simulation allowed" : "Waiting / blocked"}
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">{decision.reason}</p>

              {decision.checks.length > 0 ? (
                <div className="grid gap-2 pt-2 border-t border-border/50">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Payment checks:
                  </span>
                  <ul className="grid gap-1.5">
                    {decision.checks.map((check) => (
                      <li
                        key={check.id}
                        className="flex items-center justify-between rounded-lg bg-card px-3 py-1.5 text-xs border border-border/50"
                      >
                        <span className="font-medium text-foreground">{check.label}</span>
                        <StatusBadge
                          tone={
                            check.result === "PASS"
                              ? "success"
                              : check.result === "FAIL"
                                ? "danger"
                                : "neutral"
                          }
                        >
                          {check.result}
                        </StatusBadge>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
