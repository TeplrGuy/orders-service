function createMemoryStore() {
  const orders = new Map();
  return {
    async check() {},
    async close() {},
    async create(order) {
      if (orders.has(order.orderId)) return false;
      orders.set(order.orderId, structuredClone(order));
      return true;
    },
    async save(order) {
      if (!orders.has(order.orderId)) throw new Error('Order disappeared before update');
      orders.set(order.orderId, structuredClone(order));
    },
    async get(orderId) {
      const order = orders.get(orderId);
      return order ? structuredClone(order) : null;
    }
  };
}

async function createPostgresStore(connectionString) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString });
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('orders-service schema'))");
    await client.query(`CREATE TABLE IF NOT EXISTS orders (
      order_id text PRIMARY KEY, payload jsonb NOT NULL
    )`);
    await client.query('COMMIT');
  } catch (error) {
    try {
      if (client) await client.query('ROLLBACK');
    } finally {
      if (client) client.release();
      await pool.end();
    }
    throw error;
  }
  client.release();
  return {
    async check() { await pool.query('SELECT 1'); },
    async close() { await pool.end(); },
    async create(order) {
      const result = await pool.query(
        'INSERT INTO orders (order_id, payload) VALUES ($1, $2::jsonb) ON CONFLICT DO NOTHING RETURNING order_id',
        [order.orderId, JSON.stringify(order)]
      );
      return result.rowCount === 1;
    },
    async save(order) {
      const result = await pool.query('UPDATE orders SET payload = $2::jsonb WHERE order_id = $1', [
        order.orderId, JSON.stringify(order)
      ]);
      if (result.rowCount !== 1) throw new Error('Order disappeared before update');
    },
    async get(orderId) {
      const result = await pool.query('SELECT payload FROM orders WHERE order_id = $1', [orderId]);
      return result.rows[0]?.payload ?? null;
    }
  };
}

async function createStore() {
  if (process.env.DATABASE_URL) return createPostgresStore(process.env.DATABASE_URL);
  if (process.env.NODE_ENV === 'production' || (process.env.ENVIRONMENT_NAME && process.env.ENVIRONMENT_NAME !== 'local')) {
    throw new Error('DATABASE_URL is required outside the local environment');
  }
  return createMemoryStore();
}

module.exports = { createStore };
