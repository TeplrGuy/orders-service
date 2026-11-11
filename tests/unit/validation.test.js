const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidOrder } = require('../../src/validation');

test('requires all order fields and a positive integer quantity', () => {
  const valid = { orderId: 'ORD-1', customerId: 'CUST-1', sku: 'SKU-100', quantity: 1 };
  assert.equal(isValidOrder(valid), true);
  for (const invalid of [
    { ...valid, orderId: '' },
    { ...valid, customerId: '' },
    { ...valid, sku: '' },
    { ...valid, quantity: 0 },
    { ...valid, quantity: -1 },
    { ...valid, quantity: 1.5 },
    { ...valid, quantity: '1' }
  ]) {
    assert.equal(isValidOrder(invalid), false);
  }
});
