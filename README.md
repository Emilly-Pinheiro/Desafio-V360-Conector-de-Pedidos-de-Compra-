# Desafio V360 - Conector de Pedidos de Compra

Este repositório contém a solução do desafio técnico da **V360** para a posição de **Engenharia de Integrações**.

A missão é construir uma camada intermediária resiliente (API REST) capaz de ingerir pedidos de compra de diferentes clientes e sistemas corporativos (cada um com formatos, convenções, nomenclaturas e regras distintas), normalizá-los para um **Modelo Único** e confiável, realizar a **conferência automatizada de notas fiscais** e fornecer **dashboards e relatórios analíticos** de volumetria e divergências.

---

## Índice

- [Visão Geral do Negócio](#visão-geral-do-negócio)
- [Arquitetura e Padrões de Projeto](#arquitetura-e-padrões-de-projeto)
- [Modelo Único de Dados](#modelo-único-de-dados)
- [Endpoints da API REST](#endpoints-da-api-rest)
  - [1. Ingestão de Pedidos](#1-ingestão-de-pedidos-post-apiordersingestclient)
  - [2. Consulta de Pedidos com Filtros](#2-consulta-de-pedidos-get-apiorders)
  - [3. Detalhes e Saldo do Pedido](#3-detalhes-e-saldo-do-pedido-get-apiordersid)
  - [4. Conferência de Nota Fiscal](#4-conferência-de-nota-fiscal-post-apiinvoicevalidate)
  - [5. Logs de Auditoria](#5-logs-de-auditoria-get-apiinvoicelogs)
  - [6. Dashboards e Estatísticas](#6-dashboards-e-estatísticas-get-apireports)
- [Decisões de Arquitetura e Regras de Negócio](#decisões-de-arquitetura-e-regras-de-negócio)
- [Tecnologias e Ferramentas](#tecnologias-e-ferramentas)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Como Rodar o Projeto Localmente](#como-rodar-o-projeto-localmente)
- [Executando os Testes da API](#executando-os-testes-da-api)
- [O que Faria Diferente com Mais Tempo](#o-que-faria-diferente-com-mais-tempo)
- [Parte 2 — Mudanças Exigidas pelo Cliente Gama](#parte-2--mudanças-exigidas-pelo-cliente-gama)

---

## Visão Geral do Negócio

No fluxo tradicional de compras corporativas (*Procure-to-Pay*), quando um fornecedor entrega mercadorias, ele emite notas fiscais cobrando o que forneceu. Para autorizar o pagamento, o time de contas a pagar precisa conferir manualmente se:
1. O material faturado realmente consta no pedido de compra aprovado;
2. A quantidade cobrada cabe dentro do saldo restante a receber;
3. O preço unitário e valor total batem com o que foi acordado previamente.

A plataforma **V360** automatiza integralmente essa conferência. Para isso, o Conector de Pedidos atua como o elo de integração: ele isola as diferenças de cada cliente (arquivos CSV, JSON aninhado, layouts legados, máscaras de CNPJ, formatos de números e datas), transformando-os em um contrato unificado.

---

## Arquitetura e Padrões de Projeto

### 1. Strategy & Factory Pattern (Adapters Desacoplados)
Para suportar clientes heterogêneos sem violar o princípio *Open/Closed* (SOLID), a ingestão é implementada por meio de uma hierarquia de adaptadores:
- **`BaseAdapter`**: Classe abstrata que define o ciclo de vida da ingestão (`validate`, `normalize`, `persist`) e implementa a persistência idempotente via Prisma ORM.
- **`AlfaAdapter`**: Responsável pelo cliente **Alfa Energia** (formato JSON aninhado, campos em inglês, status em minúsculo).
- **`BetaAdapter`**: Responsável pelo cliente **Beta Alimentos** (dois arquivos CSV em padrão brasileiro com delimitador `;`, números com vírgula decimal, datas `DD/MM/AAAA` e CNPJ com máscara).
- **`GamaAdapter`**: Responsável pelo cliente **Gama Logística** (formato JSON achatado/flat por item, conversão de timestamps Unix em segundos, centavos para decimais em Reais, aplicação do `fator_conv` de caixas para unidades e mapeamento de situação numérica 1, 2, 3).
- **`AdapterFactory` (`getAdapter`)**: Registrador dinâmico que instancia o adaptador correto com base no identificador da rota (`alfa`, `beta`, `gama`).

```mermaid
flowchart TD
    subgraph Fontes["Formatos de Origem dos Clientes"]
        Alfa["<b>Cliente Alfa Energia (JSON)</b><br>• JSON aninhado (purchase_orders + items)<br>• Status: open, closed, blocked"]
        Beta["<b>Cliente Beta Alimentos (CSV)</b><br>• 2 CSVs separados por ';'<br>• cabecalho.csv + itens.csv<br>• Padrão Pt-BR: '1.200,00' e 'DD/MM/AAAA'<br>• Status: EM ABERTO, BLOQUEADO"]
        Gama["<b>Cliente Gama Logística (JSON Flat)</b><br>• 1 linha por item com 'ped' repetido<br>• Timestamp Unix em segundos (dt_criacao)<br>• Valores em centavos (preco_unit_centavos)<br>• Fator conversão caixas -> unidades (fator_conv)<br>• Status numérico: 1, 2, 3"]
    end

    subgraph Adaptadores["Camada de Integração (Strategy Pattern)"]
        A_Alfa["AlfaAdapter"]
        A_Beta["BetaAdapter"]
        A_Gama["GamaAdapter"]
    end

    subgraph ModeloUnico["Modelo Único Padronizado (PostgreSQL)"]
        OrderT["<b>Order (Cabeçalho)</b><br>• id: 'GAMA-GL-778'<br>• status: 'OPEN' | 'CLOSED' | 'BLOCKED'"]
        ItemT["<b>OrderItem (Itens Canônicos em UN)</b><br>• unitOfMeasure: 'UN'<br>• quantity: qtd_ped * fator_conv<br>• unitPrice: (centavos / 100) / fator_conv"]
    end

    Alfa --> A_Alfa
    Beta --> A_Beta
    Gama --> A_Gama

    A_Alfa --> OrderT
    A_Alfa --> ItemT
    A_Beta --> OrderT
    A_Beta --> ItemT
    A_Gama --> OrderT
    A_Gama --> ItemT
```

### 2. Segurança: Ingestão 100% em Memória
Para evitar vulnerabilidades críticas de **Local File Inclusion (LFI)** e **Path Traversal**, a API não recebe nem manipula caminhos de arquivos do sistema de arquivos do servidor. Todo conteúdo (JSON estruturado ou strings CSV) é recebido diretamente no *body* das requisições HTTP REST e processado em memória.

### 3. Idempotência na Ingestão
Se o mesmo pedido for retransmitido com atualizações de itens ou quantidades, o sistema executa um `prisma.order.upsert()`. Em caso de atualização, os itens anteriores são substituídos atomicamente dentro de uma transação, evitando linhas duplicadas ou inconsistências.

### 4. Otimização de Performance no Banco de Dados (`groupBy`)
Para endpoints analíticos (`/api/reports`), as agregações (volumetria e ranking de divergências) são executadas **diretamente na camada do PostgreSQL** utilizando `prisma.conferenciaLog.groupBy()`. Isso minimiza o tráfego de rede e o consumo de memória da aplicação Node.js.

---

## Modelo Único de Dados

O modelo relacional unificado foi modelado no PostgreSQL através do Prisma ORM (`prisma/schema.prisma`), incorporando a estrutura normalizada proveniente de Alfa, Beta e Gama:

```mermaid
erDiagram
    GamaFlatItem }o--|| Order : "agrupado por ped em"
    Order ||--o{ OrderItem : contains
    Order ||--o{ ConferenciaLog : audits

    GamaFlatItem {
        string ped "Numero do Pedido (ex: GL-778)"
        int item "Linha do Item (1, 2...)"
        string cnpj_fornecedor "CNPJ do Fornecedor"
        string nome_fornecedor "Razao Social"
        int dt_criacao "Timestamp Unix em segundos (1786752000)"
        int situacao "1 aberto, 2 encerrado, 3 bloqueado"
        string cod_mat "Codigo do Material (TRP-01)"
        string desc_mat "Descricao (Pallet de madeira)"
        string um "Unidade de Compra (CX)"
        int fator_conv "Fator de conversao CX para UN (12)"
        int qtd_ped "Quantidade pedida em caixas (10)"
        int qtd_rec "Quantidade recebida em caixas (2)"
        int preco_unit_centavos "Preco da embalagem em centavos (120000)"
    }

    Order {
        string id PK "GAMA-GL-778 | ALFA-4500001234 | BETA-20260088412"
        string clientOrigin "GAMA | ALFA | BETA"
        string externalId "GL-778 (origem ped)"
        string vendorTaxId "34567890000112 (somente digitos)"
        string vendorName "Transportes Ideal ME"
        datetime createdAt "Data ISO convertida de dt_criacao"
        string status "OPEN (1) | CLOSED (2) | BLOCKED (3)"
        string currency "BRL"
    }

    OrderItem {
        int id PK "autoincrement"
        string orderId FK "GAMA-GL-778"
        int lineNumber "1, 2... (origem item)"
        string materialCode "TRP-01 (origem cod_mat)"
        string description "Pallet de madeira (origem desc_mat)"
        string unitOfMeasure "UN (convertido de CX via fator_conv)"
        decimal quantityOrdered "120 (qtd_ped * fator_conv)"
        decimal quantityReceived "24 (qtd_rec * fator_conv)"
        decimal unitPrice "100.00 ((preco_centavos/100)/fator_conv)"
    }

    ConferenciaLog {
        int id PK "autoincrement"
        string orderId FK "GAMA-GL-778"
        string vendorTaxId "34567890000112"
        string invoiceNumber "NF-GAMA-01"
        string status "APROVADA | REJEITADA"
        string divergenceReason "ORDER_CLOSED, PRICE_DIVERGENCE..."
        datetime createdAt "Timestamp da conferencia"
    }
```

---

## Endpoints da API REST

Todas as rotas da aplicação são expostas sob o prefixo padronizado `/api`.

### 1. Ingestão de Pedidos: `POST /api/orders/ingest/:client`

#### Cliente Alfa Energia (`POST /api/orders/ingest/alfa`)
Recebe o payload JSON estruturado:
```json
{
  "purchase_orders": [
    {
      "po_number": "4500001234",
      "created_at": "2026-08-05",
      "status": "open",
      "currency": "BRL",
      "vendor": { "tax_id": "23456789000101", "name": "Metalúrgica São Jorge S.A." },
      "items": [
        {
          "line": 10,
          "material": "MAT-1001",
          "description": "Chapa de aço 2mm",
          "uom": "UN",
          "quantity_ordered": 100,
          "quantity_received": 60,
          "unit_price": 45.9
        }
      ]
    }
  ]
}
```

#### Cliente Beta Alimentos (`POST /api/orders/ingest/beta`)
Recebe o conteúdo dos dois arquivos CSV enviados como strings no corpo da requisição:
```json
{
  "cabecalho": "NUMERO_PEDIDO;FORNECEDOR_CNPJ;FORNECEDOR_RAZAO_SOCIAL;EMISSAO;SITUACAO;MOEDA\n20260088412;12.345.678/0001-90;Distribuidora Horizonte Ltda;15/08/2026;EM ABERTO;BRL",
  "itens": "NUMERO_PEDIDO;ITEM;CODIGO_MATERIAL;DESCRICAO;UNIDADE;QTD_PEDIDA;QTD_RECEBIDA;PRECO_UNITARIO\n20260088412;1;MAT-77;Óleo de soja 900ml;UN;1.200,000;400,000;6,49"
}
```

#### Cliente Gama Logística (`POST /api/orders/ingest/gama`)
Recebe o JSON de estrutura achatada (*flat*), com uma linha por item de pedido:
```json
[
  {
    "ped": "GL-778",
    "item": 1,
    "cnpj_fornecedor": "34567890000112",
    "nome_fornecedor": "Transportes Ideal ME",
    "dt_criacao": 1786752000,
    "cod_mat": "TRP-01",
    "desc_mat": "Pallet de madeira",
    "um": "CX",
    "fator_conv": 12,
    "qtd_ped": 10,
    "qtd_rec": 2,
    "preco_unit_centavos": 120000,
    "situacao": 1
  },
  {
    "ped": "GL-778",
    "item": 2,
    "cnpj_fornecedor": "34567890000112",
    "nome_fornecedor": "Transportes Ideal ME",
    "dt_criacao": 1786752000,
    "cod_mat": "TRP-09",
    "desc_mat": "Caixa organizadora",
    "um": "CX",
    "fator_conv": 3,
    "qtd_ped": 4,
    "qtd_rec": 0,
    "preco_unit_centavos": 10000,
    "situacao": 1
  }
]
```

---

### 2. Consulta de Pedidos: `GET /api/orders`

Permite listar pedidos com suporte a múltiplos filtros combinados na *query string*:
- `clientOrigin`: Filtra por cliente (`ALFA`, `BETA`, `GAMA`).
- `vendor`: Filtra por CNPJ (com ou sem pontuação) ou por Nome/Razão Social do fornecedor.
- `status`: Filtra por situação (`OPEN`, `CLOSED`, `BLOCKED`).
- `pending_balance=true`: **Otimização de saldo:** retorna apenas pedidos onde ainda há itens com saldo pendente a receber (`quantityOrdered > quantityReceived`).

**Exemplo de Resposta (`GET /api/orders?pending_balance=true`):**
```json
{
  "total": 1,
  "orders": [
    {
      "id": "ALFA-4500001234",
      "clientOrigin": "ALFA",
      "externalId": "4500001234",
      "vendorTaxId": "23456789000101",
      "vendorName": "Metalúrgica São Jorge S.A.",
      "createdAt": "2026-08-05T00:00:00.000Z",
      "status": "OPEN",
      "currency": "BRL",
      "items": [
        {
          "id": 1,
          "lineNumber": 10,
          "materialCode": "MAT-1001",
          "description": "Chapa de aço 2mm",
          "unitOfMeasure": "UN",
          "quantityOrdered": "100",
          "quantityReceived": "60",
          "unitPrice": "45.9",
          "quantityPending": 40,
          "remainingQuantity": 40
        }
      ]
    }
  ]
}
```

---

### 3. Detalhes e Saldo do Pedido: `GET /api/orders/:id`

Recupera um pedido específico pelo identificador unificado em uma única consulta ao banco (`prisma.order.findUnique()` com `include: { items: true }`), calculando em tempo de resposta o saldo pendente de cada item (`quantityPending` e `remainingQuantity`).

**Exemplo:** `GET /api/orders/ALFA-4500001234`

---

### 4. Conferência de Nota Fiscal: `POST /api/invoice/validate`

Recebe os dados da nota fiscal emitida e realiza o cruzamento automatizado contra o pedido de compra referenciado.

**Corpo da Requisição:**
```json
{
  "orderId": "ALFA-4500001234",
  "invoiceNumber": "NF-00100",
  "vendorTaxId": "23.456.789/0001-01",
  "items": [
    {
      "materialCode": "MAT-1001",
      "quantity": 10,
      "totalValue": 459.00
    }
  ]
}
```

**Exemplo de Resposta de Sucesso (APROVADA):**
```json
{
  "status": "APROVADA",
  "valid": true,
  "orderId": "ALFA-4500001234",
  "invoiceNumber": "NF-00100",
  "logId": 5,
  "checkedAt": "2026-09-20T17:40:35.404Z",
  "divergences": []
}
```

**Exemplo de Resposta com Divergências (REJEITADA):**
```json
{
  "status": "REJEITADA",
  "valid": false,
  "orderId": "ALFA-4500001234",
  "invoiceNumber": "NF-00101",
  "logId": 6,
  "checkedAt": "2026-09-20T17:41:05.041Z",
  "divergences": [
    {
      "error": "QUANTITY_EXCEEDED",
      "material": "MAT-1001",
      "lineNumber": 10,
      "requestedQuantity": 50,
      "availableBalance": 40,
      "message": "Quantidade faturada (50) excede o saldo disponível (40) para o item MAT-1001."
    }
  ]
}
```

---

### 5. Logs de Auditoria: `GET /api/invoice/logs`

Permite consultar o histórico de todas as conferências persistidas na tabela `conferencias_log`, com suporte a filtros por `orderId` e `status` (`APROVADA` ou `REJEITADA`).

---

### 6. Dashboards e Estatísticas: `GET /api/reports`

Retorna a volumetria total de notas conferidas e o ranking das divergências mais frequentes, calculado diretamente na base de dados com `prisma.conferenciaLog.groupBy()`.

**Exemplo de Resposta:**
```json
{
  "volumetria": {
    "total": 8,
    "aprovadas": 2,
    "rejeitadas": 6,
    "taxaAprovacao": 25,
    "taxaRejeicao": 75
  },
  "rankingDivergencias": [
    {
      "posicao": 1,
      "motivo": "ORDER_BLOCKED",
      "quantidade": 2,
      "percentual": 33.33
    },
    {
      "posicao": 2,
      "motivo": "PRICE_DIVERGENCE",
      "quantidade": 2,
      "percentual": 33.33
    },
    {
      "posicao": 3,
      "motivo": "QUANTITY_EXCEEDED",
      "quantidade": 2,
      "percentual": 33.33
    }
  ]
}
```

---

## Decisões de Arquitetura e Regras de Negócio

### 1. Chave Primária Composta (`<CLIENTE>-<NUMERO_PEDIDO>`)
- **Problema:** Clientes distintos podem utilizar a mesma sequência de numeração para pedidos (ex: Alfa tem o pedido `1000` e Beta também).
- **Decisão:** O identificador canônico no banco é unificado com o prefixo da origem (ex: `ALFA-4500001234`, `BETA-20260088412`), garantindo unicidade global sem colisões e mantendo o número original armazenado em `externalId`.

### 2. Normalização de Status do Pedido
- **Mapeamento Canônico:**
  - `open`, `EM ABERTO` $\rightarrow$ `OPEN`
  - `closed`, `ENCERRADO` $\rightarrow$ `CLOSED`
  - `blocked`, `BLOQUEADO` $\rightarrow$ `BLOCKED`

### 3. Regras Críticas de Rejeição de Notas Fiscais
- **Pedido Bloqueado ou Encerrado:** Notas emitidas contra pedidos `BLOCKED` ou `CLOSED` são imediatamente rejeitadas com erro `ORDER_BLOCKED` ou `ORDER_CLOSED`.
- **Divergência de Fornecedor:** Se o CNPJ informado na nota divergir do CNPJ contratado no pedido, a nota é rejeitada (`VENDOR_DIVERGENCE`).
- **Saldo Disponível do Item:** O saldo restante de cada item é definido estritamente por:
  $$\text{Saldo} = \max(0, \text{quantityOrdered} - \text{quantityReceived})$$
  Se a quantidade faturada na nota for superior ao saldo, a nota é rejeitada com `QUANTITY_EXCEEDED`.
- **Tolerância Financeira de R$ 0,05:** Na comparação do Valor Total do item faturado contra o valor esperado ($\text{quantidade} \times \text{preço unitário}$), foi adotada uma tolerância configurável de **R$ 0,05**. Isso evita falsos positivos gerados por dízimas periódicas de alíquotas de impostos (PIS/COFINS/ICMS) ou regras de truncamento/arredondamento divergentes entre ERPs. Se a diferença exceder R$ 0,05, a nota é rejeitada com `PRICE_DIVERGENCE`.

### 4. Categorização Exata de Divergências
As divergências retornadas pela API seguem contratos estritos e previsíveis:
| Código do Erro | Descrição |
| :--- | :--- |
| `ORDER_BLOCKED` | Pedido de compra está bloqueado para faturamento |
| `ORDER_CLOSED` | Pedido de compra já se encontra encerrado |
| `VENDOR_DIVERGENCE` | CNPJ da nota diverge do fornecedor titular do pedido |
| `MATERIAL_NOT_FOUND` | Código do material da nota não existe nos itens do pedido |
| `QUANTITY_EXCEEDED` | Quantidade faturada excede o saldo remanescente a receber |
| `PRICE_DIVERGENCE` | Valor total diverge do valor esperado além da margem de R$ 0,05 |
| `EMPTY_ITEMS` | Nota fiscal enviada sem linhas de itens para conferência |

---

## Tecnologias e Ferramentas

- **Runtime & Framework**: [Node.js](https://nodejs.org/) (v18+) e [Express](https://expressjs.com/)
- **Banco de Dados Relacional**: [PostgreSQL](https://www.postgresql.org/)
- **Object-Relational Mapping (ORM)**: [Prisma ORM 6.19](https://www.prisma.io/)
- **Variáveis de Ambiente**: `dotenv`
- **Ambiente de Desenvolvimento**: `nodemon`
- **Suíte de Testes HTTP**: `api_tests.http` (compatível com REST Client do VS Code / Antigravity e Insomnia)
- **Controle de Versão**: Git e GitHub (tags de marcos: `parte-1`)

---

## Estrutura do Projeto

```text
├── .env.example              # Modelo de variáveis de ambiente
├── .env                      # Configuração local (ignorado pelo Git)
├── .gitignore                # Regras de exclusão do repositório
├── api_tests.http            # Roteiro completo de testes de todos os endpoints
├── package.json              # Dependências e scripts npm
├── README.md                 # Documentação técnica e guia do projeto
├── prisma/
│   ├── schema.prisma         # Schema relacional (Order, OrderItem, ConferenciaLog)
│   └── migrations/           # Histórico de migrações gerenciado pelo Prisma
└── src/
    ├── app.js                # Instância Express e montagem das rotas /api
    ├── server.js             # Inicialização do servidor HTTP e checagem de banco
    ├── adapters/
    │   ├── BaseAdapter.js    # Interface abstrata e persistência transacional
    │   ├── AlfaAdapter.js    # Ingestão e normalização do Cliente Alfa (JSON)
    │   ├── BetaAdapter.js    # Ingestão e normalização do Cliente Beta (CSV Pt-BR)
    │   └── index.js          # Factory / Registry de adaptadores
    ├── config/
    │   ├── database.js       # Pool nativo do pg
    │   └── prisma.js         # Cliente singleton do Prisma
    ├── routes/
    │   ├── orderRoutes.js    # Rotas /api/orders (ingestão, listagem, filtros, detalhes)
    │   ├── invoiceRoutes.js  # Rotas /api/invoice (validação e logs de conferência)
    │   └── reportRoutes.js   # Rotas /api/reports (dashboards e agregações analíticas)
    └── services/
        └── invoiceService.js # Regras de validação de notas e agregações com groupBy()
```

---

## Como Rodar o Projeto Localmente

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
Crie o arquivo `.env` a partir do `.env.example`:
```bash
cp .env.example .env
```
Configure as credenciais do seu PostgreSQL no arquivo `.env`:
```env
PORT=3000
NODE_ENV=development

DATABASE_URL="postgresql://seu_usuario:sua_senha@localhost:5432/desafio_v360?schema=public"
```

### 4. Executar as migrações do banco de dados
```bash
npm run prisma:migrate
```

### 5. Iniciar o servidor
- **Modo Desenvolvimento:**
  ```bash
  npm run dev
  ```
- **Modo Produção:**
  ```bash
  npm start
  ```

A API estará disponível em `http://localhost:3000`. O endpoint de verificação de integridade pode ser acessado em `GET http://localhost:3000/health`.

---

## Executando os Testes da API

O arquivo [`api_tests.http`](file:///c:/Users/emill/OneDrive/Documents/Desafio-V360-Conector-de-Pedidos-de-Compra-/api_tests.http) contém todos os cenários de teste documentados e prontos para execução sequencial:

1. **Ingestão Alfa:** Cadastro de pedidos e itens aninhados.
2. **Ingestão Beta:** Carga e cruzamento de `cabecalho.csv` e `itens.csv`.
3. **Listagem Geral:** Visualização de todos os pedidos no Modelo Único.
4. **Filtro por Cliente de Origem:** `clientOrigin=BETA`.
5. **Filtro de Saldo Pendente:** `pending_balance=true`.
6. **Consulta de Pedido Específico:** `ALFA-4500001234` e `BETA-20260088412`.
7. **Conferência Conforme (APROVADA):** Nota dentro do saldo e preço exato.
8. **Conferência com Saldo Excedido (REJEITADA):** Erro `QUANTITY_EXCEEDED`.
9. **Conferência com Divergência de Preço (REJEITADA):** Erro `PRICE_DIVERGENCE`.
10. **Conferência em Pedido Bloqueado (REJEITADA):** Erro `ORDER_BLOCKED`.
11. **Auditoria de Conferências:** `GET /api/invoice/logs`.
12. **Dashboards e Estatísticas:** `GET /api/reports`.

---

## O que Faria Diferente com Mais Tempo

 **Suíte Completa de Testes Automatizados:**
 - Cobertura de testes unitários e de integração com **Jest**, **Supertest** e banco de testes em container Docker temporário em pipeline de CI/CD (GitHub Actions).


---

## Parte 2 — Mudanças Exigidas pelo Cliente Gama

### O que foi SÓ ADICIONAR (Extensão):
1. **Nova classe `GamaAdapter`**
   - Herdando da abstração `BaseAdapter`.
   - **Agrupamento relacional em memória:** Agrupa as linhas soltas pela chave `"ped"`, construindo o cabeçalho e aninhando os itens de forma idempotente.
   - **Tratamento de Dados na Ingestão:** Converte timestamps Unix para objeto `Date`, centavos para decimais em Reais, e normaliza a situação numérica para o vocabulário canônico (`OPEN`, `CLOSED`, `BLOCKED`).
   - **Aplicação do `fator_conv` na borda:** Transforma quantidades em caixas para unidades canônicas ($\text{quantidade} \times \text{fator\_conv}$) e decompõe o preço unitário por unidade ($\frac{\text{preço da caixa}}{\text{fator\_conv}}$). Dessa forma, a base de dados armazena os dados já prontos para a conciliação.
2. **Novos cenários de teste:** Adicionadas requisições de ingestão e conferência de notas fiscais do Gama em [`api_tests.http`]

### O que EXIGIU MEXER no que já existia:
1. **Registro no Factory**
   - Apenas a inclusão de `GAMA: GamaAdapter` no mapa de estratégias (`AdapterFactory.#adapters`).

### O que NÃO PRECISOU SER ALTERADO (Open-Closed Principle):
- **Motor de Validação de Notas Fiscais (`invoiceService.js`):** **Zero linhas alteradas.** Como a normalização converte as caixas em unidades canônicas na ingestão, o motor de conferência valida pedidos do Gama com as mesmas regras universais (saldo, preço e bloqueio).
- **Controladores e Rotas (`orderRoutes.js`):** Nenhuma alteração; a rota `POST /api/orders/ingest/:client` delegou imediatamente para o novo adapter.
- **Adaptadores Existentes (`AlfaAdapter` e `BetaAdapter`):** Zero regressões; continuam operando normalmente de forma totalmente desacoplada.