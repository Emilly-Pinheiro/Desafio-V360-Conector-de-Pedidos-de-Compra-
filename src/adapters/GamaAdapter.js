const BaseAdapter = require('./BaseAdapter');

/**
 * Mapeamento da situação numérica do Cliente Gama Logística para o Modelo Único:
 * 1 = em aberto (OPEN)
 * 2 = encerrado (CLOSED)
 * 3 = bloqueado (BLOCKED)
 */
const GAMA_STATUS_MAP = {
  1: 'OPEN',
  '1': 'OPEN',
  2: 'CLOSED',
  '2': 'CLOSED',
  3: 'BLOCKED',
  '3': 'BLOCKED',
};

/**
 * Adapter para ingestão e normalização de pedidos do cliente Gama Logística.
 * Formato de origem: Estrutura achatada (flat) em JSON, com uma linha por item de pedido.
 * 
 * Particularidades tratadas:
 * - Agrupamento de linhas isoladas pela chave "ped" para formar o cabeçalho e itens do pedido.
 * - Conversão de timestamp Unix (em segundos) para formato Date ISO.
 * - Conversão de valores monetários de centavos para decimais em Reais (BRL).
 * - Mapeamento de situação numérica (1=OPEN, 2=CLOSED, 3=BLOCKED).
 * - Aplicação do fator de conversão (fator_conv): converte quantidades e preços da unidade
 *   de compra (ex: Caixas) para unidades canônicas ("UN") no momento da ingestão.
 */
class GamaAdapter extends BaseAdapter {
  constructor() {
    super('GAMA');
  }

  /**
   * Converte a situação do formato Gama Logística para o Modelo Único.
   * @param {number|string} rawStatus - Código numérico (1, 2, 3) ou texto
   * @returns {string} Status padronizado ('OPEN', 'CLOSED', 'BLOCKED')
   */
  normalizeStatus(rawStatus) {
    if (rawStatus === undefined || rawStatus === null || rawStatus === '') {
      throw new Error('Situação do pedido não fornecida pelo cliente Gama Logística.');
    }

    const key = typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : rawStatus;
    const normalized = GAMA_STATUS_MAP[key];

    if (!normalized) {
      throw new Error(
        `Situação inválida para o cliente Gama: "${rawStatus}". Esperado: 1 (aberto), 2 (encerrado) ou 3 (bloqueado).`
      );
    }

    return normalized;
  }

  /**
   * Converte timestamp Unix (em segundos ou milissegundos) para objeto Date.
   * @param {number|string} timestamp
   * @returns {Date}
   */
  parseUnixTimestamp(timestamp) {
    if (!timestamp) return new Date();

    const num = Number(timestamp);
    if (isNaN(num)) {
      const parsed = new Date(timestamp);
      return isNaN(parsed.getTime()) ? new Date() : parsed;
    }

    // Se o número tiver menos de 11 dígitos, trata-se de timestamp em segundos
    const millis = num < 10000000000 ? num * 1000 : num;
    return new Date(millis);
  }

  /**
   * Converte a entrada bruta (string JSON ou array/objeto em memória) para estrutura JavaScript.
   * Opera 100% em memória, sem acesso ao sistema de arquivos por segurança.
   * @param {string|Array|object} rawInput
   * @returns {Array<object>}
   */
  parseInput(rawInput) {
    let data = rawInput;

    if (typeof rawInput === 'string') {
      try {
        data = JSON.parse(rawInput);
      } catch (err) {
        throw new Error(`Erro ao fazer parse do JSON do cliente Gama Logística: ${err.message}`);
      }
    }

    if (Array.isArray(data)) {
      return data;
    }

    if (data && typeof data === 'object') {
      // Suporta propriedades contendo o array caso enviado encapsulado
      if (Array.isArray(data.items)) return data.items;
      if (Array.isArray(data.pedidos)) return data.pedidos;
      if (Array.isArray(data.orders)) return data.orders;
      if (Array.isArray(data.linhas)) return data.linhas;
      return [data];
    }

    throw new Error('Entrada inválida para o GamaAdapter. Esperado array de itens ou string JSON.');
  }

  /**
   * Normaliza os dados achatados (flat) do cliente Gama Logística para o Modelo Único.
   * Agrupa as linhas repetidas pela chave "ped", converte timestamps, centavos e aplica o fator_conv.
   * @param {string|Array|object} rawInput
   * @returns {Array<object>} Lista de pedidos no Modelo Único
   */
  adapt(rawInput) {
    const flatRows = this.parseInput(rawInput);

    if (flatRows.length === 0) {
      throw new Error('Nenhum registro encontrado no payload do cliente Gama Logística.');
    }

    // 1. Agrupamento das linhas isoladas pela chave do pedido (ped)
    const groupedOrders = new Map();

    for (const row of flatRows) {
      const ped = String(row.ped || row.pedido || row.numero_pedido || '').trim();
      if (!ped) {
        throw new Error('Registro do cliente Gama sem o campo obrigatório de pedido "ped".');
      }

      if (!groupedOrders.has(ped)) {
        groupedOrders.set(ped, {
          header: {
            ped,
            cnpj_fornecedor: row.cnpj_fornecedor,
            nome_fornecedor: row.nome_fornecedor,
            dt_criacao: row.dt_criacao,
            situacao: row.situacao,
          },
          items: [],
        });
      }

      groupedOrders.get(ped).items.push(row);
    }

    // 2. Construção dos pedidos normalizados
    const normalizedOrders = [];

    for (const [ped, orderGroup] of groupedOrders.entries()) {
      const { header, items: rawItems } = orderGroup;

      const externalId = ped;
      const id = `${this.clientOrigin}-${externalId}`;

      // Limpeza da máscara de CNPJ se presente (mantém apenas dígitos)
      const rawCnpj = String(header.cnpj_fornecedor || '').trim();
      const vendorTaxId = rawCnpj.replace(/\D/g, '') || rawCnpj;

      const vendorName = String(header.nome_fornecedor || '').trim();
      const createdAt = this.parseUnixTimestamp(header.dt_criacao);
      const status = this.normalizeStatus(header.situacao);
      const currency = 'BRL';

      // Normaliza e converte os itens aplicando fator_conv e centavos
      const normalizedItems = rawItems.map((rawItem, index) => {
        const lineNumber = rawItem.item !== undefined && rawItem.item !== null
          ? Number(rawItem.item)
          : index + 1;

        const materialCode = String(rawItem.cod_mat || rawItem.material || '').trim();
        const description = String(rawItem.desc_mat || rawItem.descricao || '').trim();

        // Fator de conversão de unidades (ex: 1 caixa = 12 unidades)
        const fatorConv = Number(rawItem.fator_conv) > 0 ? Number(rawItem.fator_conv) : 1;

        // Quantidades convertidas da unidade de compra para unidades padrão ("UN")
        const qtdPedRaw = Number(rawItem.qtd_ped ?? rawItem.quantidade_pedida ?? 0);
        const qtdRecRaw = Number(rawItem.qtd_rec ?? rawItem.quantidade_recebida ?? 0);

        const quantityOrdered = qtdPedRaw * fatorConv;
        const quantityReceived = qtdRecRaw * fatorConv;

        // Preço unitário: converter centavos para Reais e dividir pelo fator_conv
        // Ex: R$ 1.200,00 por caixa de 12 un -> R$ 100,00 por unidade
        const precoCentavos = Number(rawItem.preco_unit_centavos ?? 0);
        const precoReaisPorEmbalagem = precoCentavos / 100;
        const unitPricePorUnidade = precoReaisPorEmbalagem / fatorConv;

        // Converte o preço unitário para padrão monetário com 2 casas decimais
        const unitPrice = Number(unitPricePorUnidade.toFixed(2));

        return {
          lineNumber,
          materialCode,
          description,
          unitOfMeasure: 'UN', // Normalizado para Unidades padrão para cruzamento com notas fiscais
          quantityOrdered,
          quantityReceived,
          unitPrice,
        };
      });

      // Ordena itens por número de linha
      normalizedItems.sort((a, b) => a.lineNumber - b.lineNumber);

      normalizedOrders.push({
        id,
        clientOrigin: this.clientOrigin,
        externalId,
        vendorTaxId,
        vendorName,
        createdAt,
        status,
        currency,
        items: normalizedItems,
      });
    }

    return normalizedOrders;
  }
}

module.exports = GamaAdapter;
