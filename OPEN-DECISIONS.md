# OPEN-DECISIONS

Per `architecture/ENGINEERING_PLAN.md` section 0: when a doc is ambiguous or
conflicts, log one line and resolve within 24h; unresolved decisions default to
the safest option (fail closed). This file is a working log, not an
architecture document.

| Date | Doc ref | Question | Decision | Who |
|------|---------|----------|----------|-----|
| 2026-10-16 | ENGINEERING_PLAN §5.3.5, §6.1 (R4) | The Zod → OpenAPI → client-types pipeline does not exist yet. The plan forbids hand-written client types, but B's frontend needs typed API responses now. | Treat `apps/web/src/lib/api/types.ts` as a temporary, clearly-labelled mirror of the domain vocabulary. Build the generation pipeline before B's frontend work lands in `main`; replace the mirror with generated types at that point. | B |
| 2026-10-16 | ENGINEERING_PLAN Appendix C | The Task Room needs an aggregate read (task, active contract, work spec, provider selection, execution, cases) in one call. No single listed endpoint returns this. | Propose a B-owned read endpoint `GET /api/v1/tasks/{id}/task-room` that composes A's exported read functions (`getTaskById`, `getActiveContractForTask`, `getPaymentForTask`) with B's own reads. Appendix B permits cross-owner reads via exported functions. A to confirm the path. | B |
| 2026-10-26 | ENGINEERING_PLAN §§1-2, 4-8, 10, Appendices A, C-D; Component 19 §§35-36; UI/UX brief §§1-2, 5-8, 16-18 | How should the frozen dataset-cleaning demo and automatic provider-selection lifecycle change for the product direction approved in this session? | Product direction is now general-purpose, AI-assisted task intake with user-confirmed intent and budget. After intake is complete, show candidates for the user to choose; contact only the selected professional and only after explicit user approval. Selection must not silently negotiate, accept terms, authorize payment, or initiate contact. Keep communication/change-management and completion-review redesign as later phases. The execution plan and related product briefs have been rebaselined as drafts; engineering review and endpoint containment before rollout remain required. Preserve existing payment, authorization, audit, and AI-provenance safeguards unless deliberately revised. | Product owner direction; engineering review pending |
