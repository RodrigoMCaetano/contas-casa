// Modo demonstração (abra com ?demo): dados de exemplo só na memória, nada é salvo.
import { mesDe, somaMes, dataVenc, hojeStr } from './logic.js';

const mes = mesDe(new Date());
const dados = {
  config: { renda: 650000, pessoas: { demo: 'Rodrigo', j: 'Julia' } },
  recorrentes: [
    { id: 'r1', nome: 'Aluguel', valor: 180000, dia: 10, categoria: 'Moradia', tipo: 'mensal', desde: somaMes(mes, -3) },
    { id: 'r2', nome: 'Internet', valor: 9990, dia: 15, categoria: 'Moradia', tipo: 'mensal', desde: somaMes(mes, -3) },
    { id: 'r3', nome: 'Energia (estimativa)', valor: 24000, dia: 20, categoria: 'Moradia', tipo: 'mensal', desde: somaMes(mes, -3) },
    { id: 'r4', nome: 'Streaming', valor: 5590, dia: 5, categoria: 'Assinaturas', tipo: 'mensal', dono: 'j', desde: somaMes(mes, -3) },
    { id: 'r5', nome: 'IPVA', valor: 142000, dia: 20, categoria: 'Transporte', tipo: 'anual', mes: 1, desde: somaMes(mes, -3) },
  ],
  parcelamentos: [
    { id: 'p1', nome: 'Geladeira', valorParcela: 32900, dia: 8, categoria: 'Cartão', total: 10, inicio: somaMes(mes, -3) },
    { id: 'p2', nome: 'Notebook', valorParcela: 45000, dia: 8, categoria: 'Cartão', total: 12, dono: 'demo', inicio: somaMes(mes, -9) },
  ],
  gastos: [
    { id: 'g1', descricao: 'Lanche', valor: 5400, data: hojeStr(), mes, categoria: 'Alimentação', dono: 'casa', criadoEm: 3 },
    { id: 'g2', descricao: 'Uber', valor: 1890, data: hojeStr(), mes, categoria: 'Transporte', dono: 'demo', criadoEm: 2 },
    { id: 'g3', descricao: 'Mercado da semana', valor: 31250, data: dataVenc(mes, 2), mes, categoria: 'Mercado', dono: 'casa', criadoEm: 1 },
    { id: 'g4', descricao: 'Farmácia', valor: 4700, data: dataVenc(mes, 1), mes, categoria: 'Outros', dono: 'j', criadoEm: 0 },
  ],
  contas: [
    { id: `r_r4_${mes}`, nome: 'Streaming', valor: 5590, mes, venc: dataVenc(mes, 5), categoria: 'Assinaturas', dono: 'j', pago: true, pagoEm: dataVenc(mes, 4), origem: 'recorrente', origemId: 'r4' },
    { id: `r_r1_${mes}`, nome: 'Aluguel', valor: 180000, mes, venc: dataVenc(mes, 10), categoria: 'Moradia', pago: true, pagoEm: dataVenc(mes, 9), origem: 'recorrente', origemId: 'r1' },
    { id: 'a1', nome: 'Revisão do carro', valor: 38000, mes, venc: dataVenc(mes, 25), categoria: 'Transporte', dono: 'demo', pago: false, origem: 'avulsa' },
  ],
};

let ouvinte = null;
let n = 0;
const avisar = () => ouvinte?.(structuredClone(dados));

export default {
  demo: true,
  onAuth(cb) { cb({ uid: 'demo', email: 'demo@exemplo' }); return () => {}; },
  async login() {},
  async logout() {},
  subscribe(cb) { ouvinte = cb; avisar(); return () => { ouvinte = null; }; },
  novoId() { return `d${++n}`; },
  gravar(col, id, novo) {
    if (col === 'config') dados.config = { ...dados.config, ...novo, pessoas: { ...dados.config.pessoas, ...novo.pessoas } };
    else {
      const i = dados[col].findIndex((x) => x.id === id);
      if (i >= 0) dados[col][i] = { ...dados[col][i], ...novo };
      else dados[col].push({ id, ...novo });
    }
    avisar();
  },
  apagar(col, id) { dados[col] = dados[col].filter((x) => x.id !== id); avisar(); },
};
