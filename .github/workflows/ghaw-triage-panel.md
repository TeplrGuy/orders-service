---
on:
  issues:
    types: [opened, edited, reopened, labeled]

permissions:
  contents: read
  issues: read
  pull-requests: read

engine: copilot
tracker-id: orders-triage-panel-v1
max-ai-credits: 3

safe-outputs:
  add-comment:
    max: 1
  create-issue:
    title-prefix: "[orders-split] "
    labels: [automation, triage-generated]
    max: 2
---

# Orders Service Triage Panel

Act as a triage panel for incoming issues.

For each issue:
1. Classify type (bug/enhancement/incident/question).
2. Determine scope (orders-only or cross-service with contracts/inventory/notifications).
3. Recommend owner model:
   - single local owner
   - local owner + delegated cloud-agent slice
4. List required quality gates for this issue (CI/security/functional checks/load test when needed).

Output:
- One concise triage comment:
  - Triage result
  - Scope
  - Owner model
  - Required gates
  - Evidence expected at PR time

If scope is clearly split-able, create up to two follow-up task issues.
