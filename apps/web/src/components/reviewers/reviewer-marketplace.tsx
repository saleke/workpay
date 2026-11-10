"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import { formatMinorMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { getTaskReviewerRecommendations } from "@/lib/api/endpoints";

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\s+/g, "-");
}

export function ReviewerMarketplace({ taskId }: { taskId?: string }) {
  const [domainDraft, setDomainDraft] = useState("");
  const [additionalDomains, setAdditionalDomains] = useState<string[]>([]);
  const [domainError, setDomainError] = useState<string | null>(null);
  const recommendations = useApi(
    () =>
      taskId
        ? getTaskReviewerRecommendations(taskId, additionalDomains)
        : Promise.resolve({ data: null, error: null }),
    [taskId, additionalDomains],
  );

  const addDomains = () => {
    const domains = domainDraft.split(",").map(normalizeDomain).filter(Boolean);
    if (domains.some((domain) => domain.length > 128)) {
      setDomainError("Each review domain must be 128 characters or fewer.");
      return;
    }
    const nextDomains = [...new Set([...additionalDomains, ...domains])];
    if (nextDomains.length > 20) {
      setDomainError("Choose no more than 20 review domains.");
      return;
    }
    setAdditionalDomains(nextDomains);
    setDomainError(null);
    setDomainDraft("");
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2 border-b border-[var(--border-subtle)] pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Independent review
        </p>
        <h1 className="text-2xl font-semibold text-[var(--charcoal)]">Find a reviewer</h1>
        <p className="max-w-3xl text-sm text-[var(--text-muted)]">
          Compare review domains, methods, turnaround, fee, and supporting experience.
        </p>
        <Link
          href="/settings?tab=work-preferences&section=reviews"
          className="inline-flex text-sm font-medium underline"
        >
          Set up paid reviews in Work Profile
        </Link>
      </header>

      {!taskId ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Start with a task</CardTitle>
            <CardDescription>
              Reviewer suggestions are matched to an approved task scope. Choose a task first so the
              review criteria and evidence can be shown in context.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 border-t bg-muted/20 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-sm text-muted-foreground">
              Opening a task will not contact or engage a reviewer. You choose whether to proceed.
            </p>
            <Link
              href="/tasks"
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--charcoal)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black"
            >
              Choose a task
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Task-specific reviewer suggestions</CardTitle>
              <CardDescription>
                Review domains are your choice. Suggested task tags are not binding criteria.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="grid gap-1 text-sm">
                <span>Add review domains to match</span>
                <input
                  value={domainDraft}
                  onChange={(event) => setDomainDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addDomains();
                    }
                  }}
                  placeholder="For example: accessibility, financial analysis"
                  className="h-10 rounded-lg border border-[var(--border-subtle)] px-3 text-sm"
                  aria-label="Additional review domains, separated by commas"
                />
              </label>
              <Button type="button" className="self-end" onClick={addDomains}>
                Add domains
              </Button>
              {domainError ? (
                <p role="alert" className="text-sm text-red-700 sm:col-span-2">
                  {domainError}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {recommendations.loading && !recommendations.data ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Finding relevant reviewers…
            </p>
          ) : recommendations.error ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              Could not load reviewer suggestions. Please try again.
            </p>
          ) : recommendations.data ? (
            <section className="space-y-4" aria-live="polite">
              <p className="text-sm text-muted-foreground">{recommendations.data.reason}</p>
              {recommendations.data.suggestedDomains.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Suggested by the task plan — choose which domains to use:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {recommendations.data.suggestedDomains.map((domain) => {
                      const selected = additionalDomains.includes(domain);
                      return (
                        <button
                          key={domain}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            setAdditionalDomains((current) =>
                              selected
                                ? current.filter((value) => value !== domain)
                                : current.length < 20
                                  ? [...current, domain]
                                  : current,
                            );
                            setDomainError(
                              !selected && additionalDomains.length >= 20
                                ? "Choose no more than 20 review domains."
                                : null,
                            );
                          }}
                          className={`rounded-full border px-3 py-1 text-xs ${
                            selected
                              ? "border-[var(--charcoal)] bg-[var(--charcoal)] text-white"
                              : "border-[var(--border-subtle)] bg-white text-[var(--charcoal)]"
                          }`}
                        >
                          {domain}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {recommendations.data.requiredDomains.length > 0 ? (
                <div className="flex flex-wrap gap-2" aria-label="Selected review domains">
                  {recommendations.data.requiredDomains.map((domain) => (
                    <button
                      key={domain}
                      type="button"
                      aria-label={`Remove ${domain} review domain`}
                      onClick={() => {
                        setAdditionalDomains((current) =>
                          current.filter((value) => value !== domain),
                        );
                        setDomainError(null);
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-2.5 py-1 text-xs"
                    >
                      {domain}
                      <span aria-hidden="true">×</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {recommendations.data.recommendations.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-sm text-muted-foreground">
                    No matching reviewers are listed yet. That is not evidence that the task cannot
                    be reviewed; you can add a domain or return later.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {recommendations.data.recommendations.map((reviewer) => (
                    <Card key={reviewer.userId}>
                      <CardHeader>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <CardTitle className="text-base">{reviewer.displayName}</CardTitle>
                            {reviewer.username ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                @{reviewer.username}
                              </p>
                            ) : null}
                          </div>
                          {reviewer.feeMinor !== null ? (
                            <Badge variant="outline">
                              Indicative fee{" "}
                              {formatMinorMoney({
                                amountMinor: reviewer.feeMinor,
                                currency: reviewer.currency,
                              })}
                            </Badge>
                          ) : (
                            <Badge variant="outline">Fee not listed</Badge>
                          )}
                        </div>
                        <CardDescription>{reviewer.summary}</CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-4 text-sm">
                        <div className="flex flex-wrap gap-2">
                          {reviewer.matchedDomains.map((domain) => (
                            <Badge key={domain} variant="secondary">
                              {domain}
                            </Badge>
                          ))}
                          {reviewer.languages.map((language) => (
                            <Badge key={language} variant="outline">
                              {language}
                            </Badge>
                          ))}
                          {reviewer.typicalTurnaroundDays ? (
                            <Badge variant="outline">
                              Typically {reviewer.typicalTurnaroundDays} day(s)
                            </Badge>
                          ) : null}
                          <Badge variant="outline">
                            {reviewer.feeMode === "PAYPAL" ? "PayPal fee" : "Direct fee"}
                          </Badge>
                        </div>

                        <div className="space-y-3">
                          {reviewer.matchingExpertise.map((expertise) => (
                            <div key={expertise.domainTag} className="rounded-lg border p-3">
                              <div className="font-medium">{expertise.domainTag}</div>
                              <p className="mt-1 text-muted-foreground">{expertise.scope}</p>
                              <p className="mt-2 text-xs text-muted-foreground">
                                {expertise.yearsExperience === null
                                  ? "Experience duration not stated"
                                  : `${expertise.yearsExperience} year(s) experience, self-reported`}
                              </p>
                            </div>
                          ))}
                        </div>

                        <div>
                          <h2 className="font-medium">Profile evidence</h2>
                          {reviewer.evidence.length > 0 ? (
                            <ul className="mt-2 space-y-2">
                              {reviewer.evidence.map((item) => (
                                <li
                                  key={item.id}
                                  className="rounded-lg bg-[var(--surface-subtle)] p-3"
                                >
                                  <div className="font-medium">
                                    {item.title} · {item.kind.toLowerCase()}
                                  </div>
                                  <p className="mt-1 text-muted-foreground">{item.description}</p>
                                  {item.issuer ? (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      Issuer: {item.issuer}
                                    </p>
                                  ) : null}
                                  {item.url ? (
                                    <a
                                      href={item.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="mt-1 inline-block text-xs underline"
                                    >
                                      Open supporting link
                                    </a>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1 text-muted-foreground">
                              No supporting evidence supplied.
                            </p>
                          )}
                        </div>
                        {reviewer.publicContactUrl ? (
                          <a
                            href={reviewer.publicContactUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex w-fit items-center rounded-lg bg-[var(--charcoal)] px-3 py-2 text-sm font-medium text-white"
                          >
                            Contact reviewer directly
                          </a>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            No public contact channel supplied.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
