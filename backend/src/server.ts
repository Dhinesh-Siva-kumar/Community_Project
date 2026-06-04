import 'dotenv/config';
import http from 'http';
import path from 'path';
import fs from 'fs';
import app from './app';
import db from './config/db';
import { env } from './config/env';
import { createSocketIOServer, initNotificationsGateway } from './services/notifications.gateway';

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
  const uploadsBase = path.resolve(env.UPLOADS_PATH);
  for (const dir of ['profiles', 'resumes', 'certificates', 'videos']) {
    const full = path.join(uploadsBase, dir);
    if (!fs.existsSync(full)) {
      fs.mkdirSync(full, { recursive: true });
    }
    // Create .gitkeep placeholder
    const keep = path.join(full, '.gitkeep');
    if (!fs.existsSync(keep)) {
      fs.writeFileSync(keep, '');
    }
  }

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
