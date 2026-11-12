const test = require('node:test');
const assert = require('node:assert/strict');
const { listOrders } = require('../../src/order-list');
const order = (orderId, status = 'created', sku = 'Widget', customerId = 'Customer-A') => ({
  orderId, status, sku, customerId,
  createdAt: '2026-11-12T00:00:00Z', updatedAt: '2026-11-12T00:00:00Z'
});
const orders = [order('b'), order('a'), order('c', 'rejected_inventory', 'Gear', 'Customer-B')];

test('paginates deterministically and preserves the lifecycle records', () => {
  const result = listOrders(orders, { page: '2', limit: '1' });
  assert.equal(result.orders[0].orderId, 'b');
  assert.deepEqual(result.pagination, { page: 2, limit: 1, total: 3, totalPages: 3 });
  assert.equal(orders[0].status, 'created');
  assert.equal(listOrders(orders, { page: '8' }).orders.length, 0);
  assert.deepEqual(listOrders([], {}).pagination, { page: 1, limit: 10, total: 0, totalPages: 0 });
});

test('combines case-insensitive API status, item/customer and partial ID filters', () => {
  assert.equal(listOrders(orders, { status: 'NEW_ORDER', search: 'wIDG', orderId: 'A' }).orders[0].orderId, 'a');
  assert.equal(listOrders(orders, { search: 'customer-b' }).orders[0].orderId, 'c');
  assert.equal(listOrders(orders, { status: 'rejected', search: 'widget' }).orders.length, 0);
});

test('explicitly maps every existing lifecycle and rejects unmapped states', () => {
  for (const status of ['received', 'inventory_reserved', 'created', 'created_notification_pending']) {
    assert.equal(listOrders([order('a', status)], {}).orders[0].status, 'new_order');
  }
  for (const status of ['rejected_inventory', 'failed_timeout', 'failed_downstream']) {
    assert.equal(listOrders([order('a', status)], {}).orders[0].status, 'rejected');
  }
  assert.throws(() => listOrders([order('a', 'unknown')], {}), /cannot be projected/);
});

test('rejects malformed, duplicate, nested and unsupported query parameters', () => {
  for (const query of [
    { page: '0' }, { page: '-1' }, { page: '1.2' }, { page: '1e2' }, { page: '' },
    { page: '9007199254740991', limit: '100' }, { limit: '101' },
    { limit: '0' }, { limit: 'Infinity' }, { status: 'pending' }, { status: '' },
    { status: ['new_order', 'rejected'] }, { page: { value: '1' } },
    { search: 'x'.repeat(201) }, { orderId: 'x'.repeat(201) }, { unexpected: 'x' }
  ]) {
    assert.throws(() => listOrders(orders, query), RangeError, JSON.stringify(query));
  }
});
