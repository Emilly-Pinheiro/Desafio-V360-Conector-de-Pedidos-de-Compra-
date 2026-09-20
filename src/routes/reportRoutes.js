const express = require('express');
const router = express.Router();
const invoiceService = require('../services/invoiceService');

/**
 * GET /reports (ou /api/reports)
 * Dashboards e Estatísticas:
 * - Volumetria total de notas aprovadas contra as rejeitadas.
 * - Ranking ordenado com os motivos mais frequentes de divergência.
 * Otimização: Agregações executadas diretamente no PostgreSQL com prisma.conferenciaLog.groupBy().
 */
router.get('/', async (req, res) => {
  try {
    const reports = await invoiceService.getReports();
    return res.status(200).json(reports);
  } catch (error) {
    return res.status(500).json({
      error: 'REPORT_ERROR',
      message: error.message,
    });
  }
});

module.exports = router;
