"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  DollarSign,
  FileCode,
  Lock,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { createTask, requestPlanning } from "@/lib/api/endpoints";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `key-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const PRESET_BUDGETS = ["50", "150", "300", "750", "1500"];

export default function NewTaskPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("150");
  const [deadline, setDeadline] = useState("");
  const [planning, setPlanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amountMinor = Math.round(Number(budget) * 100);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      const err = "Please enter a valid budget in whole dollars.";
      setError(err);
      toast.error(err);
      return;
    }

    setPlanning(true);
    setProgress(15);

    try {
      const created = await createTask(
        {
          title: title.trim() || description.trim().slice(0, 80) || "Untitled task",
          rawRequest: description.trim(),
          budgetMinor: amountMinor,
          currency: "USD",
          desiredDeadline: deadline ? new Date(deadline).toISOString() : null,
        },
        newIdempotencyKey(),
      );

      if (created.error || !created.data) {
        const msg =
          typeof created.error === "string"
            ? created.error
            : created.error?.message ?? "We could not create the task. Please try again.";
        setError(msg);
        toast.error(msg);
        setPlanning(false);
        return;
      }

      setProgress(50);
      toast.success("Task created! Initializing autonomous planner...");

      // Kick off planning
      await requestPlanning(created.data.id);
      setProgress(100);

      toast.success("Autonomous planner initiated successfully.");
      router.push(`/tasks/${created.data.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
      toast.error(msg);
      setPlanning(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {/* Breadcrumb Navigation & Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="h-9 w-9 rounded-xl">
            <Link href="/tasks">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back to tasks</span>
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Link href="/tasks" className="hover:underline">
                Tasks
              </Link>
              <span>/</span>
              <span className="text-foreground font-medium">New Escrow Assignment</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl mt-0.5">
              Create New Escrow Task
            </h1>
          </div>
        </div>
      </div>

      <Card className="border-border/80 shadow-xs overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-primary" />
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold text-foreground">Task Objective & Outcome</CardTitle>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-900">
              <Lock className="h-3 w-3" />
              <span>PayPal Authorization Guarded</span>
            </div>
          </div>
          <CardDescription className="text-sm leading-relaxed">
            State your desired outcome in natural language. WorkPay will synthesize an immutable Definition of Done, structure verifiable acceptance criteria, and lock funds safely in PayPal escrow until delivery passes verification.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form className="grid gap-6" onSubmit={onSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Task Title (Optional)
              </Label>
              <Input
                id="title"
                placeholder="e.g. Clean 5,000 customer records or Build OAuth2 login route"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="font-medium"
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="description" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Task Specification & Intent
                </Label>
                <span className="text-xs text-muted-foreground">Required</span>
              </div>
              <Textarea
                id="description"
                placeholder="Describe exactly what needs to be achieved, required format, constraints, and success criteria.
Example: 'Write an idempotent API handler for user onboarding with schema validation, Drizzle ORM transactions, and unit test coverage above 90%.'"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                required
                className="leading-relaxed resize-y"
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {/* Budget input with quick presets */}
              <div className="grid gap-2">
                <Label htmlFor="budget" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Escrow Budget Ceiling (USD)
                </Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="budget"
                    type="number"
                    min="1"
                    step="1"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="pl-8 font-mono font-semibold"
                  />
                </div>
                {/* Budget quick preset chips */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-muted-foreground mr-1">Presets:</span>
                  {PRESET_BUDGETS.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setBudget(amount)}
                      className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                        budget === amount
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 hover:bg-muted text-muted-foreground border-border/60"
                      }`}
                    >
                      ${amount}
                    </button>
                  ))}
                </div>
              </div>

              {/* Deadline input */}
              <div className="grid gap-2">
                <Label htmlFor="deadline" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Target Deadline (Optional)
                </Label>
                <div className="relative">
                  <Input
                    id="deadline"
                    type="datetime-local"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Sets audit check-in frequency and deadline burn-down timers.
                </p>
              </div>
            </div>

            {error ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            ) : null}

            {planning ? (
              <div className="grid gap-2 rounded-xl border border-primary/20 bg-primary/5 p-4 animate-in fade-in">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-primary flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 animate-spin" />
                    Autonomous Planner Synthesizing Contract...
                  </span>
                  <span className="font-mono font-semibold">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
                <p className="text-[11px] text-muted-foreground">
                  Translating your raw intent into acceptance criteria and cryptographic contract hashes.
                </p>
              </div>
            ) : null}

            <div className="flex items-center justify-between pt-2 border-t border-border/60">
              <Button variant="ghost" asChild type="button">
                <Link href="/tasks">Cancel</Link>
              </Button>
              <Button
                type="submit"
                disabled={planning || !description.trim()}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-sm px-6"
              >
                {planning ? (
                  <>
                    <Sparkles className="mr-2 h-4 w-4 animate-spin" />
                    Drafting Contract...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Plan &amp; Draft Contract
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
