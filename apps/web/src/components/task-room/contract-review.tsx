"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Plus, Trash2, Loader2, Sparkles, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { modifyContractCriteria } from "@/lib/api/endpoints";
import { AuthorityPanel } from "./authority-panel";

export function ContractReview({
  contract,
  specRequirements = [],
  onApprove,
  approving = false,
  onContractUpdated,
}: {
  contract: ContractDto;
  specRequirements?: RequirementDto[];
  onApprove?: (expectedHash: string) => void | Promise<void>;
  approving?: boolean;
  onContractUpdated?: () => void;
}) {
  const [currentContract, setCurrentContract] = useState<ContractDto>(contract);
  const [open, setOpen] = useState(false);
  const [newCriterion, setNewCriterion] = useState("");
  const [isModifying, setIsModifying] = useState(false);
  const [criteriaError, setCriteriaError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentContract(contract);
  }, [contract]);

  const sourceByKey = new Map(specRequirements.map((r) => [r.key, r.source]));
  const ruleByKey = new Map(
    (currentContract.acceptancePlan?.rules ?? []).map((r) => [r.requirementKey, r]),
  );

  const included = currentContract.scope.filter((s) => s.type === "INCLUDED");
  const excluded = currentContract.scope.filter((s) => s.type === "EXCLUDED");
  const isAwaiting = currentContract.status === "AWAITING_APPROVAL";
  const canEdit = isAwaiting || currentContract.status === "DRAFT";

  const handleAddCriterion = async (e: React.FormEvent) => {
    e.preventDefault();
    const statement = newCriterion.trim();
    if (!statement) return;

    setIsModifying(true);
    setCriteriaError(null);
    const res = await modifyContractCriteria(currentContract.id, {
      action: "ADD",
      statement,
      acceptanceRelevant: true,
    });
    setIsModifying(false);

    if (res.error) {
      const err = "Failed to add criterion. Please try again.";
      setCriteriaError(err);
      toast.error(err);
      return;
    }

    if (res.data) {
      setCurrentContract(res.data);
      setNewCriterion("");
      toast.success("Criterion added to Work Agreement");
      onContractUpdated?.();
    }
  };

  const handleDeleteCriterion = async (key: string) => {
    if (currentContract.requirements.length <= 1) {
      const err = "A work agreement must retain at least one completion criterion.";
      setCriteriaError(err);
      toast.error(err);
      return;
    }

    setIsModifying(true);
    setCriteriaError(null);
    const res = await modifyContractCriteria(currentContract.id, {
      action: "DELETE",
      key,
    });
    setIsModifying(false);

    if (res.error) {
      const err = "Failed to remove criterion.";
      setCriteriaError(err);
      toast.error(err);
      return;
    }

    if (res.data) {
      setCurrentContract(res.data);
      toast.success("Criterion removed from Work Agreement");
      onContractUpdated?.();
    }
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold">{currentContract.title}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Version {currentContract.version}</Badge>
              <StatusBadge
                tone={
                  currentContract.status === "ACTIVE"
                    ? "success"
                    : currentContract.status === "AWAITING_APPROVAL"
                      ? "attention"
                      : "neutral"
                }
              >
                {contractStatusLabel(currentContract.status)}
              </StatusBadge>
            </div>
          </div>
          <CardDescription>{currentContract.summary}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs uppercase text-muted-foreground">Budget ceiling</div>
              <div className="mt-1 text-lg font-semibold">
                {formatMinorMoney({
                  amountMinor: currentContract.budgetMinor,
                  currency: currentContract.currency,
                })}
              </div>
              <div className="text-xs text-muted-foreground">The agent cannot spend more.</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs uppercase text-muted-foreground">Deadline</div>
              <div className="mt-1 text-sm font-medium">
                {currentContract.deadline ? formatDateTime(currentContract.deadline) : "No fixed deadline"}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs uppercase text-muted-foreground">Agreement hash</div>
              <div className="mt-1 truncate font-mono text-xs" title={currentContract.contractHash}>
                {currentContract.contractHash.slice(0, 16)}...
              </div>
              <div className="text-xs text-muted-foreground">Approval binds strictly to this hash.</div>
            </div>
          </div>

          <Separator />

          {/* Definition of Done Section */}
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span>Definition of Done (Criteria for Completion)</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Explicit criteria that must be satisfied for task verification and PayPal funds release.
                  {canEdit ? " You can add, edit, or remove criteria before approval." : ""}
                </p>
              </div>
              <Badge variant="secondary" className="text-xs">
                {currentContract.requirements.length} {currentContract.requirements.length === 1 ? "Criterion" : "Criteria"}
              </Badge>
            </div>

            {criteriaError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {criteriaError}
              </div>
            ) : null}

            <ul className="grid gap-2">
              {currentContract.requirements.map((r) => {
                const source = sourceByKey.get(r.key);
                return (
                  <li
                    key={r.id}
                    className="flex items-start justify-between gap-3 rounded-lg border p-3 bg-card transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="mt-1 h-2 w-2 rounded-full bg-primary/70 shrink-0" />
                      <span className="text-sm leading-relaxed">{r.statement}</span>
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
                      {canEdit ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => void handleDeleteCriterion(r.key)}
                          disabled={isModifying || currentContract.requirements.length <= 1}
                          title={
                            currentContract.requirements.length <= 1
                              ? "At least one criterion is required"
                              : "Remove this criterion"
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>

            {canEdit ? (
              <form onSubmit={handleAddCriterion} className="mt-2 flex gap-2">
                <Input
                  value={newCriterion}
                  onChange={(e) => setNewCriterion(e.target.value)}
                  placeholder="Add custom completion criterion (e.g. Include interactive preview chart)..."
                  className="text-sm"
                  disabled={isModifying}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={isModifying || !newCriterion.trim()}
                  className="shrink-0 gap-1.5"
                >
                  {isModifying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  <span>Add Criterion</span>
                </Button>
              </form>
            ) : null}
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
                <div className="text-sm font-semibold">Automated Verification Rules</div>
                <ul className="grid gap-2">
                  {currentContract.requirements
                    .filter((r) => ruleByKey.has(r.key))
                    .map((r) => {
                      const rule = ruleByKey.get(r.key);
                      return (
                        <li
                          key={`${r.id}-rule`}
                          className="grid gap-1 rounded-lg border p-3 text-sm"
                        >
                          <span className="font-medium">{r.statement}</span>
                          <span className="text-xs text-muted-foreground">
                            Evaluated via {rule?.method.toLowerCase().replace("_", " ") ?? "a check"}
                            {rule?.method === "SEMANTIC" ? " (AI assessment, advisory guidance)" : ""}
                          </span>
                        </li>
                      );
                    })}
                </ul>
              </div>
            </>
          ) : null}

          {isAwaiting && onApprove ? (
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                Approving cryptographically freezes these terms. The agent can then match qualified
                specialists and authorize payment up to the ceiling.
              </p>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button disabled={approving} className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    <span>Approve Agreement &amp; Match Specialist</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Approve this work agreement?</DialogTitle>
                    <DialogDescription>
                      You are approving version {currentContract.version} (hash{" "}
                      <span className="font-mono text-xs">
                        {currentContract.contractHash.slice(0, 12)}...
                      </span>
                      ). Payout amounts are strictly derived from this agreement and cannot be altered by browsers or third parties.
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
                        void onApprove(currentContract.contractHash);
                      }}
                    >
                      {approving ? "Approving..." : "Confirm & Approve"}
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

