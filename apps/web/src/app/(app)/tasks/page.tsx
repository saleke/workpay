"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Filter,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { formatMinorMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { listTasks } from "@/lib/api/endpoints";
import type { TaskDto } from "@/lib/api/types";

export default function TasksPage() {
  const { data, loading } = useApi(() => listTasks(), [], "tasks");
  const tasks = data ?? [];

  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"ALL" | "ATTENTION" | "IN_PROGRESS" | "COMPLETED">("ALL");

  const filteredTasks = useMemo(() => {
    let list = tasks;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.rawRequest.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q),
      );
    }

    if (filterTab === "ATTENTION") {
      list = list.filter(
        (t) =>
          t.status === "CONTRACT_REVIEW" ||
          t.status === "HUMAN_REVIEW" ||
          t.status === "REVISION_REQUIRED" ||
          t.status === "AWAITING_CLARIFICATION" ||
          t.status === "AGREEMENT_READY",
      );
    } else if (filterTab === "IN_PROGRESS") {
      list = list.filter(
        (t) =>
          t.status !== "COMPLETED" &&
          t.status !== "PAYMENT_RELEASE" &&
          t.status !== "CANCELLED" &&
          t.status !== "CONTRACT_REVIEW" &&
          t.status !== "HUMAN_REVIEW" &&
          t.status !== "REVISION_REQUIRED",
      );
    } else if (filterTab === "COMPLETED") {
      list = list.filter((t) => t.status === "COMPLETED" || t.status === "PAYMENT_RELEASE");
    }

    return list;
  }, [tasks, searchQuery, filterTab]);

  const attentionCount = useMemo(() => {
    return tasks.filter(
      (t) =>
        t.status === "CONTRACT_REVIEW" ||
        t.status === "HUMAN_REVIEW" ||
        t.status === "REVISION_REQUIRED" ||
        t.status === "AWAITING_CLARIFICATION" ||
        t.status === "AGREEMENT_READY",
    ).length;
  }, [tasks]);

  if (loading && tasks.length === 0) {
    return (
      <div className="py-20 text-center text-sm text-[var(--text-muted)]">
        Opening task register...
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="py-20 text-center max-w-md mx-auto">
        <Sparkles className="h-8 w-8 text-[var(--amber)] mx-auto mb-3" />
        <h1 className="text-xl font-semibold tracking-tight text-[var(--charcoal)]">
          No tasks created yet
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1.5">
          Describe the outcome you need accomplished. WorkPay drafts explicit acceptance criteria, matches a specialist, and reserves funds via PayPal authorization hold until proven.
        </p>
        <div className="mt-6">
          <Link
            href="/tasks/new"
            className="inline-flex items-center gap-1.5 bg-[var(--charcoal)] text-white hover:bg-black px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Create first task</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-4 border-b border-[var(--border-subtle)] pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--charcoal)]">
            Task Register
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            All active, review-pending, and settled contracts. Verified proof dictates release.
          </p>
        </div>

        <Link
          href="/tasks/new"
          className="inline-flex items-center gap-1.5 bg-[var(--charcoal)] text-white hover:bg-black px-4 py-2 rounded-xl text-sm font-medium transition-colors self-start sm:self-auto shadow-xs"
        >
          <Plus className="h-4 w-4" />
          <span>New task</span>
        </Link>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm font-medium">
          <button
            type="button"
            onClick={() => setFilterTab("ALL")}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filterTab === "ALL"
                ? "bg-[var(--surface-subtle)] text-[var(--charcoal)] font-semibold border border-[var(--border-strong)]"
                : "text-[var(--text-muted)] hover:text-[var(--charcoal)]"
            }`}
          >
            All tasks ({tasks.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("ATTENTION")}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              filterTab === "ATTENTION"
                ? "bg-amber-100 text-amber-900 font-semibold border border-amber-300"
                : "text-[var(--text-muted)] hover:text-[var(--charcoal)]"
            }`}
          >
            <span>Needs Attention</span>
            {attentionCount > 0 && (
              <span className="h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                {attentionCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("IN_PROGRESS")}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filterTab === "IN_PROGRESS"
                ? "bg-[var(--surface-subtle)] text-[var(--charcoal)] font-semibold border border-[var(--border-strong)]"
                : "text-[var(--text-muted)] hover:text-[var(--charcoal)]"
            }`}
          >
            In Progress
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("COMPLETED")}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filterTab === "COMPLETED"
                ? "bg-[var(--surface-subtle)] text-[var(--charcoal)] font-semibold border border-[var(--border-strong)]"
                : "text-[var(--text-muted)] hover:text-[var(--charcoal)]"
            }`}
          >
            Settled
          </button>
        </div>

        {/* Search Input */}
        <div className="relative sm:w-64">
          <Search className="h-4 w-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-xs sm:text-sm text-[var(--charcoal)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--charcoal)] focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* 3. Task Cards List */}
      {filteredTasks.length === 0 ? (
        <div className="workpay-card p-12 text-center text-sm text-[var(--text-muted)]">
          No tasks found matching your filters.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => {
            const isCompleted = task.status === "COMPLETED" || task.status === "PAYMENT_RELEASE";
            const isAttention =
              task.status === "CONTRACT_REVIEW" ||
              task.status === "HUMAN_REVIEW" ||
              task.status === "REVISION_REQUIRED" ||
              task.status === "AWAITING_CLARIFICATION" ||
              task.status === "AGREEMENT_READY";

            const moneyStr = formatMinorMoney({
              amountMinor: task.budgetMinor,
              currency: task.currency,
            });

            let statusBadge = "bg-blue-50 text-blue-700";
            let statusLabel = "In Execution";

            switch (task.status) {
              case "DRAFT":
                statusBadge = "bg-stone-100 text-stone-700";
                statusLabel = "Draft";
                break;
              case "CREATED":
              case "PLANNING":
                statusBadge = "bg-blue-50 text-blue-700";
                statusLabel = "Drafting Specification";
                break;
              case "AWAITING_CLARIFICATION":
                statusBadge = "bg-amber-100 text-amber-800";
                statusLabel = "Clarification Needed";
                break;
              case "CONTRACT_REVIEW":
              case "AGREEMENT_READY":
                statusBadge = "bg-amber-100 text-amber-800";
                statusLabel = "Awaiting Sign-off";
                break;
              case "APPROVED":
              case "PROVIDER_SEARCH":
                statusBadge = "bg-indigo-50 text-indigo-700";
                statusLabel = "Matching Specialist";
                break;
              case "NEGOTIATION":
                statusBadge = "bg-indigo-50 text-indigo-700";
                statusLabel = "Negotiating Terms";
                break;
              case "PAYMENT_AUTHORIZATION":
                statusBadge = "bg-amber-50 text-amber-700";
                statusLabel = "Authorizing Payment";
                break;
              case "WORK_IN_PROGRESS":
                statusBadge = "bg-blue-50 text-blue-700";
                statusLabel = "In Execution";
                break;
              case "SUBMITTED":
              case "VERIFYING":
                statusBadge = "bg-purple-50 text-purple-700";
                statusLabel = "Verifying Proof";
                break;
              case "REVISION_REQUIRED":
                statusBadge = "bg-rose-50 text-rose-700";
                statusLabel = "Revision Requested";
                break;
              case "HUMAN_REVIEW":
                statusBadge = "bg-amber-100 text-amber-800";
                statusLabel = "In Arbitration";
                break;
              case "PAYMENT_RELEASE":
              case "COMPLETED":
                statusBadge = "bg-emerald-50 text-emerald-700";
                statusLabel = "Settled";
                break;
              case "CANCELLED":
              case "EXPIRED":
                statusBadge = "bg-gray-100 text-gray-600";
                statusLabel = "Closed";
                break;
              case "DISPUTED":
                statusBadge = "bg-rose-100 text-rose-800";
                statusLabel = "Disputed";
                break;
            }

            return (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                className={`workpay-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-[var(--charcoal)] transition-all group ${
                  isAttention ? "border-amber-200 bg-amber-50/20" : ""
                }`}
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusBadge}`}>
                      {statusLabel}
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-[var(--charcoal)] group-hover:text-[var(--blue)] transition-colors">
                    {task.title}
                  </h3>

                  <p className="text-xs text-[var(--text-muted)] line-clamp-1 max-w-2xl">
                    {task.rawRequest}
                  </p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-6 sm:border-l sm:border-[var(--border-subtle)] sm:pl-6 shrink-0">
                  <div className="text-right">
                    <div className="text-base font-bold text-[var(--charcoal)]">{moneyStr}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {isCompleted ? "Paid upon proof" : "PayPal Authorization Hold"}
                    </div>
                  </div>

                  <div className="h-8 w-8 rounded-lg bg-[var(--surface-subtle)] flex items-center justify-center text-[var(--text-muted)] group-hover:bg-[var(--charcoal)] group-hover:text-white transition-colors">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
