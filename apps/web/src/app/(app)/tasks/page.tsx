"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Filter,
  Lock,
  PlusCircle,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState, ErrorState, EmptyState } from "@/components/states";
import { formatMinorMoney, formatDateTime } from "@/lib/format";
import { taskStatusLabel, taskStatusTone } from "@/lib/status";
import { useApi } from "@/lib/use-api";
import { listTasks } from "@/lib/api/endpoints";
import type { TaskDto, TaskStatus } from "@/lib/api/types";

type FilterTab = "ALL" | "IN_FLIGHT" | "REVIEW" | "COMPLETED";

function TaskLifecycleBar({ status }: { status: TaskStatus }) {
  let step = 0;
  if (status === "CREATED" || status === "PLANNING" || status === "AWAITING_CLARIFICATION") {
    step = 0;
  } else if (
    status === "CONTRACT_REVIEW" ||
    status === "APPROVED" ||
    status === "PROVIDER_SEARCH" ||
    status === "NEGOTIATION" ||
    status === "AGREEMENT_READY" ||
    status === "PAYMENT_AUTHORIZATION"
  ) {
    step = 1;
  } else if (
    status === "WORK_IN_PROGRESS" ||
    status === "SUBMITTED" ||
    status === "VERIFYING" ||
    status === "REVISION_REQUIRED" ||
    status === "HUMAN_REVIEW"
  ) {
    step = 2;
  } else if (status === "PAYMENT_RELEASE" || status === "COMPLETED") {
    step = 3;
  }

  const steps = ["Plan", "Escrow", "Execution", "Settled"];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {steps.map((label, idx) => (
          <div
            key={label}
            title={`${label}: ${idx < step ? "Completed" : idx === step ? "Active" : "Upcoming"}`}
            className={`h-1.5 w-5 rounded-full transition-colors ${
              idx < step
                ? "bg-emerald-500"
                : idx === step
                  ? "bg-primary animate-pulse"
                  : "bg-muted"
            }`}
          />
        ))}
      </div>
      <span className="text-[10px] text-muted-foreground font-medium">
        Stage {step + 1}/4: {steps[step]}
      </span>
    </div>
  );
}

export default function TasksPage() {
  const { data, error, loading, reload } = useApi(() => listTasks(), []);
  const [search, setSearch] = useState("");
  const [currentTab, setCurrentTab] = useState<FilterTab>("ALL");

  const tasks = data ?? [];

  const counts = useMemo(() => {
    const total = tasks.length;
    const inFlight = tasks.filter(
      (t) =>
        t.status === "WORK_IN_PROGRESS" ||
        t.status === "APPROVED" ||
        t.status === "SUBMITTED" ||
        t.status === "VERIFYING" ||
        t.status === "PLANNING" ||
        t.status === "PROVIDER_SEARCH" ||
        t.status === "NEGOTIATION",
    ).length;
    const review = tasks.filter(
      (t) =>
        t.status === "CONTRACT_REVIEW" ||
        t.status === "REVISION_REQUIRED" ||
        t.status === "HUMAN_REVIEW" ||
        t.status === "DISPUTED" ||
        t.status === "AWAITING_CLARIFICATION",
    ).length;
    const completed = tasks.filter(
      (t) => t.status === "COMPLETED" || t.status === "PAYMENT_RELEASE",
    ).length;
    const totalBudgetMinor = tasks.reduce((sum, t) => sum + t.budgetMinor, 0);

    return { total, inFlight, review, completed, totalBudgetMinor };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let result = tasks;

    // Filter by tab
    if (currentTab === "IN_FLIGHT") {
      result = result.filter(
        (t) =>
          t.status === "WORK_IN_PROGRESS" ||
          t.status === "APPROVED" ||
          t.status === "SUBMITTED" ||
          t.status === "VERIFYING" ||
          t.status === "PLANNING" ||
          t.status === "PROVIDER_SEARCH" ||
          t.status === "NEGOTIATION",
      );
    } else if (currentTab === "REVIEW") {
      result = result.filter(
        (t) =>
          t.status === "CONTRACT_REVIEW" ||
          t.status === "REVISION_REQUIRED" ||
          t.status === "HUMAN_REVIEW" ||
          t.status === "DISPUTED" ||
          t.status === "AWAITING_CLARIFICATION",
      );
    } else if (currentTab === "COMPLETED") {
      result = result.filter(
        (t) => t.status === "COMPLETED" || t.status === "PAYMENT_RELEASE",
      );
    }

    // Filter by search query
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.rawRequest.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q),
      );
    }

    return result;
  }, [tasks, currentTab, search]);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">My Tasks &amp; Contracts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Bounded economic execution: contracts are AI-drafted, and funds are locked in PayPal escrow.
          </p>
        </div>
        <Button asChild className="shadow-sm bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium">
          <Link href="/tasks/new">
            <Sparkles className="mr-2 h-4 w-4" />
            New Escrow Task
          </Link>
        </Button>
      </div>

      {/* Metrics Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border/70 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Escrow Protected
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatMinorMoney({ amountMinor: counts.totalBudgetMinor, currency: "USD" })}
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              100% secured by PayPal Authorization holds
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Completed &amp; Captured
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.completed} Task(s)</div>
            <p className="text-xs text-muted-foreground mt-1">
              Cryptographically verified prior to release
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active In Flight
            </CardTitle>
            <Lock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.inFlight} Task(s)</div>
            <p className="text-xs text-muted-foreground mt-1">
              Funds locked under deterministic policy
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Task List Section */}
      {loading && !data ? (
        <LoadingState label="Loading your tasks & contracts..." />
      ) : error ? (
        <ErrorState
          title="Could not load tasks"
          description="The server may be starting up or unreachable. Please retry."
          onRetry={reload}
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          description="Create your first task. WorkPay will automatically draft verifiable acceptance criteria, find an optimal provider, and hold payment in PayPal escrow until proof passes."
          action={
            <Button asChild>
              <Link href="/tasks/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                Create First Task
              </Link>
            </Button>
          }
        />
      ) : (
        <Card className="border-border/80 shadow-xs overflow-hidden">
          {/* Search & Filter Header Bar */}
          <div className="border-b border-border/60 bg-muted/20 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                variant={currentTab === "ALL" ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentTab("ALL")}
                className="h-8 rounded-lg text-xs font-medium"
              >
                All ({counts.total})
              </Button>
              <Button
                variant={currentTab === "IN_FLIGHT" ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentTab("IN_FLIGHT")}
                className="h-8 rounded-lg text-xs font-medium"
              >
                In Flight ({counts.inFlight})
              </Button>
              {counts.review > 0 ? (
                <Button
                  variant={currentTab === "REVIEW" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentTab("REVIEW")}
                  className="h-8 rounded-lg text-xs font-medium"
                >
                  Needs Review ({counts.review})
                </Button>
              ) : null}
              <Button
                variant={currentTab === "COMPLETED" ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentTab("COMPLETED")}
                className="h-8 rounded-lg text-xs font-medium"
              >
                Completed ({counts.completed})
              </Button>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search tasks or intent..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-8 h-8 text-xs bg-background"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                  <span className="sr-only">Clear search</span>
                </button>
              ) : null}
            </div>
          </div>

          <CardContent className="p-0">
            {filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <Filter className="h-8 w-8 text-muted-foreground/60 mb-2" />
                <p className="text-sm font-semibold text-foreground">No tasks match your criteria</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Try clearing your search query or selecting a different status filter.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setCurrentTab("ALL");
                  }}
                  className="mt-3 text-xs"
                >
                  Reset filters
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border/60">
                    <TableHead className="font-semibold px-6">Task Title &amp; Outcome</TableHead>
                    <TableHead className="font-semibold">State</TableHead>
                    <TableHead className="font-semibold">Lifecycle</TableHead>
                    <TableHead className="font-semibold">Escrow Budget</TableHead>
                    <TableHead className="font-semibold">Updated</TableHead>
                    <TableHead className="text-right px-6">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTasks.map((task) => (
                    <TableRow key={task.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="px-6 py-4">
                        <Link href={`/tasks/${task.id}`} className="font-medium text-foreground hover:text-primary transition-colors block">
                          {task.title}
                        </Link>
                        <div className="text-xs text-muted-foreground max-w-md truncate mt-0.5">
                          {task.rawRequest}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={taskStatusTone(task.status)}>
                          {taskStatusLabel(task.status)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        <TaskLifecycleBar status={task.status} />
                      </TableCell>
                      <TableCell className="font-mono font-medium">
                        {formatMinorMoney({ amountMinor: task.budgetMinor, currency: task.currency })}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(task.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right px-6">
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="hover:bg-primary hover:text-primary-foreground transition-all shadow-2xs"
                        >
                          <Link href={`/tasks/${task.id}`} className="flex items-center gap-1">
                            <span>Task Room</span>
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
