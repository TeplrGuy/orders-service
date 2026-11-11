require('./telemetry');
const express = require('express');
const { isValidOrder } = require('./validation');
const { createStore } = require('./store');

const app = express();
const port = process.env.PORT || 3000;
const inventoryBaseUrl = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3002';
const notificationsBaseUrl = process.env.NOTIFICATIONS_SERVICE_URL || 'http://localhost:3003';
const serviceTimeoutMs = Number(process.env.SERVICE_TIMEOUT_MS || 3000);
let store;

app.use(express.json());

function appendTimeline(order, stage, details = {}) {
  order.timeline.push({
    stage,
    at: new Date().toISOString(),
    details
  });
  order.updatedAt = new Date().toISOString();
}

async function postWithTimeout(url, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

app.get('/health', async (_req, res) => {
  try {
    await store.check();
    res.status(200).json({
      service: 'orders-service',
      status: 'ok',
      environment: process.env.ENVIRONMENT_NAME || 'local'
    });
  } catch (error) {
    console.error('orders-service health check failed', error);
    res.status(503).json({ service: 'orders-service', status: 'unavailable' });
  }
});

app.post('/orders', async (req, res, next) => {
  const { orderId, customerId, sku, quantity } = req.body || {};
  const correlationId = req.header('x-correlation-id') || null;
  if (!isValidOrder({ orderId, customerId, sku, quantity })) {
    return res.status(400).json({ error: 'orderId, customerId, sku, and positive integer quantity are required.' });
  }
  const now = new Date().toISOString();
  const order = {
    orderId,
    customerId,
    sku,
    quantity,
    correlationId,
    createdAt: now,
    updatedAt: now,
    status: 'received',
    timeline: [
      {
        stage: 'received',
        at: now,
        details: {}
      }
    ]
  };

  try {
    if (!await store.create(order)) {
      return res.status(409).json({ error: 'duplicate_order_id', orderId });
    }
    let reservationResponse;
    try {
      reservationResponse = await postWithTimeout(
        `${inventoryBaseUrl}/inventory/reserve`,
        { reservationId: orderId, sku, quantity },
        serviceTimeoutMs
      );
    } catch (error) {
      order.status = error && error.name === 'AbortError' ? 'failed_timeout' : 'failed_downstream';
      appendTimeline(order, order.status, {});
      await store.save(order);
      return error && error.name === 'AbortError'
        ? res.status(504).json({ error: 'downstream_timeout', order })
        : res.status(502).json({ error: 'downstream_unavailable', order });
    }

    if (!reservationResponse.ok) {
      const reservationError = await reservationResponse.json().catch(() => ({}));
      order.status = 'rejected_inventory';
      appendTimeline(order, 'inventory_rejected', reservationError);
      await store.save(order);
      return res.status(409).json({
        error: 'inventory_reservation_failed',
        details: reservationError,
        order
      });
    }

    order.status = 'inventory_reserved';
    appendTimeline(order, 'inventory_reserved', { sku, quantity });
    await store.save(order);

    const event = {
      orderId,
      customerId,
      sku,
      quantity,
      correlationId,
      status: 'created',
      createdAt: new Date().toISOString()
    };

    const notifyResponse = await postWithTimeout(
      `${notificationsBaseUrl}/notifications/order-created`,
      event,
      serviceTimeoutMs
    ).catch(() => null);

    if (notifyResponse && notifyResponse.ok) {
      order.status = 'created';
      appendTimeline(order, 'notification_accepted', {});
    } else {
      order.status = 'created_notification_pending';
      appendTimeline(order, 'notification_pending', {});
    }

    await store.save(order);

    return res.status(201).json({
      order
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/orders/:orderId', async (req, res, next) => {
  try {
    const order = await store.get(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: 'order_not_found', orderId: req.params.orderId });
    }
    return res.status(200).json({ order });
  } catch (error) {
    return next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error('orders-service request failed', error);
  res.status(500).json({ error: 'internal_error' });
});

createStore().then((createdStore) => {
  store = createdStore;
  app.listen(port, () => console.log('orders-service listening on port ' + port));
}).catch((error) => {
  console.error('orders-service startup failed', error);
  process.exitCode = 1;
});
