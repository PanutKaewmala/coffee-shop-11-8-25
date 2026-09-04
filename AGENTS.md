# TALVO Agent Operating Contract

## Objective

Develop TALVO as an outcome-oriented operating system for coffee shops: understand what is happening in the shop and help the owner keep operations correct with less attention and decision load.

Features are implementation details. Prefer measurable operational outcomes over adding surface area.

## Definition of done for implementation work

A task is not done when code is written. It is done when all of the following are true:

1. The requested outcome and acceptance criteria are satisfied.
2. The change stays within the requested scope.
3. Relevant existing behavior has been inspected before modification.
4. Lint passes.
5. Type checking passes.
6. Relevant automated tests pass.
7. The app builds successfully when the change can affect production build behavior.
8. Relevant browser/UI flows are exercised when user-facing behavior changes.
9. Browser console and relevant network failures are checked when UI behavior changes.
10. Any regression discovered during validation is fixed or explicitly reported as unresolved.
11. The final summary lists changed behavior, validation performed, and remaining risks.

## Required development loop

For every non-trivial task, work in this order:

1. Restate the desired outcome and observable definition of done.
2. Inspect the relevant code, data model, tests, and existing behavior.
3. Question requirements that appear unnecessary, contradictory, unsafe, or solution-shaped.
4. Delete unnecessary scope before adding anything.
5. Choose the smallest implementation that satisfies the real requirement.
6. Make the change.
7. Run the narrowest relevant checks first.
8. Run repository-level verification before completion when practical.
9. For user-facing work, run the app and test the affected flow in a browser.
10. Inspect console/network state if the browser flow is involved.
11. Fix failures and repeat validation until green.
12. Summarize what changed, what was tested, and what remains uncertain.

Do not stop after producing a plan when the task requests implementation.

## Repository commands

Use the repository scripts rather than inventing parallel commands.

- Install: `npm install`
- Dev server: `npm run dev`
- Lint: `npm run lint`
- Type check: `npm run typecheck`
- Static/behavior test suite: `npm test`
- Production build: `npm run build`
- Full local verification: `npm run verify`

Run narrower named `test:*` scripts first when only one business flow is affected.

## Architecture and scope rules

- Read before editing. Preserve established patterns unless there is evidence they are the problem.
- Do not introduce a new framework, abstraction, dependency, service, state layer, or database concept unless the task requires it and the benefit clearly exceeds the added complexity.
- Do not refactor unrelated code while implementing a scoped change.
- Do not change product behavior outside the stated acceptance criteria without calling it out first.
- Prefer vertical slices that can be validated end-to-end.
- Treat dashboards, reports, and UI as means to an operational outcome, not outcomes by themselves.

## TALVO data and environment safety

This repository uses Supabase and contains protected staging workflows.

- Never treat production as a test environment.
- Never run destructive or mutating production operations for validation.
- Preserve existing protected staging gates, exact-SHA checks, rollback protections, and environment restrictions unless the explicit task is to change them.
- Do not weaken RLS, authorization, idempotency, auditability, tenant isolation, or post-close protection to make a test pass.
- Database changes require an explicit migration and relevant contract/integration validation.
- If credentials or required environment variables are unavailable, report the blocked validation rather than fabricating a pass.

## Testing expectations

Choose tests by risk, not by habit.

At minimum:

- Pure logic change: lint + typecheck + relevant tests.
- API/database/business-rule change: lint + typecheck + relevant contract/integration tests + build when applicable.
- UI interaction change: lint + typecheck + relevant tests + browser flow + console/network inspection.
- Cross-cutting or high-risk change: `npm run verify` plus targeted runtime validation.

When a bug is found, add or strengthen a regression test when the failure can be reproduced deterministically.

## Browser validation

For user-facing changes, validate the actual workflow rather than only checking that a page renders.

Examples include:

- navigation and role access
- POS interaction and checkout
- order review/cancellation
- stock operations
- cash movement
- Daily Close and post-close guards

Record the exact flow tested and whether any console or network errors remain.

## Completion report

End implementation work with a compact report containing:

- Outcome delivered
- Files/areas changed
- Validation run and results
- Browser flow tested, if applicable
- Known risks or unresolved assumptions
- Single recommended next step
