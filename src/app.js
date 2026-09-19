const express = require('express');
const { pool } = require('./config/database');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rota raiz para status simples
app.get('/', (req, res) => {
  res.json({
    message: 'API do Conector de Pedidos de Compra V360 em execução.',
    status: 'online',
  });
});

// Rota de Health Check verificando a conexão com o PostgreSQL
app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    return res.status(200).json({
      status: 'healthy',
      database: 'connected',
      timestamp: result.rows[0].now,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message,
    });
  }
});

module.exports = app;
