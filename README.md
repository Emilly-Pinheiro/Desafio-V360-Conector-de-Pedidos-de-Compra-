# Desafio V360 - Conector de Pedidos de Compra

## Sobre o Projeto
Este repositório contém a solução desenvolvida para o desafio do processo seletivo da empresa V360.

A missão do projeto é construir uma camada intermediária (serviço backend com API REST) responsável por:
- Ingerir dados de pedidos de compra provenientes de diferentes clientes, cada um com suas particularidades e formatos de dados específicos.
- Normalizar todos os dados para um modelo/contrato único e padronizado.
- Entregar esses dados padronizados à plataforma V360.

Dessa forma, quando novos clientes são integrados, as diferenças de formato são absorvidas por esta camada de integração, mantendo o produto principal desacoplado e inalterado.

---

## Tecnologias e Ferramentas
- **Linguagem / Framework**: JavaScript, Node.js, Express
- **Banco de Dados & ORM**: PostgreSQL, Prisma ORM (`@prisma/client`)
- **Configuração de Ambiente**: `dotenv`
- **Desenvolvimento**: `nodemon`
- **Testes de API**: Insomnia
- **Controle de Versão**: Git / GitHub
- **Ferramentas de Apoio & IA**: Gemini e GitHub Copilot

---

## Estrutura do Projeto

```text
├── .env.example              # Modelo de variáveis de ambiente (inclui DATABASE_URL)
├── .env                      # Arquivo de configuração local (ignorado pelo git)
├── .gitignore                # Arquivos e diretórios ignorados pelo Git
├── package.json              # Dependências e scripts do projeto (start, dev, prisma:*)
├── package-lock.json
├── README.md                 # Documentação principal
├── AI_USAGE.md               # Registro de uso de Inteligência Artificial
├── prisma/
│   └── schema.prisma         # Modelos e configuração do Prisma ORM
└── src/
    ├── app.js                # Configuração do Express, middlewares e rotas
    ├── server.js             # Inicialização do servidor HTTP e teste de conexão
    └── config/
        ├── database.js       # Configuração e pool de conexões do PostgreSQL (pg)
        └── prisma.js         # Instância e cliente do Prisma ORM
```

---

## Como rodar o projeto

### Pré-requisitos
- [Node.js](https://nodejs.org/) (versão 18 ou superior)
- Gerenciador de pacotes [npm](https://www.npmjs.com/)
- [PostgreSQL](https://www.postgresql.org/) instalado e em execução

### 1. Clonar o repositório
```bash
git clone https://github.com/Emilly-Pinheiro/Desafio-V360-Conector-de-Pedidos-de-Compra-.git
cd Desafio-V360-Conector-de-Pedidos-de-Compra-
```

### 2. Instalar as dependências
```bash
npm install
```

### 3. Configurar as variáveis de ambiente
Crie o arquivo `.env` na raiz do projeto com base no `.env.example`:

- **No Windows (PowerShell):**
  ```powershell
  Copy-Item .env.example .env
  ```
- **No Linux / macOS:**
  ```bash
  cp .env.example .env
  ```

Em seguida, abra o arquivo `.env` e configure os dados de acesso ao seu PostgreSQL:
```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_NAME=desafio_v360
```

### 4. Executar a aplicação

- **Modo de desenvolvimento** (com recarregamento automático via Nodemon):
  ```bash
  npm run dev
  ```

- **Modo de produção**:
  ```bash
  npm start
  ```

### 5. Testar os endpoints
Com o servidor rodando, você pode validar o funcionamento acessando:
- **Status da API**: `GET http://localhost:3000/`
- **Health Check (conectividade com o banco via Prisma)**: `GET http://localhost:3000/health`

### 6. Comandos úteis do Prisma ORM
- **Gerar o Prisma Client**:
  ```bash
  npm run prisma:generate
  ```
- **Executar migrações pendentes no banco**:
  ```bash
  npm run prisma:migrate
  ```
- **Abrir a interface visual do Prisma Studio**:
  ```bash
  npm run prisma:studio
  ```

---

## Decisões de arquitetura e regras de negócio

Descrever aqui as principais decisões técnicas, padrões adotados e as regras de negócio implementadas.

## O que faria diferente com mais tempo

Descrever aqui melhorias, refatorações e evoluções planejadas para próximas iterações.

---

## Mudanças exigidas pelo Cliente Gama

Descrever aqui os ajustes específicos solicitados pelo Cliente Gama e seus impactos no projeto.