const defaultPrisma = require('../config/prisma');

/**
 * Interface base (Strategy) para adaptadores de integração de pedidos de compra.
 * Define o contrato padrão que cada cliente (Alfa, Beta, Gama) deve implementar.
 */
class BaseAdapter {
  constructor(clientOrigin) {
    if (this.constructor === BaseAdapter) {
      throw new Error('BaseAdapter é uma classe abstrata e não pode ser instanciada diretamente.');
    }
    this.clientOrigin = clientOrigin;
  }

  /**
   * Normaliza os dados específicos do cliente para o Modelo Único.
   * Deve ser implementado pelas subclasses específicas.
   * @param {string|object} rawData - Dados brutos (JSON, CSV ou Objeto)
   * @returns {Array<object>} Lista de pedidos no modelo único
   */
  adapt(rawData) {
    throw new Error(`O método adapt() deve ser implementado pelo adapter ${this.constructor.name}.`);
  }

  /**
   * Persiste os pedidos normalizados no banco de dados com resiliência.
   * Utiliza prisma.order.upsert e orderItem.upsert para permitir reenvio de cargas sem duplicar dados.
   * @param {Array<object>} normalizedOrders - Lista de pedidos padronizados
   * @param {object} [prismaClient=defaultPrisma] - Cliente Prisma opcional para injeção de dependência/testes
   * @returns {Promise<Array<object>>} Pedidos persistidos
   */
  async save(normalizedOrders, prismaClient = defaultPrisma) {
    const results = [];

    for (const orderData of normalizedOrders) {
      const { items, ...orderHeader } = orderData;

      const persistedOrder = await prismaClient.$transaction(async (tx) => {
        // Upsert do cabeçalho do pedido
        const upsertedOrder = await prismaClient.order.upsert({
          where: { id: orderHeader.id },
          create: {
            ...orderHeader,
            items: { create: items } // Cria os itens junto com o pedido novo
          },
          update: {
            ...orderHeader,
            items: {
              deleteMany: {}, // Apaga os itens antigos
              create: items   // Recria com os dados atualizados da nova carga
            }
          }
        });

        // Upsert dos itens do pedido
        const upsertedItems = [];
        if (Array.isArray(items)) {
          for (const item of items) {
            const upsertedItem = await tx.orderItem.upsert({
              where: {
                orderId_lineNumber: {
                  orderId: orderHeader.id,
                  lineNumber: item.lineNumber,
                },
              },
              create: {
                orderId: orderHeader.id,
                lineNumber: item.lineNumber,
                materialCode: item.materialCode,
                description: item.description,
                unitOfMeasure: item.unitOfMeasure,
                quantityOrdered: item.quantityOrdered,
                quantityReceived: item.quantityReceived ?? 0,
                unitPrice: item.unitPrice,
              },
              update: {
                materialCode: item.materialCode,
                description: item.description,
                unitOfMeasure: item.unitOfMeasure,
                quantityOrdered: item.quantityOrdered,
                quantityReceived: item.quantityReceived ?? 0,
                unitPrice: item.unitPrice,
              },
            });
            upsertedItems.push(upsertedItem);
          }
        }

        return {
          ...upsertedOrder,
          items: upsertedItems,
        };
      });

      results.push(persistedOrder);
    }

    return results;
  }

  /**
   * Método de execução completa: recebe a entrada bruta em memória (string ou objeto), normaliza e persiste no banco.
   * @param {string|object} rawInput
   * @param {object} [prismaClient=defaultPrisma]
   * @returns {Promise<Array<object>>}
   */
  async process(rawInput, prismaClient = defaultPrisma) {
    const normalizedOrders = this.adapt(rawInput);
    return await this.save(normalizedOrders, prismaClient);
  }
}

module.exports = BaseAdapter;
