function isValidOrder({ orderId, customerId, sku, quantity } = {}) {
  return Boolean(orderId && customerId && sku && Number.isInteger(quantity) && quantity > 0);
}

module.exports = { isValidOrder };
