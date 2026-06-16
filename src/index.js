const express = require('express');

const app = express();
const port = process.env.PORT || 3000;
const inventoryBaseUrl = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3002';
const notificationsBaseUrl = process.env.NOTIFICATIONS_SERVICE_URL || 'http://localhost:3003';
const serviceTimeoutMs = Number(process.env.SERVICE_TIMEOUT_MS || 3000);

app.use(express.json());

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
  if (!orderId || !customerId || !sku || !Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'orderId, customerId, sku, and positive integer quantity are required.' });
  }

  try {
    const reservationResponse = await postWithTimeout(
      `${inventoryBaseUrl}/inventory/reserve`,
      { reservationId: orderId, sku, quantity },
      serviceTimeoutMs
    );

    if (!reservationResponse.ok) {
      const reservationError = await reservationResponse.json().catch(() => ({}));
      return res.status(409).json({
        error: 'inventory_reservation_failed',
        details: reservationError
      });
    }

    const event = {
      orderId,
      customerId,
      createdAt: new Date().toISOString()
    };

    await postWithTimeout(`${notificationsBaseUrl}/notifications/order-created`, event, serviceTimeoutMs).catch(() => null);

    return res.status(201).json({
      status: 'created',
      orderId,
      customerId,
      sku,
      quantity
    });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      return res.status(504).json({ error: 'downstream_timeout' });
    }
    return res.status(502).json({ error: 'downstream_unavailable' });
  }
});

app.listen(port, () => {
  console.log('orders-service listening on port ' + port);
});
