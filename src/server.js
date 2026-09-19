require('dotenv').config();
const app = require('./app');
const prisma = require('./config/prisma');

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  // Testa a conexão com o banco de dados PostgreSQL via Prisma
  try {
    await prisma.$connect();
    console.log(' Conexão com o banco de dados PostgreSQL via Prisma estabelecida com sucesso!');
  } catch (err) {
    console.warn(' Atenção: Não foi possível conectar ao PostgreSQL via Prisma neste momento.');
    console.warn(` Detalhes do erro: ${err.message}`);
    console.warn(' O servidor continuará em execução para rotas sem acesso ao banco.');
  }

  app.listen(PORT, () => {
    console.log(` Servidor rodando na porta ${PORT}`);
    console.log(` Acesse: http://localhost:${PORT}`);
  });
};

startServer();
