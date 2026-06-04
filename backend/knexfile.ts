import type { Knex } from 'knex';
import * as dotenv from 'dotenv';
dotenv.config();

const result = dotenv.config();
console.log('dotenv result:', result.error);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD);
console.log('type:', typeof process.env.DB_PASSWORD);

const base: Knex.Config = {
  client: 'pg',
  connection: {
    host: process.env['DB_HOST'] || 'localhost',
    port: Number(process.env['DB_PORT'] || 5432),
    database: process.env['DB_NAME'] || 'community_db',
    user: process.env['DB_USER'] || 'postgres',
    password: process.env['DB_PASSWORD'] || '',
  },
  migrations: {
    directory: './migrations',
    extension: 'ts',
  },
  seeds: {
    directory: './seeds',
    extension: 'ts',
  },
};

const config: { [key: string]: Knex.Config } = {
  development: {
    ...base,
    pool: { min: 2, max: 10 },
  },
  production: {
    ...base,
    pool: { min: 2, max: 10 },
    connection: {
      ...(base.connection as object),
      ssl: { rejectUnauthorized: false },
    },
  },
};

export default config;
