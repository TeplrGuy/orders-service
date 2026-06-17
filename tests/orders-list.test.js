const assert = require('node:assert/strict');
const test = require('node:test');

const { createApp } = require('../src/index');

function createSeedOrder({
  orderId,
  orderNumber,
  status,
  item,
  customerName,
  shippingService = 'standard',
  trackingCode
}) {
  return {
    orderId,
    orderNumber,
    status,
    item,
    customerName,
    shippingService,
    trackingCode,
    customerId: customerName,
    sku: item,
    quantity: 1,
    correlationId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    timeline: []
  };
}

async function startTestServer(seedOrders) {
  const { app } = createApp({ seedOrders });
  const server = await new Promise(resolve => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    async close() {
      await new Promise((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}

test('GET /orders returns paginated mapped orders without filters', async () => {
  const seedOrders = [
    createSeedOrder({
      orderId: 'ORD-100',
      orderNumber: 'ORD-100',
      status: 'received',
      item: 'Widget A',
      customerName: 'Alice Smith'
    }),
    createSeedOrder({
      orderId: 'ORD-101',
      orderNumber: 'ORD-101',
      status: 'created',
      item: 'Widget B',
      customerName: 'Bob Jones',
      trackingCode: 'TRACK-101'
    })
  ];
  const server = await startTestServer(seedOrders);

  try {
    const response = await fetch(`${server.baseUrl}/orders`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.orders.length, 2);
    assert.equal(payload.orders[0].status, 'new_order');
    assert.equal(payload.orders[1].status, 'shipped');
    assert.deepEqual(payload.pagination, {
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1
    });
  } finally {
    await server.close();
  }
});

test('GET /orders applies status, search, and orderId filters case-insensitively', async () => {
  const seedOrders = [
    createSeedOrder({
      orderId: 'ORD-200',
      orderNumber: 'ORD-200',
      status: 'inventory_reserved',
      item: 'Widget Alpha',
      customerName: 'Alice Smith'
    }),
    createSeedOrder({
      orderId: 'ORD-201',
      orderNumber: 'ORD-201',
      status: 'created',
      item: 'Widget Beta',
      customerName: 'Brian Stone'
    })
  ];
  const server = await startTestServer(seedOrders);

  try {
    const statusResponse = await fetch(`${server.baseUrl}/orders?status=IN_PRODUCTION`);
    const statusPayload = await statusResponse.json();
    assert.equal(statusPayload.orders.length, 1);
    assert.equal(statusPayload.orders[0].orderId, 'ORD-200');

    const searchResponse = await fetch(`${server.baseUrl}/orders?search=stone`);
    const searchPayload = await searchResponse.json();
    assert.equal(searchPayload.orders.length, 1);
    assert.equal(searchPayload.orders[0].orderId, 'ORD-201');

    const orderIdResponse = await fetch(`${server.baseUrl}/orders?orderId=200`);
    const orderIdPayload = await orderIdResponse.json();
    assert.equal(orderIdPayload.orders.length, 1);
    assert.equal(orderIdPayload.orders[0].orderId, 'ORD-200');
  } finally {
    await server.close();
  }
});

test('GET /orders paginates and returns empty arrays when there are no matches', async () => {
  const seedOrders = Array.from({ length: 11 }, (_, index) =>
    createSeedOrder({
      orderId: `ORD-${index + 1}`,
      orderNumber: `ORD-${index + 1}`,
      status: 'received',
      item: `Widget ${index + 1}`,
      customerName: `Customer ${index + 1}`
    })
  );
  const server = await startTestServer(seedOrders);

  try {
    const pageResponse = await fetch(`${server.baseUrl}/orders?page=2&limit=5`);
    const pagePayload = await pageResponse.json();
    assert.equal(pagePayload.orders.length, 5);
    assert.equal(pagePayload.pagination.total, 11);
    assert.equal(pagePayload.pagination.totalPages, 3);

    const emptyResponse = await fetch(`${server.baseUrl}/orders?search=not-found`);
    const emptyPayload = await emptyResponse.json();
    assert.equal(emptyResponse.status, 200);
    assert.equal(emptyPayload.orders.length, 0);
    assert.equal(emptyPayload.pagination.total, 0);
    assert.equal(emptyPayload.pagination.totalPages, 0);
  } finally {
    await server.close();
  }
});

test('GET /orders rejects invalid pagination values', async () => {
  const server = await startTestServer([]);

  try {
    const response = await fetch(`${server.baseUrl}/orders?page=0&limit=ten`);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(payload.error, /page and limit/i);
  } finally {
    await server.close();
  }
});
