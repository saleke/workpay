"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, ShieldCheck, UserPlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";

interface InviteSpecialistCardProps {
  taskId: string;
  isAssigned?: boolean;
}

export function InviteSpecialistCard({ taskId, isAssigned }: InviteSpecialistCardProps) {
  const [copied, setCopied] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setInviteUrl(`${window.location.origin}/invite/${taskId}`);
    }
  }, [taskId]);

  const copyToClipboard = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success("Invitation link copied to clipboard!");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for older browsers
      const input = document.createElement("input");
      input.value = inviteUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      toast.success("Invitation link copied to clipboard!");
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <Card className="border-border/70 shadow-xs bg-gradient-to-br from-card to-primary/5">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <CardTitle className="text-base font-semibold">
              Invite External Specialist
            </CardTitle>
          </div>
          {isAssigned ? (
            <StatusBadge tone="success">Specialist Assigned</StatusBadge>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
              Open for Commitment
            </span>
          )}
        </div>
        <CardDescription className="text-xs sm:text-sm">
          Found an eligible candidate on GitHub, open-source repositories, or email? Share this direct, authenticated agreement link. They can review the immutable Definition of Done, register their PayPal payout account, and secure PayPal authorization hold on acceptance.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={inviteUrl}
            className="font-mono text-xs bg-muted/40 selection:bg-primary/20"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyToClipboard}
            className="shrink-0 gap-1.5 font-medium"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-500" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span>Copy Link</span>
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            asChild
            className="shrink-0 gap-1.5"
          >
            <a href={`/invite/${taskId}`} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">Preview</span>
            </a>
          </Button>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
          <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
          <span>
            External invitees are automatically onboarded into Work Studio with full identity verification and PayPal payout routing.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
