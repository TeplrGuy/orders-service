const express = require('express');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const statusMap = {
  received: 'new_order',
  inventory_reserved: 'in_production',
  created: 'shipped',
  created_notification_pending: 'in_production',
  rejected_inventory: 'rejected',
  failed_timeout: 'rejected',
  failed_downstream: 'rejected',
  cancelled: 'cancelled',
  draft: 'draft'
};

function appendTimeline(order, stage, details = {}) {
  order.timeline.push({
    stage,
    at: new Date().toISOString(),
    details
  });
  order.updatedAt = new Date().toISOString();
}

function mapOrderForList(order) {
  const mappedStatus = statusMap[order.status] || 'draft';
  const mappedOrder = {
    orderId: order.orderId,
    orderNumber: order.orderNumber || order.orderId,
    status: mappedStatus,
    item: order.item || order.sku || 'Unknown item',
    customerName: order.customerName || order.customerId || 'Unknown customer',
    shippingService: order.shippingService || 'standard',
    createdAt: order.createdAt,
    updatedAt: order.updatedAt
  };

  if (order.trackingCode) {
    mappedOrder.trackingCode = order.trackingCode;
  }

  return mappedOrder;
}

function parsePositiveInt(value, fallback, max) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  if (max && parsed > max) {
    return null;
  }

  return parsed;
}

function applyOrderFilters(orders, query) {
  const loweredStatus = query.status ? query.status.toLowerCase() : null;
  const loweredSearch = query.search ? query.search.toLowerCase() : null;
  const loweredOrderId = query.orderId ? query.orderId.toLowerCase() : null;

  return orders.filter(order => {
    if (loweredStatus && order.status.toLowerCase() !== loweredStatus) {
      return false;
    }

    if (loweredSearch) {
      const itemMatch = order.item.toLowerCase().includes(loweredSearch);
      const customerMatch = order.customerName.toLowerCase().includes(loweredSearch);
      if (!itemMatch && !customerMatch) {
        return false;
      }
    }

    if (loweredOrderId && !order.orderId.toLowerCase().includes(loweredOrderId)) {
      return false;
    }

    return true;
  });
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

function createApp(options = {}) {
  const app = express();
  const port = options.port || process.env.PORT || 3000;
  const inventoryBaseUrl =
    options.inventoryBaseUrl ||
    process.env.INVENTORY_SERVICE_URL ||
    'http://localhost:3002';
  const notificationsBaseUrl =
    options.notificationsBaseUrl ||
    process.env.NOTIFICATIONS_SERVICE_URL ||
    'http://localhost:3003';
  const serviceTimeoutMs = Number(
    options.serviceTimeoutMs || process.env.SERVICE_TIMEOUT_MS || 3000
  );
  const ordersById = options.ordersById || new Map();

  if (Array.isArray(options.seedOrders)) {
    options.seedOrders.forEach(order => {
      ordersById.set(order.orderId, structuredClone(order));
    });
  }

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({
      service: 'orders-service',
      status: 'ok',
      environment: process.env.ENVIRONMENT_NAME || 'local'
    });
  });

  app.get('/orders', (req, res) => {
    const page = parsePositiveInt(req.query.page, DEFAULT_PAGE);
    const limit = parsePositiveInt(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);

    if (!page || !limit) {
      return res.status(400).json({
        error: 'page and limit must be positive integers, and limit must be 100 or less.'
      });
    }

    const allOrders = Array.from(ordersById.values()).map(mapOrderForList);
    const filteredOrders = applyOrderFilters(allOrders, req.query);
    const total = filteredOrders.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const pagedOrders = filteredOrders.slice(startIndex, startIndex + limit);

    return res.status(200).json({
      orders: pagedOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  });

  app.post('/orders', async (req, res) => {
    const { orderId, customerId, sku, quantity } = req.body || {};
    const correlationId = req.header('x-correlation-id') || null;
    if (!orderId || !customerId || !sku || !Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({
        error: 'orderId, customerId, sku, and positive integer quantity are required.'
      });
    }
    if (ordersById.has(orderId)) {
      return res.status(409).json({ error: 'duplicate_order_id', orderId });
    }

    const now = new Date().toISOString();
    const order = {
      orderId,
      orderNumber: req.body.orderNumber || orderId,
      customerId,
      customerName: req.body.customerName || customerId,
      sku,
      item: req.body.item || sku,
      quantity,
      shippingService: req.body.shippingService || 'standard',
      trackingCode: req.body.trackingCode || undefined,
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
      order.status =
        error && error.name === 'AbortError' ? 'failed_timeout' : 'failed_downstream';
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
      return res
        .status(404)
        .json({ error: 'order_not_found', orderId: req.params.orderId });
    }
    return res.status(200).json({ order });
  });

  return { app, port, ordersById };
}

if (require.main === module) {
  const { app, port } = createApp();
  app.listen(port, () => {
    console.log('orders-service listening on port ' + port);
  });
}

module.exports = {
  applyOrderFilters,
  createApp,
  mapOrderForList,
  parsePositiveInt
};
