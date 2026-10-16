"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
    setPlanning(true);
    setProgress(10);

    const amountMinor = Math.round(Number(budget) * 100);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      setError("Enter a budget in whole dollars.");
      setPlanning(false);
      return;
    }

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
      setError("We could not create the task. Please try again.");
      setPlanning(false);
      return;
    }

    setProgress(45);
    // Kick off planning; the task room shows progress and live updates.
    await requestPlanning(created.data.id);
    setProgress(100);
    router.push(`/tasks/${created.data.id}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold md:text-2xl">New Task</h1>
          <p className="text-sm text-muted-foreground">Tell WorkPay what you need done.</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/tasks">Cancel</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>What do you need?</CardTitle>
          <CardDescription>
            Be specific about the outcome. WorkPay will translate this into a verifiable contract.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-6" onSubmit={onSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Clean 5,000 customer records"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Task description</Label>
              <Textarea
                id="description"
                placeholder='e.g. "Clean this 5,000-row customer CSV. Remove duplicates, keep IDs, fix emails."'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                required
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="budget">Budget (USD)</Label>
                <Input
                  id="budget"
                  type="number"
                  min="1"
                  step="1"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="deadline">Deadline (optional)</Label>
                <Input
                  id="deadline"
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {planning ? (
              <div className="grid gap-2">
                <div className="text-sm text-muted-foreground">Understanding your request...</div>
                <Progress value={progress} />
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="submit" disabled={planning || !description.trim()}>
                {planning ? "Planning..." : "Plan & Draft Contract"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
