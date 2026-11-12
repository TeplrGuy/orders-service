const statuses = new Set(['new_order', 'in_production', 'shipped', 'cancelled', 'rejected', 'draft']);
const lifecycleStatuses = new Map([
  ['received', 'new_order'],
  ['inventory_reserved', 'new_order'],
  ['created', 'new_order'],
  ['created_notification_pending', 'new_order'],
  ['rejected_inventory', 'rejected'],
  ['failed_timeout', 'rejected'],
  ['failed_downstream', 'rejected']
]);

function parseListQuery(query) {
  for (const [key, value] of Object.entries(query)) {
    if (!['page', 'limit', 'status', 'search', 'orderId'].includes(key) || typeof value !== 'string') {
      throw new RangeError('Only single-valued page, limit, status, search and orderId parameters are supported.');
    }
  }
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 10 : Number(query.limit);
  if ((query.page !== undefined && !/^[1-9]\d*$/.test(query.page)) ||
      (query.limit !== undefined && !/^[1-9]\d*$/.test(query.limit)) ||
      !Number.isSafeInteger(page) || !Number.isSafeInteger(limit) ||
      limit > 100 || !Number.isSafeInteger((page - 1) * limit)) {
    throw new RangeError('page must be a positive safe integer and limit must be between 1 and 100.');
  }
  const status = query.status?.toLowerCase();
  if (status !== undefined && !statuses.has(status)) {
    throw new RangeError('status must be an Order v1 API status, not a UI display label.');
  }
  if ((query.search?.length || 0) > 200 || (query.orderId?.length || 0) > 200) {
    throw new RangeError('search and orderId must contain at most 200 characters.');
  }
  return {
    page, limit, status,
    search: query.search?.toLowerCase() || '',
    orderId: query.orderId?.toLowerCase() || ''
  };
}

function projectOrder(order) {
  const status = lifecycleStatuses.get(order.status);
  if (!status || ['orderId', 'customerId', 'sku', 'createdAt', 'updatedAt']
    .some(field => typeof order[field] !== 'string' || !order[field])) {
    throw new Error('Stored order cannot be projected to Order v1.');
  }
  return {
    orderId: order.orderId,
    orderNumber: order.orderId,
    status,
    item: order.sku,
    customerName: order.customerId,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt
  };
}

function listOrders(orders, query) {
  const { page, limit, status, search, orderId } = parseListQuery(query);
  const matching = Array.from(orders, projectOrder).filter(order =>
    (!status || order.status === status) &&
    (!search || order.item.toLowerCase().includes(search) || order.customerName.toLowerCase().includes(search)) &&
    (!orderId || order.orderId.toLowerCase().includes(orderId))
  );
  matching.sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt) ||
    (a.orderId < b.orderId ? -1 : a.orderId > b.orderId ? 1 : 0)
  );
  return {
    orders: matching.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total: matching.length, totalPages: Math.ceil(matching.length / limit) }
  };
}

module.exports = { listOrders };
