// Regras de negócio puras (sem Firebase, sem DOM) — testáveis com Node.

export const CATEGORIAS = ['Moradia', 'Transporte', 'Cartão', 'Assinaturas', 'Mercado', 'Outros'];

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const p2 = (n) => String(n).padStart(2, '0');

export function mesDe(d) { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; }
export function hojeStr(d = new Date()) { return `${mesDe(d)}-${p2(d.getDate())}`; }

export function somaMes(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${p2((t % 12) + 1)}`;
}

export function diffMeses(de, ate) {
  const [a1, m1] = de.split('-').map(Number);
  const [a2, m2] = ate.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

export function diasNoMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return new Date(a, m, 0).getDate();
}

// Dia 31 em mês de 30 dias vira dia 30 (e 28/29 em fevereiro).
export function dataVenc(mes, dia) {
  const d = Math.min(Math.max(1, Number(dia) || 1), diasNoMes(mes));
  return `${mes}-${p2(d)}`;
}

export function diasEntre(de, ate) {
  const utc = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((utc(ate) - utc(de)) / 864e5);
}

export function nomeMes(mes, curto = false) {
  const [a, m] = mes.split('-').map(Number);
  return curto ? `${MESES[m - 1].slice(0, 3)}/${String(a).slice(2)}` : `${MESES[m - 1]} ${a}`;
}
export function nomeMesNum(m) { return MESES[m - 1]; }

// "1.234,56", "1234.56", "R$ 99,9", "1.500" -> centavos. Inválido -> null.
export function parseValor(texto) {
  let s = String(texto ?? '').replace(/[^\d.,]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function fmtValor(centavos) {
  return ((centavos || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
export function valorParaCampo(centavos) {
  return ((centavos || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// De quem é a conta: 'casa' (dos dois) ou o uid de uma pessoa. Sem marcação = dos dois.
export function donoDe(x) { return x?.dono || 'casa'; }
export function filtrar(lista, filtro) {
  return !filtro || filtro === 'tudo' ? lista : lista.filter((x) => donoDe(x) === filtro);
}
export function nomeDono(dono, pessoas = {}) {
  return dono === 'casa' ? 'Dos dois' : (pessoas[dono] || 'Outra pessoa');
}
// Total por dono, na ordem: dos dois, depois as pessoas.
export function porDono(lista) {
  const mapa = new Map();
  for (const c of lista) mapa.set(donoDe(c), (mapa.get(donoDe(c)) || 0) + (c.valor || 0));
  return [...mapa].map(([dono, total]) => ({ dono, total }))
    .sort((a, b) => (a.dono === 'casa' ? -1 : b.dono === 'casa' ? 1 : a.dono.localeCompare(b.dono)));
}
export function nomePadrao(email) {
  const n = (String(email || '').split('@')[0].match(/^[a-zA-ZÀ-ÿ]+/) || ['Eu'])[0];
  return n[0].toUpperCase() + n.slice(1).toLowerCase();
}

export function recorrenteValeNoMes(r, mes) {
  if (r.desde && mes < r.desde) return false;
  if (r.ate && mes > r.ate) return false;
  if (r.tipo === 'anual') return Number(mes.split('-')[1]) === Number(r.mes);
  return true;
}

export function parcelaNoMes(p, mes) {
  const n = diffMeses(p.inicio, mes) + 1;
  return n >= 1 && n <= p.total ? n : 0;
}
export function fimParcelamento(p) { return somaMes(p.inicio, p.total - 1); }

// Lista do mês = contas gravadas + contas "virtuais" geradas a partir das fixas
// e dos parcelamentos. A virtual só é gravada quando alguém a paga ou edita,
// sempre com o mesmo id, então dois celulares nunca criam a conta em dobro.
export function contasDoMes(dados, mes) {
  const reais = new Map();
  for (const c of dados.contas || []) if (c.mes === mes) reais.set(c.id, c);
  const lista = [...reais.values()].filter((c) => !c.ignorada);

  for (const r of dados.recorrentes || []) {
    if (!recorrenteValeNoMes(r, mes)) continue;
    const id = `r_${r.id}_${mes}`;
    if (reais.has(id)) continue;
    lista.push({
      id, virtual: true, nome: r.nome, valor: r.valor, mes, venc: dataVenc(mes, r.dia),
      categoria: r.categoria, dono: donoDe(r), pago: false, origem: 'recorrente', origemId: r.id,
    });
  }
  for (const p of dados.parcelamentos || []) {
    const n = parcelaNoMes(p, mes);
    if (!n) continue;
    const id = `p_${p.id}_${n}`;
    if (reais.has(id)) continue;
    lista.push({
      id, virtual: true, nome: p.nome, valor: p.valorParcela, mes, venc: dataVenc(mes, p.dia),
      categoria: p.categoria, dono: donoDe(p), pago: false, origem: 'parcela', origemId: p.id,
      parcelaN: n, parcelaTotal: p.total,
    });
  }
  return lista.sort((a, b) => a.venc.localeCompare(b.venc) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function status(conta, hoje) {
  if (conta.pago) return { tipo: 'paga', texto: 'Paga' };
  const d = diasEntre(hoje, conta.venc);
  const dia = `dia ${Number(conta.venc.slice(8))}`;
  if (d < 0) return { tipo: 'atrasada', texto: `Atrasada há ${-d} ${d === -1 ? 'dia' : 'dias'}` };
  if (d === 0) return { tipo: 'vence', texto: 'Vence hoje' };
  if (d <= 3) return { tipo: 'vence', texto: `Vence em ${d} ${d === 1 ? 'dia' : 'dias'}` };
  return { tipo: 'aberta', texto: `Vence ${dia}` };
}

export function resumo(lista, renda) {
  let total = 0, pago = 0;
  for (const c of lista) { total += c.valor || 0; if (c.pago) pago += c.valor || 0; }
  return { total, pago, falta: total - pago, sobra: renda ? renda - total : null };
}

export function projecao(dados, mesInicial, n, filtro = 'tudo') {
  const out = [];
  for (let i = 0; i < n; i++) {
    const mes = somaMes(mesInicial, i);
    const item = { mes, total: 0, fixas: 0, parcelas: 0, avulsas: 0 };
    for (const c of filtrar(contasDoMes(dados, mes), filtro)) {
      const v = c.valor || 0;
      item.total += v;
      if (c.origem === 'recorrente') item.fixas += v;
      else if (c.origem === 'parcela') item.parcelas += v;
      else item.avulsas += v;
    }
    out.push(item);
  }
  return out;
}

// Tira campos que não vão para o banco.
export function paraGravar(conta) {
  const { virtual, id, ...resto } = conta;
  return resto;
}
