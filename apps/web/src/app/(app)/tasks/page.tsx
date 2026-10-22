"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Lock,
  PlusCircle,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function TasksPage() {
  const { data, error, loading, reload } = useApi(() => listTasks(), []);

  const tasks = data ?? [];
  const totalBudgetMinor = tasks.reduce((sum, t) => sum + t.budgetMinor, 0);
  const completedCount = tasks.filter((t) => t.status === "COMPLETED").length;
  const inProgressCount = tasks.filter(
    (t) =>
      t.status === "WORK_IN_PROGRESS" ||
      t.status === "APPROVED" ||
      t.status === "SUBMITTED" ||
      t.status === "VERIFYING",
  ).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">My Tasks & Contracts</h1>
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
              {formatMinorMoney({ amountMinor: totalBudgetMinor, currency: "USD" })}
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
              Completed & Captured
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedCount} Task(s)</div>
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
            <div className="text-2xl font-bold">{inProgressCount} Task(s)</div>
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
          <CardHeader className="border-b border-border/60 bg-muted/20 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Active & Settled Contracts</CardTitle>
                <CardDescription>
                  Click into any task to review the live contract, proof matrices, and escrow ledger.
                </CardDescription>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground">
                {tasks.length} total
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-border/60">
                  <TableHead className="font-semibold px-6">Task Title & Outcome</TableHead>
                  <TableHead className="font-semibold">State</TableHead>
                  <TableHead className="font-semibold">Escrow Budget</TableHead>
                  <TableHead className="font-semibold">Updated</TableHead>
                  <TableHead className="text-right px-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="px-6 py-4">
                      <div className="font-medium text-foreground">{task.title}</div>
                      <div className="text-xs text-muted-foreground max-w-md truncate mt-0.5">
                        {task.rawRequest}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={taskStatusTone(task.status)}>
                        {taskStatusLabel(task.status)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="font-mono font-medium">
                      {formatMinorMoney({ amountMinor: task.budgetMinor, currency: task.currency })}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(task.updatedAt)}
                    </TableCell>
                    <TableCell className="text-right px-6">
                      <Button variant="outline" size="sm" asChild className="hover:bg-primary hover:text-primary-foreground transition-all">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
