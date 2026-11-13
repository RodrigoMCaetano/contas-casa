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
