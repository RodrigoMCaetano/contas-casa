# Contas da Casa

App de celular (PWA) para acompanhar as contas da casa: o que vence no mês, o que já foi pago, contas fixas e parcelamentos. Os dados ficam no Firebase (Firestore) e sincronizam entre os aparelhos; o app também abre sem internet.

## Telas

- **Mês**: contas do mês por vencimento, com total, pago, falta pagar e sobra da renda.
- **Filtro por dono**: cada conta é de uma pessoa ou dos dois; o filtro no topo vale para Mês, Futuro e Fixas.
- **Futuro**: quanto já está comprometido nos próximos 12 meses e os parcelamentos em andamento.
- **Fixas**: contas que se repetem todo mês ou todo ano.
- **Mais**: renda mensal, backup (exportar JSON) e sair.

## Como funciona

- HTML, CSS e JavaScript puros, sem etapa de build. Publicado pelo GitHub Pages a partir da branch `main`.
- `logic.js` tem as regras (datas, parcelas, totais) e é testado com `node --test tests/logic.test.mjs`.
- `store-firebase.js` cuida do login e do banco. O acesso é restrito pelas regras do Firestore aos usuários da casa.
- Abrir com `?demo` no fim do endereço mostra dados de exemplo, sem login e sem salvar nada.
- Ao mudar arquivos do app, aumente o número em `CACHE` no `sw.js` para os celulares pegarem a versão nova.
