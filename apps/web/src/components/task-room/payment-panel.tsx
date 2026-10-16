import { Lock, ShieldCheck, ShieldX, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Separator } from "@/components/ui/separator";
import { formatMinorMoney } from "@/lib/format";
import { paymentStatusLabel, paymentStatusTone } from "@/lib/status";
import type { PaymentDto } from "@/lib/api/types";

export function PaymentPanel({ payment }: { payment: PaymentDto | null }) {
  if (!payment) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" /> Payment
          </CardTitle>
          <CardDescription>No payment has been set up for this task yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const amount = formatMinorMoney({
    amountMinor: payment.amountMinor,
    currency: payment.currency,
  });
  const decision = payment.latestDecision;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" /> Payment
          </CardTitle>
          <StatusBadge tone={paymentStatusTone(payment.status)}>
            {paymentStatusLabel(payment.status)}
          </StatusBadge>
        </div>
        <CardDescription>
          {payment.status === "CAPTURED" ? (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" /> {amount} paid through PayPal.
            </span>
          ) : payment.status === "AUTHORIZED" ? (
            <span className="inline-flex items-center gap-1">
              <Lock className="h-3.5 w-3.5" /> {amount} authorized through PayPal — released only
              after verification passes.
            </span>
          ) : (
            <span>{amount} is being set up.</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-medium">{amount}</span>
          </div>
          {payment.paypalAuthorizationId ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Authorization</span>
              <span className="font-mono text-xs">{payment.paypalAuthorizationId}</span>
            </div>
          ) : null}
          {payment.paypalCaptureId ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Capture</span>
              <span className="font-mono text-xs">{payment.paypalCaptureId}</span>
            </div>
          ) : null}
        </div>

        {decision ? (
          <>
            <Separator />
            <div className="grid gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                {decision.result === "ALLOW" ? (
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                ) : (
                  <ShieldX className="h-4 w-4 text-red-600" />
                )}
                Policy {decision.result.toLowerCase()} for {decision.action.toLowerCase()}
              </div>
              <p className="text-sm text-muted-foreground">{decision.reason}</p>
              {decision.checks.length > 0 ? (
                <ul className="grid gap-1">
                  {decision.checks.map((check) => (
                    <li key={check.id} className="flex items-start justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">{check.label}</span>
                      <StatusBadge
                        tone={
                          check.result === "PASS"
                            ? "success"
                            : check.result === "FAIL"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {check.result === "NOT_APPLICABLE" ? "n/a" : check.result.toLowerCase()}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
