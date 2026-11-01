import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  getCorrelationId,
  getDb,
  jsonError,
  jsonOk,
  withTransaction,
} from "@/lib/server/api";
import {
  requireProviderPrincipal,
  requireTaskOwner,
} from "@/lib/server/conversation-auth";
import { getActiveContractForTask, getTaskById } from "@workpay/shared/domain";
import { workExecutions } from "@workpay/shared/db/schema/execution";
import { events, notifications } from "@workpay/shared/db/schema/infra";
import { appendEvent } from "@workpay/shared/events";
import { newId } from "@workpay/shared/platform";
import { conflict, notFound } from "@workpay/shared/platform";
import type { AuditCheckinDto, TaskAuditStatusDto } from "@/lib/api/types";

const submitAuditCheckinSchema = z.object({
  status: z.enum(["ON_TRACK", "MILESTONE_DRAFT", "BLOCKED"]),
  notes: z.string().trim().max(1000).optional(),
  percentComplete: z.number().min(0).max(100).optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: taskId } = await params;
    await requireTaskOwner(req, taskId);
    const db = getDb();
    const task = await getTaskById(db, taskId);

    if (!task) {
      throw notFound("Task");
    }

    const activeContract = await getActiveContractForTask(db, taskId);
    const deadline = activeContract?.deadline ?? task.desiredDeadline ?? null;
    const createdAt = activeContract?.createdAt ?? task.createdAt;

    let timeRemainingHours: number | null = null;
    let burnDownPercentage = 25;
    let phase: TaskAuditStatusDto["phase"] = "KICKOFF";
    let isPastDeadline = false;

    if (deadline) {
      const now = Date.now();
      const deadlineMs = deadline.getTime();
      const createdMs = createdAt.getTime();
      const totalDuration = Math.max(1000, deadlineMs - createdMs);
      const elapsed = Math.max(0, now - createdMs);

      burnDownPercentage = Math.min(100, Math.max(0, Math.round((elapsed / totalDuration) * 100)));
      timeRemainingHours = Math.round((deadlineMs - now) / (1000 * 60 * 60));
      isPastDeadline = now > deadlineMs;

      if (burnDownPercentage < 25) {
        phase = "KICKOFF";
      } else if (burnDownPercentage < 60) {
        phase = "PROGRESS_AUDIT";
      } else if (burnDownPercentage < 85) {
        phase = "CRITICAL_PATH";
      } else {
        phase = "FINAL_COUNTDOWN";
      }
    }

    const auditRows = await db
      .select()
      .from(events)
      .where(and(eq(events.taskId, taskId), eq(events.type, "AUDIT_CHECKIN_SUBMITTED")))
      .orderBy(desc(events.occurredAt))
      .limit(10);

    const checkins: AuditCheckinDto[] = auditRows.map((ev) => {
      const p = (ev.payload ?? {}) as Record<string, unknown>;
      return {
        id: ev.id,
        taskId,
        executionId: String(p.executionId ?? ""),
        status: (p.status as "ON_TRACK" | "MILESTONE_DRAFT" | "BLOCKED") ?? "ON_TRACK",
        notes: typeof p.notes === "string" ? p.notes : null,
        percentComplete: typeof p.percentComplete === "number" ? p.percentComplete : null,
        createdAt: ev.occurredAt.toISOString(),
      };
    });

    const latestCheckin = checkins[0] ?? null;

    let riskLevel: TaskAuditStatusDto["riskLevel"] = "LOW";
    if (isPastDeadline) {
      riskLevel = "OVERDUE";
    } else if (latestCheckin?.status === "BLOCKED") {
      riskLevel = "ATTENTION";
    } else if (burnDownPercentage > 75 && checkins.length === 0) {
      riskLevel = "ATTENTION";
    }

    const dto: TaskAuditStatusDto = {
      taskId,
      deadline: deadline ? deadline.toISOString() : null,
      timeRemainingHours,
      burnDownPercentage,
      phase,
      riskLevel,
      latestCheckin,
      checkins,
    };

    return jsonOk(dto);
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: taskId } = await params;
    const body = await req.json();
    const parsed = submitAuditCheckinSchema.parse(body);
    const correlationId = getCorrelationId(req);
    const { actor, provider } = await requireProviderPrincipal(req);
    const db = getDb();

    const task = await getTaskById(db, taskId);
    if (!task) {
      throw notFound("Task");
    }

    const [execution] = await db
      .select()
      .from(workExecutions)
      .where(
        and(eq(workExecutions.taskId, taskId), eq(workExecutions.providerId, provider.id)),
      )
      .limit(1);

    if (!execution) {
      throw conflict("No active specialist assignment exists for this task.");
    }

    const checkinId = newId("notif");

    await withTransaction(async (tx) => {
      await appendEvent(tx, {
        type: "AUDIT_CHECKIN_SUBMITTED",
        aggregateId: execution.id,
        taskId,
        actor: { type: "PROVIDER", id: actor.id as string },
        correlationId,
        payload: {
          taskId,
          executionId: execution.id,
          status: parsed.status,
          notes: parsed.notes,
          percentComplete: parsed.percentComplete,
        },
      });

      const statusText =
        parsed.status === "ON_TRACK"
          ? "on track"
          : parsed.status === "MILESTONE_DRAFT"
            ? "working on a draft milestone"
            : "blocked and needs guidance";

      const statusLabel =
        parsed.status === "ON_TRACK"
          ? "On track"
          : parsed.status === "MILESTONE_DRAFT"
            ? "Draft milestone ready"
            : "Assistance needed";

      await tx.insert(notifications).values({
        id: newId("notif"),
        userId: task.userId,
        taskId: task.id,
        eventId: checkinId,
        type: "AUDIT_CHECKIN_SUBMITTED",
        title: `Specialist update: ${statusLabel}`,
        body: `Specialist reported ${statusText} on "${task.title}": ${parsed.notes ?? "No extra notes."}`,
        href: `/tasks/${task.id}`,
      });
    });

    const checkinDto: AuditCheckinDto = {
      id: checkinId,
      taskId,
      executionId: execution.id,
      status: parsed.status,
      notes: parsed.notes ?? null,
      percentComplete: parsed.percentComplete ?? null,
      createdAt: new Date().toISOString(),
    };

    return jsonOk(checkinDto);
  } catch (err) {
    return jsonError(err);
  }
}
