const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const { getAdapter } = require('../adapters');

/**
 * Ingestão de pedidos via Adapter específico do cliente (ex: /api/orders/ingest/alfa)
 * Recebe o payload de pedidos diretamente no corpo da requisição em formato JSON.
 */
router.post('/ingest/:client', async (req, res) => {
  try {
    const { client } = req.params;
    const adapter = getAdapter(client);
    const payload = req.body;

    if (!payload || (typeof payload === 'object' && Object.keys(payload).length === 0)) {
      return res.status(400).json({
        error: 'Nenhum dado fornecido no corpo da requisição para ingestão.',
      });
    }

    const savedOrders = await adapter.process(payload);

    return res.status(201).json({
      message: `Ingestão do cliente ${adapter.clientOrigin} concluída com sucesso.`,
      ordersProcessed: savedOrders.length,
      orders: savedOrders,
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message,
    });
  }
});

/**
 * Consulta de pedidos de compra no formato único com suporte a filtros:
 * - clientOrigin: por cliente de origem ('ALFA', 'BETA', 'GAMA')
 * - vendorTaxId: por CNPJ/identificador do fornecedor
 * - status: por situação ('OPEN', 'CLOSED', 'BLOCKED')
 * - pending_balance=true: apenas pedidos que ainda possuem saldo pendente a receber (quantityOrdered > quantityReceived)
 */
router.get('/', async (req, res) => {
  try {
    const { clientOrigin, vendorTaxId, status, pending_balance } = req.query;

    const where = {};
    if (clientOrigin) where.clientOrigin = String(clientOrigin).toUpperCase();
    if (vendorTaxId) where.vendorTaxId = String(vendorTaxId).replace(/\D/g, '');
    if (status) where.status = String(status).toUpperCase();

    // Filtro para pedidos com saldo pendente a receber
    if (pending_balance !== undefined) {
      const isPendingTrue = String(pending_balance).toLowerCase() === 'true' || pending_balance === '1';
      const pendingOrders = await prisma.$queryRaw`
        SELECT DISTINCT order_id 
        FROM order_items 
        WHERE quantity_ordered > quantity_received
      `;
      const pendingIds = pendingOrders.map((row) => row.order_id);
      if (isPendingTrue) {
        where.id = { in: pendingIds };
      } else {
        where.id = { notIn: pendingIds };
      }
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        items: {
          orderBy: { lineNumber: 'asc' },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Enriquece cada item com o cálculo de saldo pendente
    const formattedOrders = orders.map((order) => ({
      ...order,
      items: order.items.map((item) => ({
        ...item,
        quantityPending: Math.max(0, Number(item.quantityOrdered) - Number(item.quantityReceived)),
      })),
    }));

    return res.status(200).json({
      total: formattedOrders.length,
      orders: formattedOrders,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Consulta de um pedido específico por ID composto (ex: ALFA-4500001234)
 */
router.get('/:id', async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        items: {
          orderBy: { lineNumber: 'asc' },
        },
        logs: true,
      },
    });

    if (!order) {
      return res.status(404).json({
        error: `Pedido não encontrado com o ID "${req.params.id}".`,
      });
    }

    const formattedOrder = {
      ...order,
      items: order.items.map((item) => ({
        ...item,
        quantityPending: Math.max(0, Number(item.quantityOrdered) - Number(item.quantityReceived)),
      })),
    };

    return res.status(200).json(formattedOrder);
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
});

module.exports = router;
