import { CheckCircle2, Lock, ShieldAlert, ShieldCheck, ShieldX, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Separator } from "@/components/ui/separator";
import { formatMinorMoney } from "@/lib/format";
import { paymentStatusLabel, paymentStatusTone } from "@/lib/status";
import type { PaymentDto } from "@/lib/api/types";

export function PaymentPanel({ payment }: { payment: PaymentDto | null }) {
  if (!payment) {
    return (
      <Card className="border-border/70 shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Wallet className="h-4 w-4 text-primary" /> PayPal Escrow Ledger
          </CardTitle>
          <CardDescription>
            No payment has been initialized for this contract yet. Escrow authorization is created once the contract is approved.
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
      {/* Top Escrow Banner */}
      {isCaptured ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-300/80 bg-emerald-50/90 p-4 text-sm text-emerald-900 shadow-xs dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200 shrink-0">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <div className="font-semibold text-base">Escrow Capture Succeeded</div>
            <p className="mt-0.5 text-xs sm:text-sm text-emerald-800 dark:text-emerald-300 leading-relaxed">
              {amount} has been captured from buyer escrow hold and disbursed directly to {payment.payoutEmail ? <span className="font-mono font-semibold underline">{payment.payoutEmail}</span> : "provider account"} via PayPal Payouts API. Release was triggered only after deterministic acceptance proof completed with zero defects.
            </p>
          </div>
        </div>
      ) : isAuthorized ? (
        <div className="flex items-start gap-3 rounded-xl border border-blue-300/80 bg-blue-50/90 p-4 text-sm text-blue-900 shadow-xs dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200 shrink-0">
            <Lock className="h-4 w-4" />
          </div>
          <div>
            <div className="font-semibold text-base">PayPal Authorization Hold Active</div>
            <p className="mt-0.5 text-xs sm:text-sm text-blue-800 dark:text-blue-300 leading-relaxed">
              {amount} is secured in PayPal buyer authorization hold. Funds cannot be captured until verification completes. Upon passing, settlement will disburse directly to {payment.payoutEmail ? <span className="font-mono font-semibold underline">{payment.payoutEmail}</span> : "assigned provider"}.
            </p>
          </div>
        </div>
      ) : null}

      <Card className="border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/60 bg-muted/20 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Wallet className="h-4 w-4 text-primary" /> PayPal Transaction Ledger
            </CardTitle>
            <StatusBadge tone={paymentStatusTone(payment.status)}>
              {paymentStatusLabel(payment.status)}
            </StatusBadge>
          </div>
          <CardDescription className="mt-0.5">
            Immutable financial state tracked via PostgreSQL outbox and synced with PayPal Orders v2 and Payouts v1.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-6 p-6">
          {/* Key Financial Data Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border/60 bg-card p-3.5 shadow-xs">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Agreed Amount
              </span>
              <span className="text-xl font-bold font-mono text-foreground mt-1 block">
                {amount}
              </span>
              <span className="text-[11px] text-muted-foreground">Fixed Contract Price</span>
            </div>

            <div className="rounded-xl border border-border/60 bg-card p-3.5 shadow-xs">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                PayPal Authorization ID
              </span>
              <span className="text-xs font-mono font-semibold text-foreground mt-1 block truncate">
                {payment.paypalAuthorizationId ?? "Pending Approval"}
              </span>
              <span className="text-[11px] text-muted-foreground">Pre-authorized hold token</span>
            </div>

            <div className="rounded-xl border border-border/60 bg-card p-3.5 shadow-xs">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                PayPal Capture ID
              </span>
              <span className="text-xs font-mono font-semibold text-foreground mt-1 block truncate">
                {payment.paypalCaptureId ?? "Awaiting Verification"}
              </span>
              <span className="text-[11px] text-muted-foreground">Final settlement token</span>
            </div>

            <div className="rounded-xl border border-border/60 bg-card p-3.5 shadow-xs">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Provider Payout Destination
              </span>
              <span className="text-xs font-mono font-semibold text-foreground mt-1 block truncate" title={payment.payoutEmail ?? "Pending Assignment"}>
                {payment.payoutEmail ?? "Pending Assignment"}
              </span>
              <span className="text-[11px] text-muted-foreground">Direct PayPal recipient</span>
            </div>
          </div>

          {/* Policy Gate Decision */}
          {decision ? (
            <div className="grid gap-3 rounded-xl border border-border/70 p-4 bg-muted/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {decision.result === "ALLOW" ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <ShieldX className="h-4 w-4 text-rose-600" />
                  )}
                  <span>Policy Gate Evaluation: {decision.result}</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">Action: {decision.action}</span>
              </div>
              <p className="text-xs text-muted-foreground">{decision.reason}</p>

              {decision.checks.length > 0 ? (
                <div className="grid gap-2 pt-2 border-t border-border/50">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Automated Invariant Gating Checks:
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
