const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { createServer } = require("node:http");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(baseUrl, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {}
    await wait(150);
  }
  throw new Error("orders-service did not become healthy in time");
}

test("orders-service health endpoint and validation guard", async () => {
  const port = String(3400 + Math.floor(Math.random() * 200));
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn("node", ["src/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: port, SERVICE_TIMEOUT_MS: "200", DATABASE_URL: "", ENVIRONMENT_NAME: "local", NODE_ENV: "test" },
    stdio: "ignore"
  });

  try {
    await waitForHealth(baseUrl);

    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    const healthJson = await health.json();
    assert.equal(healthJson.service, "orders-service");

    const invalid = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: "o-1" })
    });
    assert.equal(invalid.status, 400);
  } finally {
    child.kill("SIGTERM");
  }
});

test("inventory conflicts remain 409 while inventory server errors are persisted as downstream failures", async () => {
  const inventoryPort = String(3600 + Math.floor(Math.random() * 200));
  const ordersPort = String(3800 + Math.floor(Math.random() * 200));
  const inventoryBaseUrl = `http://127.0.0.1:${inventoryPort}`;
  const ordersBaseUrl = `http://127.0.0.1:${ordersPort}`;
  const inventory = createServer((_req, res) => {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "database_unavailable" }));
  });
  await new Promise((resolve) => inventory.listen(Number(inventoryPort), "127.0.0.1", resolve));

  const child = spawn("node", ["src/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: ordersPort,
      INVENTORY_SERVICE_URL: inventoryBaseUrl,
      SERVICE_TIMEOUT_MS: "500",
      DATABASE_URL: "",
      ENVIRONMENT_NAME: "local",
      NODE_ENV: "test"
    },
    stdio: "ignore"
  });

  try {
    await waitForHealth(ordersBaseUrl);

    const response = await fetch(`${ordersBaseUrl}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: "o-inventory-error", customerId: "c-1", sku: "s-1", quantity: 1 })
    });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).order.status, "failed_downstream");

    const persisted = await fetch(`${ordersBaseUrl}/orders/o-inventory-error`);
    assert.equal(persisted.status, 200);
    const persistedOrder = (await persisted.json()).order;
    assert.equal(persistedOrder.status, "failed_downstream");
    assert.equal(persistedOrder.timeline.at(-1).stage, "inventory_unavailable");
    assert.equal(persistedOrder.timeline.at(-1).details.status, 503);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => inventory.close(resolve));
  }
});

test("inventory reservation conflicts remain client-visible 409 responses", async () => {
  const inventoryPort = String(4000 + Math.floor(Math.random() * 200));
  const ordersPort = String(4200 + Math.floor(Math.random() * 200));
  const inventoryBaseUrl = `http://127.0.0.1:${inventoryPort}`;
  const ordersBaseUrl = `http://127.0.0.1:${ordersPort}`;
  const inventory = createServer((_req, res) => {
    res.writeHead(409, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "insufficient_inventory" }));
  });
  await new Promise((resolve) => inventory.listen(Number(inventoryPort), "127.0.0.1", resolve));

  const child = spawn("node", ["src/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: ordersPort,
      INVENTORY_SERVICE_URL: inventoryBaseUrl,
      SERVICE_TIMEOUT_MS: "500",
      DATABASE_URL: "",
      ENVIRONMENT_NAME: "local",
      NODE_ENV: "test"
    },
    stdio: "ignore"
  });

  try {
    await waitForHealth(ordersBaseUrl);

    const response = await fetch(`${ordersBaseUrl}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: "o-inventory-conflict", customerId: "c-1", sku: "s-1", quantity: 1 })
    });
    assert.equal(response.status, 409);

    const persisted = await fetch(`${ordersBaseUrl}/orders/o-inventory-conflict`);
    assert.equal(persisted.status, 200);
    assert.equal((await persisted.json()).order.status, "rejected_inventory");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => inventory.close(resolve));
  }
});
