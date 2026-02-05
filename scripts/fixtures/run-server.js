#!/usr/bin/env node
import { startFixtureServer } from './server.js';

const port = Number(process.env.PORT || 4173);

startFixtureServer(port).then(({ server }) => {
  console.log(`Fixture server running on http://localhost:${port}`);

  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
});
