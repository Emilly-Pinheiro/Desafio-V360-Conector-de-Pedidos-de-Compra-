const BaseAdapter = require('./BaseAdapter');

/**
 * Mapeamento dos status do Cliente Alfa Energia para o Modelo Único.
 */
const ALFA_STATUS_MAP = {
  open: 'OPEN',
  closed: 'CLOSED',
  blocked: 'BLOCKED',
};

/**
 * Adapter para ingestão e normalização de pedidos do cliente Alfa Energia.
 * Formato de origem: JSON com pedidos e itens aninhados.
 */
class AlfaAdapter extends BaseAdapter {
  constructor() {
    super('ALFA');
  }

  /**
   * Converte o status do formato Alfa Energia para o formato do Modelo Único.
   * @param {string} rawStatus
   * @returns {string} Status padronizado ('OPEN', 'CLOSED', 'BLOCKED')
   */
  normalizeStatus(rawStatus) {
    if (!rawStatus) {
      throw new Error('Status do pedido não fornecido pelo cliente Alfa Energia.');
    }

    const cleaned = String(rawStatus).trim().toLowerCase();
    const normalized = ALFA_STATUS_MAP[cleaned];

    if (!normalized) {
      throw new Error(`Status inválido para o cliente Alfa: "${rawStatus}". Esperado: open, closed ou blocked.`);
    }

    return normalized;
  }

  /**
   * Converte o valor de entrada (JSON string ou objeto em memória) em objeto JavaScript.
   * Não realiza operações no sistema de arquivos para evitar brechas de segurança.
   * @param {string|object} rawInput
   * @returns {object}
   */
  parseInput(rawInput) {
    if (typeof rawInput === 'object' && rawInput !== null) {
      return rawInput;
    }

    if (typeof rawInput === 'string') {
      try {
        return JSON.parse(rawInput);
      } catch (err) {
        throw new Error(`Erro ao fazer parse do JSON de Alfa Energia: ${err.message}`);
      }
    }

    throw new Error('Entrada inválida para o AlfaAdapter. Esperado string JSON ou objeto.');
  }

  /**
   * Normaliza o payload de Alfa Energia para o Modelo Único.
   * @param {string|object} rawInput
   * @returns {Array<object>} Lista de pedidos no Modelo Único
   */
  adapt(rawInput) {
    const parsedData = this.parseInput(rawInput);

    // Suporta tanto { "purchase_orders": [...] } quanto array direto [...] ou pedido único {...}
    let ordersList = [];
    if (Array.isArray(parsedData.purchase_orders)) {
      ordersList = parsedData.purchase_orders;
    } else if (Array.isArray(parsedData)) {
      ordersList = parsedData;
    } else if (parsedData && typeof parsedData === 'object') {
      ordersList = [parsedData];
    } else {
      throw new Error('Formato do JSON de Alfa Energia inválido: estrutura purchase_orders não encontrada.');
    }

    return ordersList.map((po) => this.normalizeOrder(po));
  }

  /**
   * Normaliza um único pedido de compra e seus itens aninhados.
   * @param {object} po - Pedido de compra original
   * @returns {object} Pedido no Modelo Único
   */
  normalizeOrder(po) {
    if (!po.po_number) {
      throw new Error('Pedido de Alfa Energia sem campo obrigatório "po_number".');
    }

    const externalId = String(po.po_number).trim();
    const id = `${this.clientOrigin}-${externalId}`;

    // Sanitiza o CNPJ mantendo apenas dígitos se fornecido
    const rawTaxId = po.vendor?.tax_id ? String(po.vendor.tax_id).trim() : '';
    const vendorTaxId = rawTaxId.replace(/\D/g, '') || rawTaxId;

    const vendorName = po.vendor?.name ? String(po.vendor.name).trim() : '';
    const createdAt = po.created_at ? new Date(po.created_at) : new Date();
    const status = this.normalizeStatus(po.status);
    const currency = po.currency ? String(po.currency).trim().toUpperCase() : 'BRL';

    // Normaliza os itens aninhados
    const rawItems = Array.isArray(po.items) ? po.items : [];
    const items = rawItems.map((item) => {
      if (item.line === undefined || item.line === null) {
        throw new Error(`Item sem número de linha no pedido ${id}.`);
      }

      return {
        lineNumber: Number(item.line),
        materialCode: String(item.material || '').trim(),
        description: String(item.description || '').trim(),
        unitOfMeasure: String(item.uom || '').trim().toUpperCase(),
        quantityOrdered: Number(item.quantity_ordered || 0),
        quantityReceived: Number(item.quantity_received || 0),
        unitPrice: Number(item.unit_price || 0),
      };
    });

    return {
      id,
      clientOrigin: this.clientOrigin,
      externalId,
      vendorTaxId,
      vendorName,
      createdAt,
      status,
      currency,
      items,
    };
  }
}

module.exports = AlfaAdapter;
