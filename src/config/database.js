const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'desafio_v360',
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Erro inesperado no cliente do PostgreSQL em repouso:', err);
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
