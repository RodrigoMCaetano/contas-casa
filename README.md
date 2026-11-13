# Contas da Casa

App de celular (PWA) para acompanhar as contas da casa: o que vence no mês, o que já foi pago, contas fixas e parcelamentos. Os dados ficam no Firebase (Firestore) e sincronizam entre os aparelhos; o app também abre sem internet.

## Telas

- **Início**: sobra do mês, próximos vencimentos, atalhos para lançar gasto ou conta e gráficos (saídas por mês e por categoria).
- **Contas**: contas do mês por vencimento, com total, pago e falta pagar.
- **Gastos**: compras do dia a dia (lanche, mercado, combustível), por dia e por categoria, com limite mensal opcional.
- **Planejar**: contas fixas, parcelamentos e quanto já está comprometido nos próximos 12 meses.
- **Mais**: lembrete de vencimento, renda, limite de gastos, categorias próprias, seu nome, backup e sair.

Cada item é de uma pessoa ou dos dois, e o filtro no topo vale para Contas, Gastos e Planejar. Segurar o ícone do app no Android mostra os atalhos **Novo gasto** e **Nova conta**.

## Como funciona

- HTML, CSS e JavaScript puros, sem etapa de build. Publicado pelo GitHub Pages a partir da branch `main`.
- `logic.js` tem as regras (datas, parcelas, totais) e é testado com `node --test tests/logic.test.mjs`.
- `store-firebase.js` cuida do login e do banco. O acesso é restrito pelas regras do Firestore aos usuários da casa.
- Abrir com `?demo` no fim do endereço mostra dados de exemplo, sem login e sem salvar nada.
- Ao mudar arquivos do app, aumente o número em `CACHE` no `sw.js` para os celulares pegarem a versão nova.

## Lembrete de vencimento

Todo dia, por volta das 8h (horário de Brasília), o GitHub Actions roda `scripts/lembretes.mjs`, que lê as contas no Firestore e envia uma notificação aos celulares que ativaram o lembrete em **Mais**. Só chega aviso quando há conta vencendo hoje, amanhã ou atrasada.

- Precisa do segredo `FIREBASE_SERVICE_ACCOUNT` em **Settings → Secrets and variables → Actions**, com o conteúdo do arquivo de chave da conta de serviço do Firebase. Essa chave dá acesso total ao projeto: nunca a coloque no código.
- Para testar, abra a aba **Actions → Lembrete de vencimento → Run workflow** com a opção de teste marcada.
- O GitHub desativa tarefas agendadas de repositórios sem atividade por cerca de 60 dias. Se os lembretes pararem, reative na aba **Actions**.
- O registro de execução é público, por isso o script só imprime contagens, nunca nomes ou valores.
