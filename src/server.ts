import { buildApp } from './app.js';

const server = buildApp({
  logger: {
    level: process.env['LOG_LEVEL'] || 'info',
  },
});

const PORT = Number(process.env['PORT']) || 3000;
const HOST = process.env['HOST'] || '0.0.0.0';

async function start() {
  try {
    await server.listen({ port: PORT, host: HOST });
    console.log(`Server is running at http://${HOST}:${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
