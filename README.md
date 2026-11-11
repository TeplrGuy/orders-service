# orders-service

Node.js service baseline for the SDLC demo.

Set `DATABASE_URL` to a PostgreSQL connection string for durable order state.
The database user needs permission to create the service table. Without a
connection string the service uses in-memory state only when running locally;
`NODE_ENV=production` or a non-local `ENVIRONMENT_NAME` requires PostgreSQL.
Configure TLS and credentials through the connection settings; do not commit
credentials. An order left in an intermediate state after a crash currently
requires investigation and is not automatically retried.

The Docker build uses the public npm registry by default. Where a trusted
registry mirror is required, set `NPM_CONFIG_REGISTRY` as a Docker build
argument. Do not put credentials in the registry URL or build arguments.

