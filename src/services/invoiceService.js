const prisma = require('../config/prisma');
/**
 * Serviço responsável pela conferência e validação de Notas Fiscais contra Pedidos de Compra.
 */
class InvoiceService {
  /**
   * Valida os dados da nota fiscal contra o pedido de compra correspondente.
   * @param {object} invoiceData
   * @returns {Promise<object>} Resultado detalhado da validação e o registro persistido
   */
  async validateInvoice(invoiceData) {
    const orderId = String(invoiceData.orderId || invoiceData.order_id || '').trim();
    const invoiceNumber = invoiceData.invoiceNumber || invoiceData.invoice_number || invoiceData.numeroNota || null;
    const rawVendorTaxId = invoiceData.vendorTaxId || invoiceData.vendor_tax_id || invoiceData.cnpj || '';
    const cleanVendorTaxId = String(rawVendorTaxId).replace(/\D/g, '');
    const items = Array.isArray(invoiceData.items) ? invoiceData.items : (Array.isArray(invoiceData.itens) ? invoiceData.itens : []);

    if (!orderId) {
      throw new Error('Identificador do pedido (orderId) é obrigatório para a validação da nota fiscal.');
    }

    // Busca o pedido e seus itens no banco
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          orderBy: { lineNumber: 'asc' },
        },
      },
    });

    if (!order) {
      const error = new Error(`Pedido de compra não encontrado com o ID "${orderId}".`);
      error.statusCode = 404;
      error.code = 'ORDER_NOT_FOUND';
      throw error;
    }

    const divergences = [];
    const tolerance = 0.05;

    // 1. Validação de estado do pedido (Rejeitar se Encerrado ou Bloqueado)
    if (order.status === 'BLOCKED') {
      divergences.push({
        error: 'ORDER_BLOCKED',
        message: `O pedido ${order.id} encontra-se bloqueado para faturamento (status: BLOCKED).`,
      });
    }

    if (order.status === 'CLOSED') {
      divergences.push({
        error: 'ORDER_CLOSED',
        message: `O pedido ${order.id} já foi encerrado (status: CLOSED).`,
      });
    }

    // 2. Validação do Fornecedor (se informado na nota)
    if (cleanVendorTaxId && order.vendorTaxId && cleanVendorTaxId !== order.vendorTaxId) {
      divergences.push({
        error: 'VENDOR_DIVERGENCE',
        expectedVendorTaxId: order.vendorTaxId,
        invoicedVendorTaxId: cleanVendorTaxId,
        message: `Fornecedor informado na nota (${cleanVendorTaxId}) diverge do fornecedor do pedido (${order.vendorTaxId}).`,
      });
    }

    // 3. Validação dos itens faturados
    if (items.length === 0) {
      divergences.push({
        error: 'EMPTY_ITEMS',
        message: 'A requisição da nota fiscal não possui itens para conferência.',
      });
    } else {
      for (const item of items) {
        const materialCode = String(item.materialCode || item.material || item.codigo_material || '').trim();
        const quantity = Number(item.quantity ?? item.quantidade ?? item.qtd ?? 0);
        const totalValue = Number(item.totalValue ?? item.valor_total ?? item.valorTotal ?? 0);

        if (!materialCode) {
          divergences.push({
            error: 'MISSING_MATERIAL_CODE',
            message: 'Item da nota sem código de material informado.',
          });
          continue;
        }

        // Localiza o item correspondente no pedido de compra
        const orderItem = order.items.find(
          (oi) => oi.materialCode.toUpperCase() === materialCode.toUpperCase()
        );

        if (!orderItem) {
          divergences.push({
            error: 'MATERIAL_NOT_FOUND',
            material: materialCode,
            message: `Material "${materialCode}" não consta no pedido de compra ${order.id}.`,
          });
          continue;
        }

        // Verifica saldo disponível no item
        const availableBalance = Math.max(0, Number(orderItem.quantityOrdered) - Number(orderItem.quantityReceived));
        if (quantity > availableBalance) {
          divergences.push({
            error: 'QUANTITY_EXCEEDED',
            material: orderItem.materialCode,
            lineNumber: orderItem.lineNumber,
            requestedQuantity: quantity,
            availableBalance: availableBalance,
            message: `Quantidade faturada (${quantity}) excede o saldo disponível (${availableBalance}) para o item ${orderItem.materialCode}.`,
          });
        }

        // Validação de Preço e Valor Total com tolerância financeira configurável
        const unitPrice = Number(orderItem.unitPrice);
        const expectedTotal = quantity * unitPrice;
        const diff = Math.abs(totalValue - expectedTotal);

        if (diff > tolerance) {
          divergences.push({
            error: 'PRICE_DIVERGENCE',
            material: orderItem.materialCode,
            lineNumber: orderItem.lineNumber,
            unitPrice: unitPrice,
            expectedTotal: parseFloat(expectedTotal.toFixed(2)),
            invoicedTotal: parseFloat(totalValue.toFixed(2)),
            difference: parseFloat(diff.toFixed(2)),
            toleranceAllowed: tolerance,
            message: `Valor total do item R$ ${totalValue.toFixed(2)} diverge do valor esperado R$ ${expectedTotal.toFixed(2)} além da tolerância permitida de R$ ${tolerance.toFixed(2)}.`,
          });
        }
      }
    }

    // Determina o status final da conferência
    const isValid = divergences.length === 0;
    const status = isValid ? 'APROVADA' : 'REJEITADA';
    const divergenceReason = divergences.length > 0 ? divergences.map((d) => d.error).join(', ') : null;

    // Persistência do resultado na tabela conferencias_log
    const log = await prisma.conferenciaLog.create({
      data: {
        orderId: order.id,
        vendorTaxId: cleanVendorTaxId || order.vendorTaxId,
        invoiceNumber: invoiceNumber ? String(invoiceNumber).trim() : null,
        status,
        divergenceReason,
      },
    });

    return {
      status,
      valid: isValid,
      orderId: order.id,
      invoiceNumber: log.invoiceNumber,
      logId: log.id,
      checkedAt: log.createdAt,
      divergences,
    };
  }
}

module.exports = new InvoiceService();
