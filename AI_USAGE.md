# AI_USAGE

## Ferramentas utilizadas

Descrever aqui quais ferramentas de IA foram utilizadas durante o desenvolvimento.

## Exemplo de prompt que funcionou

Descrever aqui um prompt que gerou um resultado útil, incluindo contexto e objetivo.

## Exemplo onde a IA errou e como foi validado

Durante a criação do BaseAdapter, a IA sugeriu o uso de blocos $transaction manuais com loops de upsert para salvar os itens do pedido. Ao revisar o código, percebi duas falhas. Primeiro, era uma complexidade desnecessária para o Prisma. Segundo, causava um erro de negócio: se um cliente reenviasse um pedido removendo um item que existia na carga anterior, o loop da IA não apagava esse item do banco de dados.
O que eu fiz: Descartei o loop manual gerado pela IA e reescrevi a persistência utilizando o upsert nativo do Prisma no objeto pai (Order), aplicando um deleteMany: {} seguido de um create nos itens durante o bloco de update. Isso simplificou o código drasticamente e garantiu o espelhamento real da carga reenviada. Também limpei queries cruas duplicadas que a IA havia gerado no arquivo de rotas.

Correção de vulnerabilidade de segurança no BetaAdapter
Durante a criação do adaptador para o formato CSV (Cliente Beta), a IA gerou uma solução que utilizava a biblioteca nativa fs do Node.js, permitindo que a API recebesse o caminho de um ficheiro no payload e o fosse ler diretamente ao disco.
Como resolvi: Identifiquei que esta abordagem abria uma falha grave de segurança (risco de Local File Inclusion). Rejeitei a implementação da IA, removi o módulo fs e refatorei o método adapt. Obriguei a API a aceitar exclusivamente as strings com o conteúdo do CSV já injetadas no req.body. Com isto, garanti que a responsabilidade de leitura do ficheiro fica no cliente que faz a requisição, mantendo o backend isolado, seguro e focado apenas na normalização dos dados.

## Como foi garantido o entendimento do código

Descrever aqui como o entendimento do código foi validado (leitura de arquivos, execução local, testes e revisão de mudanças).