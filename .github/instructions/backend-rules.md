# Backend Rules for orders-service

These rules apply when changing service behavior, order lifecycle logic, downstream calls, or response shapes.

## Current stack
- Node + Express service in `src/index.js`.
- In-memory order state using `Map`.
- Downstream calls to inventory and notifications services.

## Service design rules
- Keep order domain behavior in this repo.
- Preserve the timeline-based order model; status changes should remain observable through timeline entries.
- Validate inputs early and return clear, specific failures.
- Use additive changes to the order payload unless an issue explicitly approves a breaking change.

## Downstream interaction rules
- Use timeout-aware downstream calls.
- Keep failure modes explicit (`timeout`, `unavailable`, `rejected_inventory`, `notification_pending`).
- Preserve correlation IDs through requests and stored order records.

## API rules
- `/health`, `POST /orders`, and `GET /orders/:orderId` are the core surface today.
- New endpoints should support the demo storyline or a linked issue, not speculative future scope.
- Error payloads should stay machine-readable and useful in the portal and gateway.

## Data rules
- Keep the in-memory implementation simple unless an issue explicitly moves persistence forward.
- If persistence is introduced later, preserve the current visible order lifecycle behavior for the demo.

## Testing and evidence
- Behavior changes should be covered by service-level tests.
- Cross-repo effects must be called out in the issue and reflected in dependent repos when needed.
