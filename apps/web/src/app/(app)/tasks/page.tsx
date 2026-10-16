"use client";

import Link from "next/link";
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
import { PlusCircle } from "lucide-react";
import { formatMinorMoney, formatDateTime } from "@/lib/format";
import { taskStatusLabel, taskStatusTone } from "@/lib/status";
import { useApi } from "@/lib/use-api";
import { listTasks } from "@/lib/api/endpoints";

export default function TasksPage() {
  const { data, error, loading, reload } = useApi(() => listTasks(), []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold md:text-2xl">My Tasks</h1>
          <p className="text-sm text-muted-foreground">Tasks you created or are working on.</p>
        </div>
        <Button asChild>
          <Link href="/tasks/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Task
          </Link>
        </Button>
      </div>

      {loading && !data ? (
        <LoadingState label="Loading your tasks..." />
      ) : error ? (
        <ErrorState
          title="We could not load your tasks"
          description="Please check your connection and try again."
          onRetry={reload}
        />
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          description="Create your first task and WorkPay will plan it, find someone, and protect your payment until the work is verified."
          action={
            <Button asChild>
              <Link href="/tasks/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                New Task
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Tasks</CardTitle>
            <CardDescription>{data.length} task(s).</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium">{task.title}</TableCell>
                    <TableCell>
                      <StatusBadge tone={taskStatusTone(task.status)}>
                        {taskStatusLabel(task.status)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      {formatMinorMoney({ amountMinor: task.budgetMinor, currency: task.currency })}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(task.updatedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/tasks/${task.id}`}>Open</Link>
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
