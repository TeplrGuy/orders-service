const express = require('express');

const app = express();
const port = process.env.PORT || 3000;

app.get('/health', (_req, res) => {
  res.status(200).json({
    service: 'orders-service',
    status: 'ok',
    environment: process.env.ENVIRONMENT_NAME || 'local'
  });
});

app.listen(port, () => {
  console.log('orders-service listening on port ' + port);
});
