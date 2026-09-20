const BaseAdapter = require('./BaseAdapter');
const AlfaAdapter = require('./AlfaAdapter');
const BetaAdapter = require('./BetaAdapter');
const GamaAdapter = require('./GamaAdapter');

/**
 * Registro de Adaptadores (Strategy Factory)
 * Permite obter a estratégia correta de acordo com a origem do cliente.
 */
class AdapterFactory {
  static #adapters = {
    ALFA: AlfaAdapter,
    BETA: BetaAdapter,
    GAMA: GamaAdapter,
  };

  /**
   * Registra dinamicamente um novo adapter se necessário.
   * @param {string} clientOrigin
   * @param {typeof BaseAdapter} adapterClass
   */
  static register(clientOrigin, adapterClass) {
    this.#adapters[clientOrigin.toUpperCase()] = adapterClass;
  }

  /**
   * Retorna a instância do Adapter correspondente ao cliente especificado.
   * @param {string} clientOrigin - Ex: 'ALFA', 'BETA', 'GAMA'
   * @returns {BaseAdapter}
   */
  static getAdapter(clientOrigin) {
    if (!clientOrigin) {
      throw new Error('Identificador do cliente de origem não informado.');
    }

    const key = String(clientOrigin).trim().toUpperCase();
    const AdapterClass = this.#adapters[key];

    if (!AdapterClass) {
      throw new Error(`Nenhum adapter disponível para o cliente de origem: "${clientOrigin}".`);
    }

    return new AdapterClass();
  }
}

module.exports = {
  BaseAdapter,
  AlfaAdapter,
  BetaAdapter,
  GamaAdapter,
  AdapterFactory,
  getAdapter: (clientOrigin) => AdapterFactory.getAdapter(clientOrigin),
};
