import knex from 'knex';
import pg from 'pg';
import { env } from './env';

// Prevent PostgreSQL DATE columns from being hydrated as JS Date objects.
pg.types.setTypeParser(1082, (val: string) => val);

const db = knex({
  client: 'pg',
  connection: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  },
  pool: { min: 2, max: 10 },
});

export default db;
