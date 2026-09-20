const express = require('express');
const router = express.Router();
const invoiceService = require('../services/invoiceService');
const prisma = require('../config/prisma');

/**
 * POST /invoice/validate
 * Realiza a conferência da nota fiscal contra o pedido de compra referenciado.
 */
router.post('/validate', async (req, res) => {
  try {
    const result = await invoiceService.validateInvoice(req.body);

    return res.status(200).json(result);
  } catch (error) {
    const statusCode = error.statusCode || 400;
    return res.status(statusCode).json({
      error: error.code || 'VALIDATION_ERROR',
      message: error.message,
    });
  }
});

/**
 * GET /invoice/logs (ou relatório de conferências)
 * Lista as conferências realizadas para auditoria e relatórios da plataforma.
 */
router.get('/logs', async (req, res) => {
  try {
    const { orderId, status } = req.query;

    const where = {};
    if (orderId) where.orderId = String(orderId).trim();
    if (status) where.status = String(status).trim().toUpperCase();

    const logs = await prisma.conferenciaLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const totalAprovadas = logs.filter((l) => l.status === 'APROVADA').length;
    const totalRejeitadas = logs.filter((l) => l.status === 'REJEITADA').length;

    return res.status(200).json({
      total: logs.length,
      resumo: {
        aprovadas: totalAprovadas,
        rejeitadas: totalRejeitadas,
      },
      logs,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error.message,
    });
  }
});

module.exports = router;
