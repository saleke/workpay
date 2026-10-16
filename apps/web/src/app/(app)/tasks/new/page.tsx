"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";

export default function NewTaskPage() {
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("150");
  const [deadline, setDeadline] = useState("");
  const [planning, setPlanning] = useState(false);
  const [progress, setProgress] = useState(0);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlanning(true);
    setProgress(10);
    // Simulate planning progress for now (real flow will call B's plan endpoint once ready)
    const t = setInterval(() => {
      setProgress((p) => Math.min(p + 30, 90));
    }, 500);
    setTimeout(() => {
      clearInterval(t);
      setProgress(100);
      setPlanning(false);
    }, 2000);
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
              <Label htmlFor="description">Task description</Label>
              <Textarea
                id="description"
                placeholder='e.g. "Clean this 5,000-row customer CSV. Budget $150."'
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
                <Label htmlFor="deadline">Deadline (UTC)</Label>
                <Input
                  id="deadline"
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
            </div>
            {planning ? (
              <div className="grid gap-2">
                <div className="text-sm text-muted-foreground">AI planning...</div>
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
