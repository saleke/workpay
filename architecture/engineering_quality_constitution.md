# WorkPay Engineering Quality Constitution

WorkPay is not a toy application, a simulated agent workflow, or a conventional MVP.

Build it as a serious economic execution system.

The implementation must pursue **world-class robustness, correctness, security, reliability, maintainability, observability, and user experience**.

The constraint is breadth, not quality.

We may intentionally support a limited number of workflows, provider types, and capabilities during the initial release. However, every capability that we do implement must be engineered to a standard appropriate for a system that may eventually control real work and real money.

## Core principle

> **Do not build the smallest system that works. Build the smallest system that expresses the complete WorkPay thesis correctly.**

The system must embody:

**Commit → Execute → Prove → Settle**

The user should be able to delegate meaningful work to WorkPay and trust that:

- the requested outcome is understood,
- the economic commitment is bounded,
- the provider is appropriately selected,
- the work is performed against explicit criteria,
- the result is supported by evidence,
- acceptance is determined according to the contract,
- payment follows successful verification,
- failures stop economic actions safely,
- and every consequential decision can be reconstructed.

## Quality hierarchy

When making engineering decisions, prioritize:

1. Financial correctness
2. Security and authorization
3. Domain correctness and invariants
4. Failure safety and recoverability
5. Auditability and provenance
6. Verification integrity
7. Reliability and concurrency correctness
8. Maintainability
9. Observability
10. User experience
11. Performance
12. Implementation convenience

Never sacrifice a higher-order property merely to simplify implementation.

## No fake sophistication

Do not create superficial versions of difficult capabilities.

Examples:

- Do not call an LLM response "verification" if no meaningful evidence is evaluated.
- Do not call a database flag "payment protection" if payment state is not safely coordinated with PayPal.
- Do not call a static provider list "provider intelligence."
- Do not call a generated summary an audit trail.
- Do not call a happy-path workflow autonomous.
- Do not simulate external state where real integration is required.
- Do not hide architectural limitations behind polished UI.

If a capability cannot yet be implemented correctly, make the boundary explicit rather than pretending it exists.

## Production-grade economic safety

Treat every payment-related operation as if the money were real.

Every economically significant action must have:

- explicit authority,
- deterministic policy evaluation,
- idempotency,
- appropriate transaction boundaries,
- auditability,
- external operation tracking,
- reconciliation behavior,
- safe retry semantics,
- failure handling,
- concurrency protection.

AI must never directly control payment execution.

The architecture must preserve:

**AI proposal → authority validation → policy validation → deterministic service → external payment system**

## Production-grade autonomy

Autonomy does not mean unrestricted access.

Agents must operate through typed actions and bounded authority.

Every consequential action should be attributable to:

- actor,
- task,
- contract/version,
- authority,
- policy evaluation,
- action,
- target resource,
- reason code,
- timestamp,
- correlation ID,
- resulting state.

The system must remain safe if:

- the model hallucinates,
- the model misinterprets instructions,
- an external document contains prompt injection,
- an agent repeats an action,
- an agent receives stale state,
- a tool fails,
- a provider behaves maliciously,
- or the model becomes unavailable.

## Production-grade verification

Verification is one of WorkPay's primary technological differentiators.

Treat it as a first-class subsystem.

Verification must be grounded in:

- contract requirements,
- acceptance rules,
- explicit verification plans,
- submitted evidence,
- artifact provenance,
- deterministic checks where possible,
- semantic checks where necessary,
- human escalation where uncertainty remains.

Verification must never silently invent new requirements.

Uncertainty must be represented explicitly.

Where verification cannot establish acceptance with sufficient confidence, the system must stop the affected economic action.

## Production-grade state management

PostgreSQL is authoritative.

Do not allow:

- browser state,
- LLM context,
- cached state,
- event payloads,
- temporary files,
- external APIs,
- or agent memory

to become accidental sources of truth.

All consequential state transitions must be represented in the domain model.

Economically significant records should be immutable or versioned.

Unknown external state must trigger reconciliation rather than assumption.

## Production-grade failure handling

Assume every external dependency can:

- timeout,
- fail,
- return malformed data,
- partially succeed,
- duplicate requests,
- return stale state,
- become unavailable,
- or disagree with WorkPay.

Design accordingly.

Every important workflow should have:

- retry semantics,
- idempotency,
- recovery state,
- timeout behavior,
- reconciliation,
- observability,
- and a safe terminal or recoverable state.

The system should fail closed around irreversible economic actions.

## Production-grade security

Treat all external content as untrusted.

This includes:

- provider submissions,
- uploaded files,
- task attachments,
- provider messages,
- web content,
- model-generated content,
- tool responses.

Defend against:

- prompt injection,
- privilege escalation,
- authorization bypass,
- horizontal access,
- payment abuse,
- malicious artifacts,
- replay attacks,
- forged webhooks,
- account compromise,
- data leakage.

Authentication is not authorization.

Authorization is not economic authority.

Economic authority is not payment execution permission.

Maintain these boundaries explicitly.

## Production-grade auditability

For every consequential decision, the system should answer:

**What happened?**

**Why did it happen?**

**Who or what caused it?**

**What authority permitted it?**

**What policy was evaluated?**

**What evidence supported it?**

**What contract version governed it?**

**What external system confirmed it?**

**What changed afterward?**

Do not store chain-of-thought.

Store structured decision provenance and sufficient evidence to reconstruct the decision.

## Production-grade UX

Complexity belongs in the system, not in the user's mental model.

The buyer should feel:

> "I delegated a job and WorkPay handled the execution."

The interface should make the following continuously obvious:

- what is happening,
- what WorkPay believes the desired outcome is,
- what has been agreed,
- what is happening to the money,
- what evidence exists,
- whether the work passed verification,
- what happens next,
- and whether the user needs to intervene.

When the system is blocked, explain:

**Why it is blocked → what is required → what the user can do.**

Do not expose internal architecture unnecessarily.

## Engineering discipline

Prefer:

- explicit domain models,
- strong types,
- schema validation,
- deterministic business rules,
- clear service boundaries,
- small composable modules,
- transactional integrity,
- comprehensive tests,
- structured errors,
- explicit state machines,
- observable workflows.

Avoid:

- clever abstractions without need,
- premature microservices,
- unnecessary infrastructure,
- generic framework layers,
- hidden side effects,
- weakly typed state,
- magic agent behavior,
- duplicated business rules,
- database access scattered throughout the application.

## Testing standard

Do not optimize for test count.

Optimize for **confidence**.

Tests must cover:

- domain invariants,
- state transitions,
- authorization,
- authority limits,
- payment safety,
- idempotency,
- concurrency,
- retries,
- external failures,
- webhook handling,
- verification correctness,
- evidence provenance,
- agent action validation,
- contract versioning,
- dispute behavior,
- recovery,
- end-to-end economic flows.

The most important tests should prove that **bad things cannot cause irreversible economic consequences**.

## Definition of done

A feature is not complete merely because it works on the happy path.

A feature is complete when its:

- domain model,
- invariants,
- persistence,
- migrations,
- authorization,
- business rules,
- external integration behavior,
- failure states,
- API,
- UI,
- observability,
- security,
- idempotency,
- auditability,
- and tests

are appropriately addressed.

## Final standard

Before accepting an implementation, ask:

> Would we trust this subsystem if it were handling real work and real money tomorrow?

If the answer is no, it is not finished.

Build WorkPay so that the prototype does not need to be thrown away when the product becomes real.

**World-class robustness is not a future phase. It is the implementation standard from the beginning.**()