// Rode com: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../logic.js';

test('meses', () => {
  assert.equal(L.somaMes('2026-11', 2), '2027-01');
  assert.equal(L.somaMes('2026-01', -1), '2025-12');
  assert.equal(L.somaMes('2026-03', -15), '2024-12');
  assert.equal(L.diffMeses('2026-08', '2026-11'), 3);
  assert.equal(L.diffMeses('2026-11', '2027-02'), 3);
  assert.equal(L.dataVenc('2027-02', 31), '2027-02-28');
  assert.equal(L.dataVenc('2028-02', 30), '2028-02-29');
  assert.equal(L.dataVenc('2026-11', 5), '2026-11-05');
  assert.equal(L.diasEntre('2026-11-13', '2026-11-10'), -3);
  assert.equal(L.diasEntre('2026-12-30', '2027-01-02'), 3);
  assert.equal(L.nomeMes('2026-11'), 'Novembro 2026');
});

test('valores', () => {
  assert.equal(L.parseValor('1.234,56'), 123456);
  assert.equal(L.parseValor('R$ 99,9'), 9990);
  assert.equal(L.parseValor('1234.56'), 123456);
  assert.equal(L.parseValor('1.500'), 150000);
  assert.equal(L.parseValor('1500'), 150000);
  assert.equal(L.parseValor('0,07'), 7);
  assert.equal(L.parseValor('19,99'), 1999);
  assert.equal(L.parseValor(''), null);
  assert.equal(L.parseValor('abc'), null);
  assert.equal(L.parseValor('1,2,3'), null);
  assert.match(L.fmtValor(123456), /1\.234,56/);
  assert.equal(L.valorParaCampo(9990), '99,90');
});

const dados = {
  config: {},
  recorrentes: [
    { id: 'a', nome: 'Aluguel', valor: 100000, dia: 10, tipo: 'mensal', desde: '2026-10' },
    { id: 'i', nome: 'IPVA', valor: 50000, dia: 31, tipo: 'anual', mes: 2, desde: '2026-10' },
    { id: 'v', nome: 'Velha', valor: 1000, dia: 1, tipo: 'mensal', desde: '2026-01', ate: '2026-10' },
  ],
  parcelamentos: [{ id: 'g', nome: 'Geladeira', valorParcela: 30000, dia: 8, total: 10, inicio: '2026-08' }],
  contas: [
    { id: 'r_a_2026-11', nome: 'Aluguel', valor: 105000, mes: '2026-11', venc: '2026-11-10', pago: true, origem: 'recorrente', origemId: 'a' },
    { id: 'x1', nome: 'Avulsa', valor: 2000, mes: '2026-11', venc: '2026-11-20', pago: false, origem: 'avulsa' },
    { id: 'p_g_5', nome: 'Geladeira', valor: 30000, mes: '2026-12', venc: '2026-12-08', ignorada: true, origem: 'parcela', origemId: 'g' },
  ],
};

test('lista do mês junta gravadas e geradas, sem duplicar', () => {
  const nov = L.contasDoMes(dados, '2026-11');
  assert.deepEqual(nov.map((c) => c.id), ['p_g_4', 'r_a_2026-11', 'x1']);
  assert.equal(nov[0].parcelaN, 4);
  assert.equal(nov[0].virtual, true);
  assert.equal(nov[1].valor, 105000, 'vale o valor editado no mês, não o da fixa');
  const r = L.resumo(nov, 300000);
  assert.deepEqual(r, { total: 137000, pago: 105000, falta: 32000, sobra: 163000 });
  assert.equal(L.resumo(nov, 0).sobra, null);
});

test('fixa respeita início, fim, anual e mês pulado', () => {
  assert.deepEqual(L.contasDoMes(dados, '2026-09').map((c) => c.id), ['r_v_2026-09', 'p_g_2']);
  assert.deepEqual(L.contasDoMes(dados, '2026-12').map((c) => c.id), ['r_a_2026-12'], 'parcela 5 foi pulada');
  const fev = L.contasDoMes(dados, '2027-02');
  assert.deepEqual(fev.map((c) => c.id), ['p_g_7', 'r_a_2027-02', 'r_i_2027-02']);
  assert.equal(fev[2].venc, '2027-02-28');
  assert.equal(L.contasDoMes(dados, '2027-06').length, 1, 'parcelamento terminou em maio');
  assert.equal(L.fimParcelamento(dados.parcelamentos[0]), '2027-05');
  assert.equal(L.parcelaNoMes(dados.parcelamentos[0], '2026-07'), 0);
  const novo = { ...dados.parcelamentos[0], desde: '2026-11' };
  assert.equal(L.parcelaNoMes(novo, '2026-10'), 0, 'antes do cadastro não gera conta');
  assert.equal(L.parcelaNoMes(novo, '2026-11'), 4);
});

test('status', () => {
  const c = { venc: '2026-11-15', pago: false };
  assert.equal(L.status(c, '2026-11-16').tipo, 'atrasada');
  assert.equal(L.status(c, '2026-11-16').texto, 'Atrasada há 1 dia');
  assert.equal(L.status(c, '2026-11-15').texto, 'Vence hoje');
  assert.equal(L.status(c, '2026-11-12').texto, 'Vence em 3 dias');
  assert.equal(L.status(c, '2026-11-11').tipo, 'aberta');
  assert.equal(L.status({ ...c, pago: true }, '2026-11-30').tipo, 'paga');
});

test('projeção e gravação', () => {
  const p = L.projecao(dados, '2026-11', 3);
  assert.deepEqual(p.map((x) => x.total), [137000, 100000, 130000]);
  assert.deepEqual(p[0], { mes: '2026-11', total: 137000, fixas: 105000, parcelas: 30000, avulsas: 2000 });
  assert.deepEqual(L.paraGravar({ id: 'z', virtual: true, nome: 'n' }), { nome: 'n' });
});

test('dono das contas e filtro', () => {
  const d = {
    recorrentes: [
      { id: 'a', nome: 'Aluguel', valor: 1000, dia: 10, tipo: 'mensal' },
      { id: 'c', nome: 'Celular', valor: 300, dia: 5, tipo: 'mensal', dono: 'u1' },
    ],
    parcelamentos: [{ id: 'g', nome: 'Curso', valorParcela: 200, dia: 8, total: 3, inicio: '2026-11', dono: 'u2' }],
    contas: [
      { id: 'x', nome: 'Avulsa', valor: 50, mes: '2026-11', venc: '2026-11-20', dono: 'u1', origem: 'avulsa' },
      { id: 'r_c_2026-12', nome: 'Celular', valor: 300, mes: '2026-12', venc: '2026-12-05', dono: 'casa', origem: 'recorrente', origemId: 'c' },
    ],
  };
  const nov = L.contasDoMes(d, '2026-11');
  assert.deepEqual(nov.map((c) => [c.nome, c.dono || 'casa']),
    [['Celular', 'u1'], ['Curso', 'u2'], ['Aluguel', 'casa'], ['Avulsa', 'u1']]);
  assert.deepEqual(L.filtrar(nov, 'u1').map((c) => c.nome), ['Celular', 'Avulsa']);
  assert.deepEqual(L.filtrar(nov, 'casa').map((c) => c.nome), ['Aluguel']);
  assert.equal(L.filtrar(nov, 'tudo').length, 4);
  assert.deepEqual(L.porDono(nov), [{ dono: 'casa', total: 1000 }, { dono: 'u1', total: 350 }, { dono: 'u2', total: 200 }]);
  assert.deepEqual(L.projecao(d, '2026-11', 2, 'u1').map((p) => p.total), [350, 0], 'em dezembro o celular foi mudado para dos dois');
  assert.deepEqual(L.projecao(d, '2026-11', 2).map((p) => p.total), [1550, 1500]);
  assert.equal(L.nomeDono('casa', {}), 'Dos dois');
  assert.equal(L.nomeDono('u1', { u1: 'Rodrigo' }), 'Rodrigo');
  assert.equal(L.nomePadrao('julia.silva22@gmail.com'), 'Julia');
  assert.equal(L.nomePadrao('123@x.com'), 'Eu');
});

test('gastos do dia a dia', () => {
  const d = { gastos: [
    { id: '1', descricao: 'Lanche', valor: 4500, data: '2026-11-13', mes: '2026-11', categoria: 'Alimentação', dono: 'u1', criadoEm: 1 },
    { id: '2', descricao: 'Uber', valor: 1800, data: '2026-11-13', mes: '2026-11', categoria: 'Transporte', criadoEm: 2 },
    { id: '3', descricao: 'Padaria', valor: 1200, data: '2026-11-12', mes: '2026-11', categoria: 'Alimentação', criadoEm: 3 },
    { id: '4', descricao: 'Cinema', valor: 6000, data: '2026-10-30', mes: '2026-10', categoria: 'Lazer' },
  ] };
  const nov = L.gastosDoMes(d, '2026-11');
  assert.deepEqual(nov.map((g) => g.id), ['2', '1', '3'], 'mais recente primeiro');
  assert.equal(L.somar(nov), 7500);
  assert.deepEqual(L.gastosDoMes(d, '2026-11', 'u1').map((g) => g.id), ['1']);
  assert.deepEqual(L.gastosDoMes(d, '2026-11', 'casa').map((g) => g.id), ['2', '3']);
  assert.deepEqual(L.porCategoria(nov), [{ categoria: 'Alimentação', total: 5700 }, { categoria: 'Transporte', total: 1800 }]);
  assert.deepEqual(L.porDia(nov).map((x) => [x.data, x.total, x.itens.length]), [['2026-11-13', 6300, 2], ['2026-11-12', 1200, 1]]);
  assert.equal(L.rotuloDia('2026-11-13', '2026-11-13'), 'Hoje');
  assert.equal(L.rotuloDia('2026-11-12', '2026-11-13'), 'Ontem');
  assert.equal(L.rotuloDia('2026-11-10', '2026-11-13'), 'ter, 10/11');
  assert.equal(L.gastosDoMes({}, '2026-11').length, 0);
  assert.equal(L.resumo([{ valor: 1000 }], 5000, 700).sobra, 3300);
});

test('sugestões e backup', () => {
  const gastos = [
    { descricao: 'Lanche', categoria: 'Alimentação', data: '2026-11-10' },
    { descricao: 'lanche ', categoria: 'Lazer', data: '2026-11-12' },
    { descricao: 'Uber', categoria: 'Transporte', data: '2026-11-11' },
  ];
  assert.deepEqual(L.sugestoesGasto(gastos), [{ descricao: 'lanche', categoria: 'Lazer' }, { descricao: 'Uber', categoria: 'Transporte' }]);
  assert.equal(L.dataCurta('2026-11-03'), '03/11');
  assert.ok(L.lerBackup('nada').erro);
  assert.ok(L.lerBackup('{"a":1}').erro);
  assert.ok(L.lerBackup('{"contas":[{"nome":"sem id"}]}').erro);
  const ok = L.lerBackup(JSON.stringify({ exportadoEm: 'x', contas: [{ id: 'c1', nome: 'A' }], gastos: [{ id: 'g1', valor: 5 }], config: { renda: 9 } }));
  assert.deepEqual(ok.itens, [['contas', 'c1', { nome: 'A' }], ['gastos', 'g1', { valor: 5 }], ['config', 'geral', { renda: 9 }]]);
});

test('lembrete de vencimento', () => {
  const hoje = '2026-11-13';
  const contas = [
    { nome: 'Luz', valor: 24000, venc: '2026-11-13' },
    { nome: 'Internet', valor: 9990, venc: '2026-11-14', dono: 'u1' },
    { nome: 'Cartão', valor: 50000, venc: '2026-10-28' },
    { nome: 'Da Julia', valor: 1000, venc: '2026-11-13', dono: 'u2' },
    { nome: 'Já paga', valor: 1000, venc: '2026-11-13', pago: true },
    { nome: 'Longe', valor: 1000, venc: '2026-11-25' },
  ];
  const l = L.lembrete(contas, hoje, 'u1');
  assert.equal(l.titulo, '1 conta vence hoje · 1 conta vence amanhã · 1 conta atrasada');
  assert.match(l.corpo, /^Luz R\$\s240,00 · Internet R\$\s99,90 · Cartão R\$\s500,00$/);
  assert.equal(L.lembrete(contas, hoje, 'u2').titulo, '2 contas vencem hoje · 1 conta atrasada');
  assert.equal(L.lembrete(contas, '2026-11-20', 'u2').titulo, '3 contas atrasadas');
  assert.equal(L.lembrete(contas, '2026-11-26', 'u1').titulo, '4 contas atrasadas');
  assert.match(L.lembrete(contas, '2026-11-26', 'u1').corpo, / · e mais 1$/);
  assert.equal(L.lembrete([contas[5]], hoje, 'u1'), null);
  assert.equal(L.lembrete([], hoje, 'u1'), null);
});

test('categorias e gráficos', () => {
  assert.deepEqual(L.categoriasDe('gasto', { categoriasExtras: ['Pet', 'lazer'] }, 'Antiga'),
    ['Alimentação', 'Mercado', 'Transporte', 'Lazer', 'Compras', 'Pet', 'Antiga', 'Outros']);
  assert.equal(L.categoriasDe('conta').at(-1), 'Outros');
  assert.equal(L.categoriasDe('conta', {}, 'Outros').filter((c) => c === 'Outros').length, 1);
  assert.equal(L.normalizarCategoria('  pet  shop ', ['Lazer']), 'Pet shop');
  assert.equal(L.normalizarCategoria('LAZER', ['Lazer']), 'Lazer');
  assert.equal(L.normalizarCategoria('   ', []), null);
  const d = {
    recorrentes: [{ id: 'a', nome: 'Aluguel', valor: 100000, dia: 10, tipo: 'mensal', categoria: 'Moradia', desde: '2026-10' }],
    contas: [{ id: 'x', nome: 'Avulsa', valor: 5000, mes: '2026-11', venc: '2026-11-20', categoria: 'Mercado', origem: 'avulsa' }],
    gastos: [{ id: 'g', descricao: 'Feira', valor: 7000, data: '2026-11-03', mes: '2026-11', categoria: 'Mercado' }],
  };
  assert.deepEqual(L.serieMeses(d, '2026-11', 3), [
    { mes: '2026-09', contas: 0, gastos: 0, total: 0 },
    { mes: '2026-10', contas: 100000, gastos: 0, total: 100000 },
    { mes: '2026-11', contas: 105000, gastos: 7000, total: 112000 },
  ]);
  assert.deepEqual(L.saidasPorCategoria(d, '2026-11'), [{ categoria: 'Moradia', total: 100000 }, { categoria: 'Mercado', total: 12000 }]);
  assert.deepEqual(L.escala(112000), { topo: 150000, marcas: [50000, 100000, 150000] });
  assert.deepEqual(L.escala(650000), { topo: 800000, marcas: [200000, 400000, 600000, 800000] });
  assert.deepEqual(L.escala(0).marcas.length, 2);
  assert.match(L.fmtCompacto(345000), /^R\$ 3,5 mil$/);
  assert.equal(L.fmtCompacto(85000), 'R$ 850');
});

test('renda por pessoa, divisão e parte de cada um', () => {
  assert.equal(L.rendaCasa({ renda: 5000 }), 5000, 'renda única antiga');
  assert.equal(L.rendaCasa({ renda: 5000, rendas: { a: 6000, b: 4000 } }), 10000);
  assert.equal(L.rendaCasa({}), 0);
  const uids = ['a', 'b'];
  assert.equal(L.cota({}, 'a', uids), 0.5);
  assert.equal(L.cota({ divisao: 'proporcional', rendas: { a: 6000, b: 4000 } }, 'a', uids), 0.6);
  assert.equal(L.cota({ divisao: 'proporcional' }, 'a', uids), 0.5, 'sem rendas, divide igual');
  assert.equal(L.cota({}, 'x', uids), 0);
  const lista = [{ valor: 1000 }, { valor: 300, dono: 'a' }, { valor: 200, dono: 'b' }];
  assert.equal(L.parteDe(lista, 'a', 0.6), 900);
  assert.equal(L.parteDe(lista, 'b', 0.4), 600);
});

test('quanto dá para gastar hoje', () => {
  // dia 21 de novembro: faltam 10 dias contando hoje
  const base = { renda: 500000, contas: 300000, gastosAVista: 100000, gastosHoje: 0, hoje: '2026-11-21' };
  assert.deepEqual(L.podeGastar(base), { livre: 100000, dias: 10, porDia: 10000, hoje: 10000, noVermelho: false });
  // gastar 40 hoje não muda a cota do dia, só o que resta dela
  assert.deepEqual(L.podeGastar({ ...base, gastosAVista: 104000, gastosHoje: 4000 }), { livre: 96000, dias: 10, porDia: 10000, hoje: 6000, noVermelho: false });
  // passou da cota do dia
  assert.equal(L.podeGastar({ ...base, gastosAVista: 115000, gastosHoje: 15000 }).hoje, 0);
  const vermelho = L.podeGastar({ ...base, gastosAVista: 250000 });
  assert.equal(vermelho.noVermelho, true); assert.equal(vermelho.hoje, 0); assert.equal(vermelho.livre, -50000);
  assert.equal(L.podeGastar({ ...base, hoje: '2026-11-30' }).dias, 1);
  assert.equal(L.podeGastar({ ...base, renda: 0 }), null);
});

test('cartão, parcelas na fatura e metas', () => {
  assert.equal(L.aVista({}), true); assert.equal(L.aVista({ pagamento: 'cartao' }), false);
  const d = {
    parcelamentos: [
      { id: 'tv', nome: 'TV', valorParcela: 20000, dia: 8, total: 10, inicio: '2026-11', naFatura: true },
      { id: 'so', nome: 'Sofá', valorParcela: 10000, dia: 8, total: 3, inicio: '2026-11' },
    ],
    recorrentes: [{ id: 'ip', nome: 'IPVA', valor: 120000, dia: 20, tipo: 'anual', mes: 1 }],
    metas: [{ id: 'r', nome: 'Reserva', alvo: 100000, mensal: 30000, dia: 5, guardado: 20000, desde: '2026-11' }],
    contas: [
      { id: 'm_r_2026-11', nome: 'Meta: Reserva', valor: 30000, mes: '2026-11', venc: '2026-11-05', pago: true, origem: 'meta', origemId: 'r' },
      { id: 'm_r_2026-12', nome: 'Meta: Reserva', valor: 50000, mes: '2026-12', venc: '2026-12-05', pago: true, origem: 'meta', origemId: 'r' },
    ],
  };
  assert.deepEqual(L.contasDoMes(d, '2026-11').map((c) => c.id), ['m_r_2026-11', 'p_so_1'], 'parcela na fatura não vira conta');
  assert.equal(L.parcelasDoMes(d, '2026-11'), 30000, 'mas conta no total de parcelas');
  assert.equal(L.parcelasDoMes(d, '2027-03'), 20000);
  assert.equal(L.totalAnuais(d.recorrentes), 120000);
  assert.equal(L.guardadoMeta(d, d.metas[0]), 100000);
  assert.equal(L.contasDoMes(d, '2026-10').some((c) => c.origem === 'meta'), false, 'antes de criar a meta');
  assert.equal(L.contasDoMes(d, '2027-01').some((c) => c.origem === 'meta'), false, 'meta atingida para de gerar');
  const aberta = { ...d, contas: [d.contas[0]] };
  const jan = L.contasDoMes(aberta, '2027-01').find((c) => c.origem === 'meta');
  assert.deepEqual([jan.id, jan.nome, jan.valor, jan.categoria], ['m_r_2027-01', 'Meta: Reserva', 30000, 'Metas']);
});

test('acerto de contas do casal', () => {
  const d = {
    contas: [
      { id: '1', nome: 'Aluguel', valor: 100000, mes: '2026-11', venc: '2026-11-10', pago: true, pagoPorUid: 'a' },
      { id: '2', nome: 'Luz', valor: 20000, mes: '2026-11', venc: '2026-11-15', pago: true, pagoPorUid: 'b' },
      { id: '3', nome: 'Só do A', valor: 9999, mes: '2026-11', venc: '2026-11-15', pago: true, pagoPorUid: 'a', dono: 'a' },
      { id: '4', nome: 'Não paga', valor: 5000, mes: '2026-11', venc: '2026-11-20' },
      { id: '5', nome: 'Paga sem saber por quem', valor: 7000, mes: '2026-11', venc: '2026-11-20', pago: true },
    ],
    gastos: [{ id: 'g', descricao: 'Mercado', valor: 30000, data: '2026-11-03', mes: '2026-11', pagoPorUid: 'b' }],
  };
  // dos dois: 1500 no total; A pagou 1000, B pagou 500; meio a meio = 750 cada
  assert.deepEqual(L.acerto(d, '2026-11', ['a', 'b'], {}),
    { total: 150000, pagos: { a: 100000, b: 50000 }, credor: 'a', devedor: 'b', valor: 25000 });
  // proporcional 60/40: A deveria pagar 900, pagou 1000 -> B deve 100
  assert.equal(L.acerto(d, '2026-11', ['a', 'b'], { divisao: 'proporcional', rendas: { a: 6000, b: 4000 } }).valor, 10000);
  // proporcional 80/20: A deveria pagar 1200, pagou 1000 -> A deve 200
  const inv = L.acerto(d, '2026-11', ['a', 'b'], { divisao: 'proporcional', rendas: { a: 8000, b: 2000 } });
  assert.deepEqual([inv.devedor, inv.credor, inv.valor], ['a', 'b', 20000]);
  assert.equal(L.acerto(d, '2026-10', ['a', 'b'], {}), null);
  assert.equal(L.acerto(d, '2026-11', ['a'], {}), null);
});

test('avisos da semana e de fechamento', () => {
  assert.equal(L.somaDias('2026-11-02', -7), '2026-10-26');
  assert.equal(L.somaDias('2026-12-31', 1), '2027-01-01');
  assert.equal(L.diaDaSemana('2026-11-16'), 1);
  const d = { gastos: [
    { descricao: 'A', valor: 5000, data: '2026-11-09', mes: '2026-11', categoria: 'Mercado' },
    { descricao: 'B', valor: 2000, data: '2026-11-15', mes: '2026-11', categoria: 'Lazer', dono: 'u1' },
    { descricao: 'Da outra pessoa', valor: 9000, data: '2026-11-12', mes: '2026-11', categoria: 'Lazer', dono: 'u2' },
    { descricao: 'Hoje não entra', valor: 800, data: '2026-11-16', mes: '2026-11', categoria: 'Lazer' },
    { descricao: 'Velho', valor: 800, data: '2026-11-08', mes: '2026-11', categoria: 'Lazer' },
    { descricao: 'Outubro', valor: 10000, data: '2026-10-08', mes: '2026-10', categoria: 'Lazer' },
  ] };
  const s = L.resumoSemana(d, '2026-11-16', 'u1');
  assert.match(s.titulo, /^Semana: R\$\s70,00 em gastos do dia a dia$/);
  assert.match(s.corpo, /^2 lançamentos\. Maior categoria: Mercado \(R\$\s50,00\)\.$/);
  assert.equal(L.resumoSemana({ gastos: [] }, '2026-11-16', 'u1'), null);
  const f = L.fechamento(d, '2026-12-01');
  assert.match(f.titulo, /^Novembro fechou em R\$\s176,00$/);
  assert.match(f.corpo, /76% a mais que no mês anterior\.$/);
  assert.equal(L.fechamento({ gastos: [] }, '2026-12-01'), null);
});
