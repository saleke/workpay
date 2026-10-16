"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMinorMoney, formatDateTime } from "@/lib/format";
import { contractStatusLabel, requirementSourceLabel } from "@/lib/status";
import type { ContractDto, RequirementDto } from "@/lib/api/types";
import { AuthorityPanel } from "./authority-panel";

export function ContractReview({
  contract,
  specRequirements = [],
  onApprove,
  approving = false,
}: {
  contract: ContractDto;
  specRequirements?: RequirementDto[];
  onApprove?: (expectedHash: string) => void | Promise<void>;
  approving?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const sourceByKey = new Map(specRequirements.map((r) => [r.key, r.source]));
  const ruleByKey = new Map(
    (contract.acceptancePlan?.rules ?? []).map((r) => [r.requirementKey, r]),
  );

  const included = contract.scope.filter((s) => s.type === "INCLUDED");
  const excluded = contract.scope.filter((s) => s.type === "EXCLUDED");
  const isAwaiting = contract.status === "AWAITING_APPROVAL";

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{contract.title}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Version {contract.version}</Badge>
              <StatusBadge
                tone={
                  contract.status === "ACTIVE"
                    ? "success"
                    : contract.status === "AWAITING_APPROVAL"
                      ? "attention"
                      : "neutral"
                }
              >
                {contractStatusLabel(contract.status)}
              </StatusBadge>
            </div>
          </div>
          <CardDescription>{contract.summary}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs uppercase text-muted-foreground">Budget ceiling</div>
              <div className="mt-1 text-lg font-semibold">
                {formatMinorMoney({
                  amountMinor: contract.budgetMinor,
                  currency: contract.currency,
                })}
              </div>
              <div className="text-xs text-muted-foreground">The agent cannot spend more.</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs uppercase text-muted-foreground">Deadline</div>
              <div className="mt-1 text-sm font-medium">
                {contract.deadline ? formatDateTime(contract.deadline) : "No fixed deadline"}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs uppercase text-muted-foreground">Contract hash</div>
              <div className="mt-1 truncate font-mono text-xs" title={contract.contractHash}>
                {contract.contractHash.slice(0, 16)}…
              </div>
              <div className="text-xs text-muted-foreground">Approval binds to this hash.</div>
            </div>
          </div>

          <Separator />

          <div className="grid gap-3">
            <div className="text-sm font-medium">What will be delivered (requirements)</div>
            <ul className="grid gap-2">
              {contract.requirements.map((r) => {
                const source = sourceByKey.get(r.key);
                return (
                  <li
                    key={r.id}
                    className="flex items-start justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 text-sm">{r.statement}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {source ? (
                        <Badge variant="secondary" className="whitespace-nowrap text-xs">
                          {requirementSourceLabel(source)}
                        </Badge>
                      ) : null}
                      {r.acceptanceRelevant ? (
                        <StatusBadge tone="progress">verified</StatusBadge>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {included.length > 0 || excluded.length > 0 ? (
            <>
              <Separator />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" /> In scope
                  </div>
                  <ul className="grid gap-1 text-sm text-muted-foreground">
                    {included.map((s) => (
                      <li key={s.id}>{s.statement}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <XCircle className="h-4 w-4 text-muted-foreground" /> Out of scope
                  </div>
                  <ul className="grid gap-1 text-sm text-muted-foreground">
                    {excluded.map((s) => (
                      <li key={s.id}>{s.statement}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          ) : null}

          {ruleByKey.size > 0 ? (
            <>
              <Separator />
              <div className="grid gap-3">
                <div className="text-sm font-medium">How it will be verified</div>
                <ul className="grid gap-2">
                  {contract.requirements
                    .filter((r) => ruleByKey.has(r.key))
                    .map((r) => {
                      const rule = ruleByKey.get(r.key);
                      return (
                        <li
                          key={`${r.id}-rule`}
                          className="grid gap-1 rounded-lg border p-3 text-sm"
                        >
                          <span>{r.statement}</span>
                          <span className="text-xs text-muted-foreground">
                            Checked by {rule?.method.toLowerCase().replace("_", " ") ?? "a check"}
                            {rule?.method === "SEMANTIC" ? " (AI assessment, advisory)" : ""}
                          </span>
                        </li>
                      );
                    })}
                </ul>
              </div>
            </>
          ) : null}

          {isAwaiting && onApprove ? (
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Approving freezes these terms. The agent may then find a provider and authorize
                payment up to the ceiling.
              </p>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button disabled={approving}>Approve &amp; Let AI Hire</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Approve this contract?</DialogTitle>
                    <DialogDescription>
                      You are approving version {contract.version} (hash{" "}
                      <span className="font-mono text-xs">
                        {contract.contractHash.slice(0, 12)}…
                      </span>
                      ). Amounts come only from this agreement, never from the browser.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      disabled={approving}
                      onClick={() => {
                        setOpen(false);
                        void onApprove(contract.contractHash);
                      }}
                    >
                      {approving ? "Approving…" : "Approve contract"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <AuthorityPanel />
    </div>
  );
}
