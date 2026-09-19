const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = process.env.DATABASE_URL
  ? {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  }
  : {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Erro inesperado no cliente do PostgreSQL em repouso:', err);
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
