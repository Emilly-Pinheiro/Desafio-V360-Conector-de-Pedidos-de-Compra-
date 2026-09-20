const express = require('express');
const prisma = require('./config/prisma');

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

// Rota de Health Check verificando a conexão com o PostgreSQL via Prisma
app.get('/health', async (req, res) => {
  try {
    const result = await prisma.$queryRaw`SELECT NOW()`;
    return res.status(200).json({
      status: 'healthy',
      database: 'connected',
      orm: 'prisma',
      timestamp: result[0].now,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      orm: 'prisma',
      error: error.message,
    });
  }
});

// Rotas de Pedidos e Ingestão
const orderRoutes = require('./routes/orderRoutes');
app.use('/api/orders', orderRoutes);

// Rotas de Conferência de Notas Fiscais
const invoiceRoutes = require('./routes/invoiceRoutes');
app.use('/api/invoice', invoiceRoutes);

module.exports = app;
