const BaseAdapter = require('./BaseAdapter');

/**
 * Mapeamento de status do Cliente Beta Alimentos para o Modelo Único.
 */
const BETA_STATUS_MAP = {
  'em aberto': 'OPEN',
  'aberto': 'OPEN',
  'open': 'OPEN',
  'bloqueado': 'BLOCKED',
  'blocked': 'BLOCKED',
  'encerrado': 'CLOSED',
  'fechado': 'CLOSED',
  'closed': 'CLOSED',
};

/**
 * Adapter para ingestão e normalização de pedidos do cliente Beta Alimentos.
 * Formato de origem: Strings CSV separadas por ponto e vírgula (cabeçalho e itens).
 * Opera exclusivamente com dados em memória, sem operações em disco por segurança.
 */
class BetaAdapter extends BaseAdapter {
  constructor() {
    super('BETA');
  }

  /**
   * Converte o status do formato Beta Alimentos para o formato do Modelo Único.
   * @param {string} rawStatus - Ex: "EM ABERTO", "BLOQUEADO"
   * @returns {string} Status padronizado ('OPEN', 'BLOCKED', 'CLOSED')
   */
  normalizeStatus(rawStatus) {
    if (!rawStatus) {
      throw new Error('Situação/status do pedido não fornecido pelo cliente Beta Alimentos.');
    }

    const cleaned = String(rawStatus).trim().toLowerCase();
    const normalized = BETA_STATUS_MAP[cleaned];

    if (!normalized) {
      throw new Error(`Situação inválida para o cliente Beta: "${rawStatus}". Esperado: EM ABERTO ou BLOQUEADO.`);
    }

    return normalized;
  }

  /**
   * Converte números no formato brasileiro (ex: "1.200,000" ou "6,49") em número JavaScript.
   * @param {string|number} value
   * @returns {number}
   */
  parsePtBrNumber(value) {
    if (typeof value === 'number') return value;
    if (!value || typeof value !== 'string') return 0;

    // Remove espaços, pontos de milhar e substitui vírgula decimal por ponto
    const cleaned = value.trim().replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Converte data no padrão brasileiro DD/MM/YYYY em objeto Date.
   * @param {string} dateStr - Ex: "15/08/2026"
   * @returns {Date}
   */
  parsePtBrDate(dateStr) {
    if (!dateStr) return new Date();

    const parts = String(dateStr).trim().split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      return new Date(Date.UTC(year, month, day));
    }

    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  /**
   * Faz o parse de texto CSV delimitado por ponto e vírgula (;).
   * @param {string} csvContent
   * @returns {Array<object>}
   */
  parseCsv(csvContent) {
    if (!csvContent || typeof csvContent !== 'string') {
      return [];
    }

    const lines = csvContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) return [];

    const headers = lines[0].split(';').map((h) => h.trim().toUpperCase());

    return lines.slice(1).map((line) => {
      const values = line.split(';').map((v) => v.trim());
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] !== undefined ? values[index] : '';
      });
      return row;
    });
  }

  /**
   * Normaliza os dados do cliente Beta Alimentos para o Modelo Único.
   * Aceita exclusivamente um objeto com as strings CSV (cabecalho e itens).
   * @param {object} rawInput - Objeto contendo { cabecalho: string, itens: string }
   * @returns {Array<object>} Lista de pedidos no Modelo Único
   */
  adapt(rawInput) {
    if (!rawInput || typeof rawInput !== 'object') {
      throw new Error(
        'Entrada inválida para o BetaAdapter. Esperado um objeto contendo cabecalho e itens com o conteúdo CSV em texto.'
      );
    }

    const cabecalhoCsv =
      rawInput.cabecalho ||
      rawInput.cabecalhoCsv ||
      rawInput.header ||
      rawInput.headers;

    const itensCsv =
      rawInput.itens ||
      rawInput.itensCsv ||
      rawInput.items;

    if (
      typeof cabecalhoCsv !== 'string' ||
      typeof itensCsv !== 'string' ||
      !cabecalhoCsv.trim() ||
      !itensCsv.trim()
    ) {
      throw new Error(
        'BetaAdapter requer as propriedades "cabecalho" e "itens" preenchidas com as strings do conteúdo CSV.'
      );
    }

    const headersRows = this.parseCsv(cabecalhoCsv);
    const itemsRows = this.parseCsv(itensCsv);

    if (headersRows.length === 0) {
      throw new Error('Nenhum registro de pedido encontrado no CSV de cabeçalho do cliente Beta.');
    }

    // Indexa os itens pelo número do pedido (NUMERO_PEDIDO)
    const itemsByOrder = new Map();
    for (const itemRow of itemsRows) {
      const orderNum = String(itemRow.NUMERO_PEDIDO || itemRow.NUMERO || '').trim();
      if (!orderNum) continue;

      if (!itemsByOrder.has(orderNum)) {
        itemsByOrder.set(orderNum, []);
      }

      itemsByOrder.get(orderNum).push({
        lineNumber: parseInt(itemRow.ITEM || '1', 10),
        materialCode: String(itemRow.CODIGO_MATERIAL || itemRow.MATERIAL || '').trim(),
        description: String(itemRow.DESCRICAO || '').trim(),
        unitOfMeasure: String(itemRow.UNIDADE || '').trim().toUpperCase(),
        quantityOrdered: this.parsePtBrNumber(itemRow.QTD_PEDIDA),
        quantityReceived: this.parsePtBrNumber(itemRow.QTD_RECEBIDA),
        unitPrice: this.parsePtBrNumber(itemRow.PRECO_UNITARIO),
      });
    }

    // Monta os pedidos normalizados no Modelo Único
    return headersRows.map((headerRow) => {
      const externalId = String(headerRow.NUMERO_PEDIDO || headerRow.NUMERO || '').trim();
      if (!externalId) {
        throw new Error('Registro de cabeçalho sem o campo obrigatório NUMERO_PEDIDO.');
      }

      const id = `${this.clientOrigin}-${externalId}`;

      // Remove pontuação de CNPJ (12.345.678/0001-90 -> 12345678000190)
      const rawCnpj = String(headerRow.FORNECEDOR_CNPJ || headerRow.CNPJ || '').trim();
      const vendorTaxId = rawCnpj.replace(/\D/g, '') || rawCnpj;

      const vendorName = String(headerRow.FORNECEDOR_RAZAO_SOCIAL || headerRow.RAZAO_SOCIAL || '').trim();
      const createdAt = this.parsePtBrDate(headerRow.EMISSAO);
      const status = this.normalizeStatus(headerRow.SITUACAO);
      const currency = String(headerRow.MOEDA || 'BRL').trim().toUpperCase();

      const items = (itemsByOrder.get(externalId) || []).sort((a, b) => a.lineNumber - b.lineNumber);

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
    });
  }
}

module.exports = BetaAdapter;
