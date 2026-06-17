# Copilot Instructions for orders-service

This repository owns order creation and order status behavior for the SDLC demo.

## Load order
1. Read `.github/instructions/global-engineering-standards.md`.
2. If the task changes API behavior, service logic, or data flow, also read `.github/instructions/backend-rules.md` when present.
3. Read the GitHub issue body and follow its task-specific constraints.

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
