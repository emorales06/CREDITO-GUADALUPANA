import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { buildContainer } from './container.ts';
import { seedDemoRequests, seedUsers } from './db/seed.ts';

const config = loadConfig();
const container = buildContainer(config);

seedUsers(container);
if (config.seedDemoData) seedDemoRequests(container);

const interrupted = container.requests.markInterruptedBureauChecks();
if (interrupted > 0) console.warn(`[bureau] ${interrupted} consulta(s) interrumpida(s) marcadas como FALLIDO`);

const server = createApp(container).listen(config.port, () => {
  console.log(`[api] Cooperativa Guadalupana · Créditos escuchando en http://localhost:${config.port}`);
});

function shutdown(signal: string) {
  console.log(`[api] ${signal} recibido, cerrando...`);
  server.close(() => {
    container.db.close();
    process.exit(0);
  });
  server.closeAllConnections();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
