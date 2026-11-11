"use client";

import { Check, ChevronDown, FileCheck2 } from "lucide-react";
import type { ConversationContractSnapshotDto } from "@/lib/api/types";

function acceptanceMethodLabel(method: string): string {
  if (method === "DETERMINISTIC") return "Objective check";
  if (method === "SEMANTIC") return "Requirement review";
  return "Client or agreed reviewer";
}

function fieldLabel(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fieldValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(fieldValue).join(", ");
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

export function WorkProposalTerms({
  terms,
  contractVersion,
  onReviewed,
}: {
  terms: ConversationContractSnapshotDto;
  contractVersion: number;
  onReviewed?: () => void;
}) {
  return (
    <details
      className="group overflow-hidden rounded-xl border border-slate-200 bg-white"
      onToggle={(event) => {
        if (event.currentTarget.open) onReviewed?.();
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-xs font-semibold text-slate-800 marker:hidden">
        <span className="inline-flex items-center gap-2">
          <FileCheck2 className="h-4 w-4 text-indigo-600" /> Review exact work terms
        </span>
        <span className="inline-flex items-center gap-2 text-[10px] font-medium text-slate-500">
          Scope v{contractVersion}
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="space-y-4 border-t border-slate-200 bg-slate-50/70 px-4 py-4 text-xs text-slate-700">
        <div>
          <p className="font-semibold text-slate-950">Outcome</p>
          <p className="mt-1 leading-5">{terms.summary}</p>
        </div>
        <div>
          <p className="font-semibold text-slate-950">Requirements</p>
          <ul className="mt-2 space-y-1.5">
            {terms.requirements.map((requirement) => (
              <li key={requirement.key} className="flex gap-2 leading-5">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
                <span>{requirement.statement}</span>
              </li>
            ))}
          </ul>
        </div>
        {terms.included.length > 0 ? (
          <div>
            <p className="font-semibold text-slate-950">Included</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 leading-5">
              {terms.included.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {terms.excluded.length > 0 ? (
          <div>
            <p className="font-semibold text-slate-950">Not included</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 leading-5">
              {terms.excluded.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {terms.acceptanceRules.length > 0 ? (
          <div>
            <p className="font-semibold text-slate-950">How acceptance will be reviewed</p>
            <ul className="mt-2 space-y-1.5 leading-5">
              {terms.acceptanceRules.map((rule) => {
                const requirement = terms.requirements.find(
                  (item) => item.key === rule.requirementKey,
                );
                return (
                  <li
                    key={`${rule.requirementKey}:${rule.method}`}
                    className="rounded-lg border border-slate-200 bg-white p-2.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="font-medium">
                        {requirement?.statement ?? rule.requirementKey}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {acceptanceMethodLabel(rule.method)}
                      </span>
                    </div>
                    {rule.instructions ? (
                      <p className="mt-1.5 text-slate-600">{rule.instructions}</p>
                    ) : null}
                    {rule.params && Object.keys(rule.params).length > 0 ? (
                      <dl className="mt-2 grid gap-1 border-t border-slate-100 pt-2 text-[11px] sm:grid-cols-2">
                        {Object.entries(rule.params).map(([key, value]) => (
                          <div key={key} className="flex gap-1.5">
                            <dt className="font-medium text-slate-500">{fieldLabel(key)}:</dt>
                            <dd className="break-words text-slate-700">{fieldValue(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}
