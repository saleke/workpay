"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  ExternalLink,
  Lock,
  RefreshCw,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState, ErrorState, EmptyState } from "@/components/states";
import { formatMinorMoney, formatDateTime } from "@/lib/format";
import { paymentStatusLabel, paymentStatusTone } from "@/lib/status";
import { useApi } from "@/lib/use-api";
import { listPayments } from "@/lib/api/endpoints";
import type { PaymentStatus } from "@/lib/api/types";

export default function PaymentsPage() {
  const { data, error, loading, reload } = useApi(() => listPayments(), []);
  const [filter, setFilter] = useState<string>("ALL");

  if (loading && !data) return <LoadingState label="Loading PayPal escrow ledger..." />;
  if (error) {
    return (
      <ErrorState
        title="Could not load payments ledger"
        description="Unable to reach the payment service. Please verify your connection."
        onRetry={reload}
      />
    );
  }

  const payments = data ?? [];

  const totalAuthorizedMinor = payments
    .filter((p) => p.status === "AUTHORIZED")
    .reduce((sum, p) => sum + p.amountMinor, 0);

  const totalCapturedMinor = payments
    .filter((p) => p.status === "CAPTURED")
    .reduce((sum, p) => sum + p.amountMinor, 0);

  const activeHoldCount = payments.filter((p) => p.status === "AUTHORIZED").length;
  const capturedCount = payments.filter((p) => p.status === "CAPTURED").length;

  const filteredPayments = payments.filter((p) => {
    if (filter === "ALL") return true;
    if (filter === "AUTHORIZED") return p.status === "AUTHORIZED";
    if (filter === "CAPTURED") return p.status === "CAPTURED";
    return p.status !== "AUTHORIZED" && p.status !== "CAPTURED";
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              PayPal Escrow & Settlement
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
              <Zap className="h-3 w-3" />
              Two-Phase Commit
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Funds are authorized upfront into PayPal escrow and captured only upon automated proof
            verification.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => reload()} className="gap-1.5 self-start sm:self-auto">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Ledger
        </Button>
      </div>

      {/* Metrics Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border/70 shadow-xs bg-card">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs font-medium">
              <span>Funds in Escrow Hold</span>
              <Lock className="h-4 w-4 text-blue-500" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
              {formatMinorMoney({ amountMinor: totalAuthorizedMinor, currency: "USD" })}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {activeHoldCount} payment{activeHoldCount !== 1 ? "s" : ""} authorized & reserved
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-xs bg-card">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs font-medium">
              <span>Settled to Providers</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
              {formatMinorMoney({ amountMinor: totalCapturedMinor, currency: "USD" })}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {capturedCount} deliverable{capturedCount !== 1 ? "s" : ""} verified & captured
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-xs bg-card">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs font-medium">
              <span>PayPal Rail Protocol</span>
              <ShieldCheck className="h-4 w-4 text-indigo-500" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
              100% Safe
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Zero-loss guarantee: fail-closed dispute routing
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-3">
        {[
          { key: "ALL", label: `All Transactions (${payments.length})` },
          { key: "AUTHORIZED", label: `In Escrow (${activeHoldCount})` },
          { key: "CAPTURED", label: `Settled (${capturedCount})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === tab.key
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Transactions List */}
      {filteredPayments.length === 0 ? (
        <EmptyState
          title="No transactions match this filter"
          description="Transactions appear when work agreements are approved and payments are authorized via PayPal."
        />
      ) : (
        <div className="grid gap-4">
          {filteredPayments.map((p) => {
            const isAuthorized = p.status === "AUTHORIZED";
            const isCaptured = p.status === "CAPTURED";

            return (
              <Card
                key={p.id}
                className="border-border/80 shadow-xs hover:border-primary/40 transition-all bg-card"
              >
                <CardHeader className="pb-3 border-b border-border/50 bg-muted/10">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                          isCaptured
                            ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400"
                            : isAuthorized
                              ? "border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-400"
                              : "border-border bg-muted/40 text-muted-foreground"
                        }`}
                      >
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base font-semibold text-foreground">
                            {formatMinorMoney({ amountMinor: p.amountMinor, currency: p.currency })}
                          </CardTitle>
                          <StatusBadge tone={paymentStatusTone(p.status)}>
                            {paymentStatusLabel(p.status)}
                          </StatusBadge>
                        </div>
                        <CardDescription className="text-xs font-mono mt-0.5">
                          Payment ID: {p.id}
                        </CardDescription>
                      </div>
                    </div>

                    <Button asChild size="sm" variant="ghost" className="self-start sm:self-auto gap-1">
                      <Link href={`/tasks/${p.taskId}`}>
                        View Task Room
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="pt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                  <div className="rounded-lg bg-muted/40 p-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                      PayPal Auth ID
                    </span>
                    <span className="font-mono text-foreground select-all break-all">
                      {p.paypalAuthorizationId ?? "Pending Authorization"}
                    </span>
                  </div>

                  <div className="rounded-lg bg-muted/40 p-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                      PayPal Capture ID
                    </span>
                    <span className="font-mono text-foreground select-all break-all">
                      {p.paypalCaptureId ?? (isAuthorized ? "Escrow Reserved" : "N/A")}
                    </span>
                  </div>

                  <div className="rounded-lg bg-muted/40 p-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                      Authorized At
                    </span>
                    <span className="text-foreground">
                      {p.authorizedAt ? formatDateTime(p.authorizedAt) : "Pending"}
                    </span>
                  </div>

                  <div className="rounded-lg bg-muted/40 p-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                      Settled / Captured At
                    </span>
                    <span className="text-foreground">
                      {p.capturedAt ? formatDateTime(p.capturedAt) : isAuthorized ? "Pending Verification" : "Pending"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
