# Copilot Instructions for orders-service

This repository owns order creation and order status behavior for the SDLC demo.

## Load order
1. Read `.github/instructions/global-engineering-standards.md`.
2. If the task changes API behavior, service logic, or data flow, also read `.github/instructions/backend-rules.md` when present.
3. Read the GitHub issue body and follow its task-specific constraints.

## Mandatory skill bootstrap (cloud and local)
1. Read `.github/skills/skills.lock.json`.
2. Read `.github/skills/skills-manifest.json`.
3. Load at least one relevant skill contract before implementation:
   - Issue shaping/triage: `.github/skills/issue-triage/v1/SKILL.md`
   - PR analysis/review: `.github/skills/pr-review/v1/SKILL.md`
   - Test strategy: `.github/skills/test-plan/v1/SKILL.md`
   - Contract or response-shape impact: `.github/skills/contract-impact/v1/SKILL.md`
   - Incident handling: `.github/skills/incident-response/v1/SKILL.md`
4. Follow the active skill output contract (`summary`, `evidence`, `risk`, `actions`) when posting issue/PR conclusions.
5. If required skill files are missing, stop and call out the gap instead of improvising.
6. Token discipline:
   - Read minimally: issue/PR body, changed files, and referenced constraints first.
   - Do not paste long logs/files; link them and summarize in bullets.
   - Keep working summaries concise and evidence-first.

## Repo intent
- Keep business behavior here, not in `api-gateway`.
- Preserve compatibility with `shared-contracts` and upstream callers.
- Keep responses easy to consume in the demo portal and gateway.

## Architecture guardrails
- This repo is a downstream service behind `api-gateway`.
- Preserve correlation IDs and clear status transitions.
- Avoid embedding presentation-specific logic here.
- Treat contract changes as cross-repo changes requiring coordinated updates.

## Safety boundaries
- Do not introduce breaking response changes without updating the linked issue and dependent repos.
- Do not move gateway concerns into this service.
- Escalate if a requested change conflicts with the shared contract or demo narrative.

## APM-aligned operations
- Apply `.github/instructions/apm-aligned-agent-ops.md` for deterministic context loading and cost governance.
- Keep issue/PR outputs concise and evidence-first.
- Respect workflow safe-output limits and `max-ai-credits` guardrails.