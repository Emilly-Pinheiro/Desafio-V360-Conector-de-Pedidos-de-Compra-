# AI_USAGE

## Ferramentas utilizadas

- Agente IA do Antigravity IDE (Gemini 3.8 Flash): Utilizado primariamente para a geração do código-fonte, estruturação do projeto (Scaffolding) e implementação de rotas e serviços.

- LLMs Assistentes (Gemini 3.1 Pro): Utilizado como parceiro de raciocínio (thought partner) para planeamento da arquitetura, debates sobre vulnerabilidades de segurança, modelação relacional no Prisma e revisão de regras de negócio.

## Exemplo de prompt que funcionou

**Objetivo:** Criar o adaptador do cliente Alfa Energia garantindo resiliência e boas práticas de arquitetura.
**Prompt Utilizado:**

"Utilizando os padrões adapter e strategy crie um adapter para o cliente alfa energia. Critérios de Aceite: O sistema deve ler o arquivo JSON e extrair o cabeçalho e itens aninhados. Os status "open", "closed" e "blocked" devem ser padronizados para o Modelo Único. Notas Técnicas / Arquitetura: Design Pattern: Implementar interface base de Adapter (Strategy) e a classe AlfaAdapter. Resiliência: Utilizar o método prisma.order.upsert() para suportar o reenvio de cargas, atualizando os dados do pedido em vez de os duplicar."

**Por que funcionou:** Este prompt foi eficaz porque ao estipular as regras de negócio e impor os padrões de engenharia de software (Strategy e Adapter), impediu que a IA gerasse uma arquitetura frágil ou acoplada pois já havia um escopo definido. O coódigo gerado seguiu esse escopo e conseguiu atender aos requisitos do desafio.

## Exemplo onde a IA errou e como foi validado

1. **Complexidade do prisma no BaseAdapter:**

    Durante a criação do BaseAdapter, a IA sugeriu o uso de blocos $transaction manuais com loops de upsert para salvar os itens do pedido. Ao revisar o código, percebi duas falhas. Primeiro, era uma complexidade desnecessária para o Prisma. Segundo, causava um erro de negócio: se um cliente reenviasse um pedido removendo um item que existia na carga anterior, o loop da IA não apagava esse item do banco de dados.
    O que eu fiz: Descartei o loop manual gerado pela IA e reescrevi a persistência utilizando o upsert nativo do Prisma no objeto pai (Order), aplicando um deleteMany: {} seguido de um create nos itens durante o bloco de update. Isso simplificou o código drasticamente e garantiu o espelhamento real da carga reenviada. Também limpei queries cruas duplicadas que a IA havia gerado no arquivo de rotas.

2. **Correção de vulnerabilidade de segurança no BetaAdapter:**

    Durante a criação do adaptador para o formato CSV (Cliente Beta), a IA gerou uma solução que utilizava a biblioteca nativa fs do Node.js, permitindo que a API recebesse o caminho de um ficheiro no payload e o fosse ler diretamente ao disco.
    Como resolvi: Identifiquei que esta abordagem abria uma falha grave de segurança (risco de Local File Inclusion). Rejeitei a implementação da IA, removi o módulo fs e refatorei o método adapt. Obriguei a API a aceitar exclusivamente as strings com o conteúdo do CSV já injetadas no req.body. Com isto, garanti que a responsabilidade de leitura do ficheiro fica no cliente que faz a requisição, mantendo o backend isolado, seguro e focado apenas na normalização dos dados.

3. **Refinamento de Resposta da API:**

    Durante a geração do endpoint GET /reports, a IA incluiu dados analíticos redundantes no retorno JSON, duplicando taxas de aprovação/rejeição e formatando percentagens como strings finais, o que polui o contrato da API.
    Como resolvi: Intervi com um prompt corretivo questionando as decisões da ferramenta ("quando você traz no relatório a taxa de aprovação e rejeição e em seguida traz a taxa de aprovadas e rejeitadas, acaba se repetindo, me explique por que decidiu mostrar as duas, o mesmo acontece quando vc traz a porcentagem formatada, são linhas a mais que não agregam"). Isto forçou o modelo a rever a estrutura de dados e a devolver um payload mais enxuto e estritamente necessário para o consumo.

## Como foi garantido o entendimento do código

O código gerado iterativamente foi sujeito a um ciclo contínuo de validação técnica e de negócio:

- Revisão Crítica de Segurança (Code Review): Análise atenta aos módulos importados, o que me permitiu barrar a leitura de caminhos de ficheiros na API e impor a injeção estrita de dados via memória (req.body).

- Validação de Regras de Negócio e Testes: Execução de cenários de teste reais, utilizando o cliente HTTP Insomnia e um guião documentado (api_tests.http), para garantir que o motor de cálculo respeitava a tolerância de R$ 0,05 e que filtros complexos como o pending_balance=true devolviam a intersecção correta.

- Inspeção de Persistência: Monitorização das transações diretamente no PostgreSQL (via Prisma Studio) para garantir a veracidade da idempotência — validando que os reenvios atualizavam os itens sem causar duplicações ou falhas de chave estrangeira.