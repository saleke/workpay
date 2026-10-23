"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  DollarSign,
  FileCheck,
  Lock,
  ShieldCheck,
  Sparkles,
  UserCheck,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LoadingState, ErrorState } from "@/components/states";
import { formatMinorMoney, formatDateTime } from "@/lib/format";
import { getTaskInvitation, acceptTaskInvitation } from "@/lib/api/endpoints";
import type { TaskInvitationDto } from "@/lib/api/types";

export default function TaskInvitationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id: taskId } = use(params);

  const [invitation, setInvitation] = useState<TaskInvitationDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [payoutEmail, setPayoutEmail] = useState("");
  const [bio, setBio] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      const res = await getTaskInvitation(taskId);
      if (!active) return;
      setLoading(false);
      if (res.error || !res.data) {
        setError(res.error?.message ?? "Could not load this invitation.");
      } else {
        setInvitation(res.data);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [taskId]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      setSubmitError("You must agree to the Definition of Done and payment terms.");
      return;
    }
    if (!displayName.trim() || !payoutEmail.trim()) {
      setSubmitError("Please provide your name and PayPal payout email.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const caps = capabilities
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    const res = await acceptTaskInvitation(taskId, {
      displayName: displayName.trim(),
      payoutEmail: payoutEmail.trim(),
      bio: bio.trim() || undefined,
      capabilities: caps,
    });

    setSubmitting(false);

    if (res.error || !res.data) {
      setSubmitError(res.error?.message ?? "Could not accept this invitation. Please try again.");
    } else {
      router.push("/provider");
    }
  };

  if (loading) {
    return <LoadingState label="Verifying work agreement invitation & payment terms..." />;
  }

  if (error || !invitation) {
    return (
      <ErrorState
        title="Invitation not available"
        description={error ?? "This task may not exist or does not have an active approved work agreement."}
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-4">
      {/* Hero Invitation Banner */}
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-card via-card to-primary/5 p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1 border-primary/40 bg-primary/10 text-primary text-xs">
                <Sparkles className="h-3 w-3" />
                Work Agreement Invitation
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">
                v{invitation.contractVersion}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              {invitation.taskTitle}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
              {invitation.taskRequest}
            </p>
          </div>

          {/* Budget Ceiling & Authorization Card */}
          <div className="rounded-xl border border-border/80 bg-background/80 p-4 text-right shadow-xs shrink-0 min-w-[200px]">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Payment on Verified Delivery
            </div>
            <div className="mt-1 text-2xl font-extrabold font-mono text-foreground">
              {formatMinorMoney({
                amountMinor: invitation.budgetMinor,
                currency: invitation.currency,
              })}
            </div>
            <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              <Lock className="h-3 w-3" />
              <span>Direct PayPal Authorization Protected</span>
            </div>
          </div>
        </div>

        {/* Cryptographic Hash Seal */}
        <div className="mt-4 pt-4 border-t border-border/60 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground font-mono">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span>Cryptographic Agreement Hash:</span>
            <code className="bg-muted px-2 py-0.5 rounded text-foreground font-semibold">
              {invitation.contractHash.slice(0, 16)}...{invitation.contractHash.slice(-8)}
            </code>
          </span>
          <span>Terms cryptographically sealed by Task Owner</span>
        </div>
      </div>

      {/* Already Assigned Banner */}
      {invitation.isAssigned ? (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
          <CardContent className="pt-6 flex items-start gap-3 text-amber-900 dark:text-amber-200">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <div className="font-semibold text-base">Assignment Sealed &amp; In Progress</div>
              <p className="text-sm mt-0.5">
                This assignment has already been accepted and secured by specialist{" "}
                <strong>{invitation.assignedSpecialistName || "an assigned specialist"}</strong>.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 md:grid-cols-5">
        {/* Left Column: Definition of Done */}
        <div className="space-y-4 md:col-span-3">
          <Card className="border-border/80 shadow-xs">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-primary" />
                <span>Definition of Done (Criteria for Completion)</span>
              </CardTitle>
              <CardDescription>
                Review the exact criteria required for automated verification and payment release.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="grid gap-2">
                {invitation.requirements.map((r, i) => (
                  <li
                    key={r.id || r.key}
                    className="flex items-start justify-between gap-3 rounded-lg border p-3 bg-muted/20 text-sm"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="mt-1 h-2 w-2 rounded-full bg-primary/80 shrink-0" />
                      <span className="leading-relaxed">{r.statement}</span>
                    </div>
                    {r.acceptanceRelevant ? (
                      <Badge variant="secondary" className="text-[10px] shrink-0 font-medium">
                        Verified
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ul>

              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground flex items-start gap-2">
                <Clock className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <div>
                  <span className="font-semibold text-foreground">Target Deadline: </span>
                  {invitation.deadline ? formatDateTime(invitation.deadline) : "Agreed upon acceptance"}
                  <p className="mt-0.5">
                    Proactive autonomous audits check in during execution to keep delivery on track.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Acceptance Form */}
        <div className="space-y-4 md:col-span-2">
          {!invitation.isAssigned ? (
            <Card className="border-primary/40 shadow-sm">
              <CardHeader className="bg-primary/5 border-b border-border/60">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-primary" />
                  <span>Accept Assignment &amp; Set Up Payout</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Register as a specialist to commit to this agreement and secure assignment.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleAccept}>
                <CardContent className="space-y-3.5 pt-4">
                  {submitError ? (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                      {submitError}
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <Label htmlFor="displayName" className="text-xs">
                      Specialist or Entity Name *
                    </Label>
                    <Input
                      id="displayName"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Devon Miller / Data Systems"
                      className="text-sm"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="payoutEmail" className="text-xs">
                      PayPal Direct Payout Email *
                    </Label>
                    <Input
                      id="payoutEmail"
                      type="email"
                      value={payoutEmail}
                      onChange={(e) => setPayoutEmail(e.target.value)}
                      placeholder="e.g. devon@example.com"
                      className="text-sm"
                      required
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Settlement releases directly to this PayPal account upon verified delivery.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="capabilities" className="text-xs">
                      Skills &amp; Capabilities (comma separated)
                    </Label>
                    <Input
                      id="capabilities"
                      value={capabilities}
                      onChange={(e) => setCapabilities(e.target.value)}
                      placeholder="e.g. python, csv, financial-analysis"
                      className="text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="bio" className="text-xs">
                      Short Bio or Portfolio Link
                    </Label>
                    <Textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Brief note on your background or specialty..."
                      rows={2}
                      className="text-sm"
                    />
                  </div>

                  <Separator />

                  <div className="flex items-start gap-2 pt-1">
                    <input
                      id="agree"
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <label htmlFor="agree" className="text-xs text-muted-foreground leading-snug cursor-pointer">
                      I accept this Work Agreement and commit to satisfying the Definition of Done.
                      I understand funds are secured via PayPal authorization hold and released upon verification.
                    </label>
                  </div>
                </CardContent>
                <CardFooter className="pt-2">
                  <Button type="submit" disabled={submitting || !agreed} className="w-full gap-2">
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    <span>{submitting ? "Securing Assignment..." : "Commit & Open Work Studio"}</span>
                  </Button>
                </CardFooter>
              </form>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center space-y-3">
                <ShieldCheck className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">
                  This invitation has already been claimed. If you have an active assignment, you can manage it in your Work Studio.
                </p>
                <Button variant="outline" onClick={() => router.push("/provider")} className="w-full">
                  Visit Work Studio
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
