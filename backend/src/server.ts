import 'dotenv/config';
import http from 'http';
import app from './app';
import db from './config/db';
import { env } from './config/env';
import { createSocketIOServer, initNotificationsGateway } from './services/notifications.gateway';
import { ensureUploadDirs } from './services/upload-storage.service';

async function bootstrap(): Promise<void> {
  // ------------------------------------------------------------------
  // 1. Verify DB connectivity
  // ------------------------------------------------------------------
  try {
    await db.raw('SELECT 1');
    console.log('[DB] PostgreSQL connected successfully');
  } catch (err) {
    console.error('[DB] Failed to connect to PostgreSQL:', err);
    process.exit(1);
  }

  // ------------------------------------------------------------------
  // 2. Ensure upload sub-directories exist
  // ------------------------------------------------------------------
  ensureUploadDirs();

  // ------------------------------------------------------------------
  // 3. Create HTTP server and attach Socket.IO
  // ------------------------------------------------------------------
  const httpServer = http.createServer(app);
  const io = createSocketIOServer(httpServer);
  initNotificationsGateway(io);

  // ------------------------------------------------------------------
  // 4. Start listening
  // ------------------------------------------------------------------
  httpServer.listen(env.PORT, () => {
    console.log(`[Server] Running on port ${env.PORT} in ${env.NODE_ENV} mode`);
  });
}

bootstrap().catch((err: unknown) => {
  console.error('[Bootstrap] Unexpected error:', err);
  process.exit(1);
});
