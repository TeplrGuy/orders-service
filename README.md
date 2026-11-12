# orders-service

Node.js service baseline for the SDLC demo.

## Order listing

`GET /orders?page=1&limit=10&status=new_order&search=widget&orderId=demo`
returns OrderListResponse v1 from `TeplrGuy/shared-contracts#3`. All filters combine
with AND. `status` and partial `search`/`orderId` matching are case-insensitive.
Search matches SKU/customer identifier, the explicitly documented demo aliases
for `item`/`customerName`; `orderNumber` equals the order ID.

Pages start at 1; default limit is 10, maximum 100. Duplicate/nested/unknown query
parameters, unsupported statuses and text filters over 200 characters return
`400 invalid_query`. Empty/out-of-range pages return `200` with `orders: []`.
Sort is newest creation first, then ordinal order ID for ties. Pagination counts
reflect the filtered result; no persisted data or existing lifecycle is changed.

The proposed compatibility projection maps received/reserved/created/pending-
notification orders to `new_order`, and inventory rejection/downstream failures
to `rejected`. No production/shipping lifecycle is fabricated. Unknown stored
states fail explicitly. Product/human review must confirm the status mapping
before the contract alignment blocker is closed. Existing create and tracking
responses retain their lifecycle statuses.

Run `npm ci` and `npm test` for unit/service and existing integration checks.
For the real provider/gateway/contract path, run `npm run test:e2e` in the matching
`api-gateway` checkout with `ORDERS_SERVICE_PATH` and `CONTRACTS_PATH` pointing to
the feature checkouts. That test stubs only the out-of-scope inventory and
notification boundaries; it is not deployed-Azure or browser evidence.

Roll out shared-contracts, this provider, gateway, then UI consumers. Rollback
removes the new list route and callers together, preserving create/get routes.
This branch uses main's in-memory store, not the separate durable deployment
foundation. Express stays on its current major with an updated dependency lock.

