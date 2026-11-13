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

// `desde` = mês em que o parcelamento foi cadastrado no app: parcelas anteriores a ele
// não viram contas (senão apareceriam como atrasadas logo no primeiro uso).
export function parcelaNoMes(p, mes) {
  if (p.desde && mes < p.desde) return 0;
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
    if (!n || p.naFatura) continue;   // parcela que já vem dentro da fatura do cartão não é conta à parte
    const id = `p_${p.id}_${n}`;
    if (reais.has(id)) continue;
    lista.push({
      id, virtual: true, nome: p.nome, valor: p.valorParcela, mes, venc: dataVenc(mes, p.dia),
      categoria: p.categoria, dono: donoDe(p), pago: false, origem: 'parcela', origemId: p.id,
      parcelaN: n, parcelaTotal: p.total,
    });
  }
  // O valor mensal de cada meta entra como uma conta ("guardar primeiro"), até a meta ser atingida.
  for (const m of dados.metas || []) {
    if (!m.mensal || (m.desde && mes < m.desde)) continue;
    const id = `m_${m.id}_${mes}`;
    if (reais.has(id) || (m.alvo && guardadoMeta(dados, m) >= m.alvo)) continue;
    lista.push({
      id, virtual: true, nome: `Meta: ${m.nome}`, valor: m.mensal, mes, venc: dataVenc(mes, m.dia || 1),
      categoria: 'Metas', dono: donoDe(m), pago: false, origem: 'meta', origemId: m.id,
    });
  }
  return lista.sort((a, b) => a.venc.localeCompare(b.venc) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Quanto já foi guardado: o valor inicial informado + os depósitos mensais marcados como pagos.
export function guardadoMeta(dados, m) {
  let total = m.guardado || 0;
  for (const c of dados.contas || []) {
    if (c.origem === 'meta' && c.origemId === m.id && c.pago && !c.ignorada) total += c.valor || 0;
  }
  return total;
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

// A sobra desconta as contas do mês e também os gastos do dia a dia.
export function resumo(lista, renda, gastos = 0) {
  let total = 0, pago = 0;
  for (const c of lista) { total += c.valor || 0; if (c.pago) pago += c.valor || 0; }
  return { total, pago, falta: total - pago, sobra: renda ? renda - total - gastos : null };
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

// ---------- Gastos do dia a dia ----------

export const CATEGORIAS_GASTO = ['Alimentação', 'Mercado', 'Transporte', 'Lazer', 'Compras', 'Outros'];

export function gastosDoMes(dados, mes, filtro = 'tudo') {
  return filtrar((dados.gastos || []).filter((g) => g.mes === mes), filtro)
    .sort((a, b) => b.data.localeCompare(a.data) || (b.criadoEm || 0) - (a.criadoEm || 0));
}
export function somar(lista) { return lista.reduce((s, x) => s + (x.valor || 0), 0); }

export function porCategoria(lista) {
  const mapa = new Map();
  for (const g of lista) mapa.set(g.categoria || 'Outros', (mapa.get(g.categoria || 'Outros') || 0) + (g.valor || 0));
  return [...mapa].map(([categoria, total]) => ({ categoria, total })).sort((a, b) => b.total - a.total);
}

// [{ data, total, itens }] do dia mais recente para o mais antigo.
export function porDia(lista) {
  const dias = [];
  for (const g of lista) {
    let d = dias[dias.length - 1];
    if (!d || d.data !== g.data) { d = { data: g.data, total: 0, itens: [] }; dias.push(d); }
    d.itens.push(g); d.total += g.valor || 0;
  }
  return dias;
}

export function rotuloDia(data, hoje) {
  const d = diasEntre(data, hoje);
  if (d === 0) return 'Hoje';
  if (d === 1) return 'Ontem';
  const [a, m, dia] = data.split('-').map(Number);
  const sem = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(Date.UTC(a, m - 1, dia)).getUTCDay()];
  return `${sem}, ${p2(dia)}/${p2(m)}`;
}

// Descrições já usadas (mais recentes primeiro), com a categoria que tinham.
export function sugestoesGasto(gastos, limite = 30) {
  const vistos = new Map();
  for (const g of [...(gastos || [])].sort((a, b) => b.data.localeCompare(a.data) || (b.criadoEm || 0) - (a.criadoEm || 0))) {
    const chave = (g.descricao || '').trim().toLowerCase();
    if (chave && !vistos.has(chave)) vistos.set(chave, { descricao: g.descricao.trim(), categoria: g.categoria });
    if (vistos.size >= limite) break;
  }
  return [...vistos.values()];
}

export function dataCurta(data) { const [, m, d] = data.split('-'); return `${d}/${m}`; }

// Confere um backup antes de restaurar. Devolve { itens: [[coleção, id, dados]], erro }.
export function lerBackup(texto) {
  let b;
  try { b = JSON.parse(texto); } catch { return { erro: 'O arquivo não é um backup válido.' }; }
  const cols = ['contas', 'recorrentes', 'parcelamentos', 'gastos', 'metas'];
  if (!b || typeof b !== 'object' || !cols.some((c) => Array.isArray(b[c]))) return { erro: 'O arquivo não é um backup deste app.' };
  const itens = [];
  for (const col of cols) {
    for (const x of b[col] || []) {
      if (!x || typeof x.id !== 'string' || !x.id) return { erro: 'O backup tem itens sem identificação.' };
      const { id, ...resto } = x;
      itens.push([col, id, resto]);
    }
  }
  if (b.config && typeof b.config === 'object') itens.push(['config', 'geral', b.config]);
  return { itens, exportadoEm: b.exportadoEm || null };
}

// ---------- Lembrete de vencimento ----------

// Monta o aviso do dia para uma pessoa. `contas` = contas do mês atual e do anterior.
// Devolve null quando não há nada vencendo hoje, amanhã ou atrasado.
export function lembrete(contas, hoje, uid) {
  const minhas = contas.filter((c) => !c.pago && (donoDe(c) === 'casa' || donoDe(c) === uid))
    .sort((a, b) => a.venc.localeCompare(b.venc));
  const grupo = (teste) => minhas.filter((c) => teste(diasEntre(hoje, c.venc)));
  const deHoje = grupo((d) => d === 0), deAmanha = grupo((d) => d === 1), atrasadas = grupo((d) => d < 0);
  const partes = [];
  const n = (lista, um, varios) => `${lista.length} ${lista.length === 1 ? um : varios}`;
  if (deHoje.length) partes.push(n(deHoje, 'conta vence hoje', 'contas vencem hoje'));
  if (deAmanha.length) partes.push(n(deAmanha, 'conta vence amanhã', 'contas vencem amanhã'));
  if (atrasadas.length) partes.push(n(atrasadas, 'conta atrasada', 'contas atrasadas'));
  if (!partes.length) return null;
  const itens = [...deHoje, ...deAmanha, ...atrasadas];
  const corpo = itens.slice(0, 3).map((c) => `${c.nome} ${fmtValor(c.valor)}`).join(' · ')
    + (itens.length > 3 ? ` · e mais ${itens.length - 3}` : '');
  return { titulo: partes.join(' · '), corpo };
}

// ---------- Categorias e gráficos ----------

// Categorias padrão do tipo ('conta' ou 'gasto') + as criadas pela casa, com "Outros" por último.
export function categoriasDe(tipo, config = {}, atual) {
  const base = tipo === 'gasto' ? CATEGORIAS_GASTO : CATEGORIAS;
  const lista = [...base.filter((c) => c !== 'Outros'), ...(config.categoriasExtras || [])];
  if (atual && atual !== 'Outros') lista.push(atual);          // categoria antiga que saiu da lista
  const vistos = new Set();
  return [...lista.filter((c) => { const k = c.toLowerCase(); return vistos.has(k) ? false : vistos.add(k); }), 'Outros'];
}

// Devolve o nome já existente (se houver) ou o novo nome limpo; null se vazio.
export function normalizarCategoria(nome, existentes) {
  const limpo = String(nome ?? '').trim().replace(/\s+/g, ' ').slice(0, 20);
  if (!limpo) return null;
  return existentes.find((c) => c.toLowerCase() === limpo.toLowerCase()) || limpo[0].toUpperCase() + limpo.slice(1);
}

// Saídas dos últimos n meses terminando em mesFinal: [{ mes, contas, gastos, total }].
export function serieMeses(dados, mesFinal, n) {
  return Array.from({ length: n }, (_, i) => {
    const mes = somaMes(mesFinal, i - n + 1);
    const contas = somar(contasDoMes(dados, mes));
    const gastos = somar(gastosDoMes(dados, mes));
    return { mes, contas, gastos, total: contas + gastos };
  });
}

// Contas e gastos do mês somados por categoria, da maior para a menor.
export function saidasPorCategoria(dados, mes) {
  return porCategoria([...contasDoMes(dados, mes), ...gastosDoMes(dados, mes)]);
}

// Eixo com números redondos: { topo, marcas } em centavos (de 2 a 4 marcas).
export function escala(max) {
  if (!(max > 0)) return { topo: 10000, marcas: [5000, 10000] };
  const alvo = max / 4;
  const pot = 10 ** Math.floor(Math.log10(alvo));
  const passo = [1, 2, 5, 10].find((m) => m * pot >= alvo) * pot;
  const topo = Math.ceil(max / passo) * passo;
  const marcas = [];
  for (let v = passo; v <= topo + 1e-6; v += passo) marcas.push(Math.round(v));
  return { topo, marcas };
}

export function fmtCompacto(centavos) {
  const v = (centavos || 0) / 100;
  if (Math.abs(v) >= 1000) return `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
}

// ---------- Renda por pessoa, divisão e cartão ----------

export function rendaDe(config, uid) { return config?.rendas?.[uid] || 0; }
// Renda da casa = soma das rendas de cada um (ou a renda única antiga, se ainda não foi separada).
export function rendaCasa(config) {
  const r = config?.rendas;
  return r && Object.keys(r).length ? Object.values(r).reduce((s, v) => s + (v || 0), 0) : (config?.renda || 0);
}
// Fração das despesas "dos dois" que cabe a uma pessoa: partes iguais ou proporcional à renda.
export function cota(config, uid, uids) {
  if (!uids.includes(uid)) return 0;
  if (config?.divisao === 'proporcional') {
    const total = uids.reduce((s, u) => s + rendaDe(config, u), 0);
    if (total > 0) return rendaDe(config, uid) / total;
  }
  return 1 / uids.length;
}

// Gasto no cartão de crédito não sai do bolso agora: ele chega depois, dentro da fatura.
export function aVista(g) { return g.pagamento !== 'cartao'; }

// Parte de uma pessoa em uma lista: o que é só dela + a cota dela no que é dos dois.
export function parteDe(lista, uid, fracao) {
  let total = 0;
  for (const x of lista) {
    const d = donoDe(x);
    if (d === uid) total += x.valor || 0;
    else if (d === 'casa') total += (x.valor || 0) * fracao;
  }
  return Math.round(total);
}

// Quanto ainda dá para gastar. Valores em centavos; `hoje` = 'AAAA-MM-DD'.
// A cota do dia é calculada como no começo do dia, e o que já foi gasto hoje sai dela.
export function podeGastar({ renda, contas, gastosAVista, gastosHoje, hoje }) {
  if (!renda) return null;
  const dias = diasNoMes(hoje.slice(0, 7)) - Number(hoje.slice(8)) + 1;
  const livre = renda - contas - gastosAVista;
  const porDia = Math.max(0, Math.floor((livre + gastosHoje) / dias));
  return { livre, dias, porDia, hoje: Math.max(0, porDia - gastosHoje), noVermelho: livre < 0 };
}

// Acerto do mês entre duas pessoas, sobre as despesas "dos dois" que cada uma pagou.
// Só entram itens em que se sabe quem pagou. Devolve null se não houver o que acertar.
export function acerto(dados, mes, uids, config) {
  if (uids.length !== 2) return null;
  const pagos = { [uids[0]]: 0, [uids[1]]: 0 };
  let total = 0;
  const somar1 = (x) => { pagos[x.pagoPorUid] += x.valor || 0; total += x.valor || 0; };
  for (const c of contasDoMes(dados, mes)) if (c.pago && donoDe(c) === 'casa' && c.pagoPorUid in pagos) somar1(c);
  for (const g of gastosDoMes(dados, mes)) if (donoDe(g) === 'casa' && g.pagoPorUid in pagos) somar1(g);
  if (!total) return null;
  const [a, b] = uids;
  const saldoA = Math.round(pagos[a] - total * cota(config, a, uids));   // > 0: A pagou mais que a parte dele
  return { total, pagos, credor: saldoA >= 0 ? a : b, devedor: saldoA >= 0 ? b : a, valor: Math.abs(saldoA) };
}

// Parcelas do mês (inclusive as que vêm na fatura do cartão) e o total das contas anuais.
export function parcelasDoMes(dados, mes) {
  return (dados.parcelamentos || []).reduce((s, p) => s + (parcelaNoMes(p, mes) ? p.valorParcela || 0 : 0), 0);
}
export function totalAnuais(recorrentes) {
  return (recorrentes || []).filter((r) => r.tipo === 'anual').reduce((s, r) => s + (r.valor || 0), 0);
}

// ---------- Avisos semanais e de fechamento ----------

export function somaDias(data, n) {
  const [a, m, d] = data.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + n));
  return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
}
export function diaDaSemana(data) {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();   // 0 = domingo, 1 = segunda
}

// Gastos dos 7 dias anteriores a `hoje`, da pessoa e dos dois.
export function resumoSemana(dados, hoje, uid) {
  const de = somaDias(hoje, -7);
  const lista = (dados.gastos || []).filter((g) => g.data >= de && g.data < hoje && (donoDe(g) === 'casa' || donoDe(g) === uid));
  if (!lista.length) return null;
  const top = porCategoria(lista)[0];
  return { titulo: `Semana: ${fmtValor(somar(lista))} em gastos do dia a dia`,
    corpo: `${lista.length} ${lista.length === 1 ? 'lançamento' : 'lançamentos'}. Maior categoria: ${top.categoria} (${fmtValor(top.total)}).` };
}

// Resumo do mês que acabou, para o dia 1º.
export function fechamento(dados, hoje) {
  const mes = somaMes(hoje.slice(0, 7), -1);
  const [atual, antes] = [serieMeses(dados, mes, 1)[0], serieMeses(dados, somaMes(mes, -1), 1)[0]];
  if (!atual.total) return null;
  const nome = nomeMes(mes).split(' ')[0];
  let comparacao = '';
  if (antes.total) {
    const pct = Math.round(((atual.total - antes.total) / antes.total) * 100);
    comparacao = pct === 0 ? ' Igual ao mês anterior.' : ` ${Math.abs(pct)}% ${pct > 0 ? 'a mais' : 'a menos'} que no mês anterior.`;
  }
  return { titulo: `${nome} fechou em ${fmtValor(atual.total)}`,
    corpo: `Contas ${fmtValor(atual.contas)} e gastos ${fmtValor(atual.gastos)}.${comparacao}` };
}
