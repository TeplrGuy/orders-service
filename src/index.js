const express = require('express');

const app = express();
const port = process.env.PORT || 3000;
const inventoryBaseUrl = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3002';
const notificationsBaseUrl = process.env.NOTIFICATIONS_SERVICE_URL || 'http://localhost:3003';
const serviceTimeoutMs = Number(process.env.SERVICE_TIMEOUT_MS || 3000);
const ordersById = new Map();

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

app.get('/health', (_req, res) => {
  res.status(200).json({
    service: 'orders-service',
    status: 'ok',
    environment: process.env.ENVIRONMENT_NAME || 'local'
  });
});

app.post('/orders', async (req, res) => {
  const { orderId, customerId, sku, quantity } = req.body || {};
  const correlationId = req.header('x-correlation-id') || null;
  if (!orderId || !customerId || !sku || !Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'orderId, customerId, sku, and positive integer quantity are required.' });
  }
  if (ordersById.has(orderId)) {
    return res.status(409).json({ error: 'duplicate_order_id', orderId });
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
    const reservationResponse = await postWithTimeout(
      `${inventoryBaseUrl}/inventory/reserve`,
      { reservationId: orderId, sku, quantity },
      serviceTimeoutMs
    );

    if (!reservationResponse.ok) {
      const reservationError = await reservationResponse.json().catch(() => ({}));
      order.status = 'rejected_inventory';
      appendTimeline(order, 'inventory_rejected', reservationError);
      ordersById.set(orderId, order);
      return res.status(409).json({
        error: 'inventory_reservation_failed',
        details: reservationError,
        order
      });
    }

    order.status = 'inventory_reserved';
    appendTimeline(order, 'inventory_reserved', { sku, quantity });

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

    ordersById.set(orderId, order);

    return res.status(201).json({
      order
    });
  } catch (error) {
    order.status = error && error.name === 'AbortError' ? 'failed_timeout' : 'failed_downstream';
    appendTimeline(order, order.status, {});
    ordersById.set(orderId, order);
    if (error && error.name === 'AbortError') {
      return res.status(504).json({ error: 'downstream_timeout', order });
    }
    return res.status(502).json({ error: 'downstream_unavailable', order });
  }
});

app.get('/orders/:orderId', (req, res) => {
  const order = ordersById.get(req.params.orderId);
  if (!order) {
    return res.status(404).json({ error: 'order_not_found', orderId: req.params.orderId });
  }
  return res.status(200).json({ order });
});

app.listen(port, () => {
  console.log('orders-service listening on port ' + port);
});
