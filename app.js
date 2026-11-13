import * as L from './logic.js';

const demo = new URLSearchParams(location.search).has('demo');
const $app = document.getElementById('app');
const $sheet = document.getElementById('sheet');
const $toast = document.getElementById('toast');

let store;
try {
  store = (await import(demo ? './store-demo.js' : './store-firebase.js')).default;
} catch (e) {
  $app.innerHTML = `<div class="vazio"><p><strong>Não foi possível abrir o app.</strong></p>
    <p>Na primeira vez é preciso estar com internet. Conecte-se e recarregue a página.</p></div>`;
  throw e;
}

const ui = {
  user: undefined,          // undefined = verificando; null = deslogado
  aba: 'mes',
  mes: L.mesDe(new Date()),
  dados: null,
  erroLogin: '',
  entrando: false,
};
let pararEscuta = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mesAtual = () => L.mesDe(new Date());

function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('visivel');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $toast.classList.remove('visivel'), 3200);
}
const erroGravar = () => toast('Não foi possível salvar. Tente de novo.');

// ---------- Telas ----------

function telaLogin() {
  return `
  <main class="login">
    <img src="icons/icon-192.png" alt="" width="72" height="72">
    <h1>Contas da Casa</h1>
    <form data-form="login" novalidate>
      <label>E-mail<input name="email" type="email" autocomplete="username" required></label>
      <label>Senha<input name="senha" type="password" autocomplete="current-password" required></label>
      ${ui.erroLogin ? `<p class="erro" role="alert">${esc(ui.erroLogin)}</p>` : ''}
      <button class="btn primario" ${ui.entrando ? 'disabled' : ''}>${ui.entrando ? 'Entrando…' : 'Entrar'}</button>
    </form>
  </main>`;
}

function linhaConta(c, hoje) {
  const st = L.status(c, hoje);
  const parcela = c.parcelaN ? `<span class="tag">${c.parcelaN}/${c.parcelaTotal}</span>` : '';
  const fixa = c.origem === 'recorrente' ? '<span class="tag">fixa</span>' : '';
  return `
  <li class="conta st-${st.tipo}">
    <button class="check" role="checkbox" aria-checked="${!!c.pago}" data-acao="pagar" data-id="${esc(c.id)}"
      aria-label="${c.pago ? 'Desmarcar' : 'Marcar'} ${esc(c.nome)} como paga"><span aria-hidden="true">✓</span></button>
    <button class="conta-corpo" data-acao="editar-conta" data-id="${esc(c.id)}">
      <span class="conta-nome">${esc(c.nome)} ${parcela}${fixa}</span>
      <span class="conta-meta"><em>${esc(st.texto)}</em> · ${esc(c.categoria || 'Outros')}</span>
    </button>
    <span class="conta-valor">${L.fmtValor(c.valor)}</span>
  </li>`;
}

function telaMes() {
  const hoje = L.hojeStr();
  const lista = L.contasDoMes(ui.dados, ui.mes);
  const r = L.resumo(lista, ui.dados.config.renda);
  const pct = r.total ? Math.round((r.pago / r.total) * 100) : 0;
  const abertas = lista.filter((c) => !c.pago);
  const pagas = lista.filter((c) => c.pago);
  const tudoPago = lista.length > 0 && abertas.length === 0;
  return `
  <header class="topo">
    <button class="seta" data-acao="mes-ant" aria-label="Mês anterior">‹</button>
    <button class="titulo-mes" data-acao="mes-hoje" ${ui.mes === mesAtual() ? 'disabled' : ''}>
      <h1>${L.nomeMes(ui.mes)}</h1>${ui.mes === mesAtual() ? '' : '<small>voltar para o mês atual</small>'}
    </button>
    <button class="seta" data-acao="mes-prox" aria-label="Próximo mês">›</button>
  </header>
  <section class="resumo" aria-label="Resumo do mês">
    <p class="rotulo">${tudoPago ? 'Tudo pago neste mês' : 'Falta pagar'}</p>
    <p class="destaque">${L.fmtValor(r.falta)}</p>
    <div class="barra" role="img" aria-label="${pct}% do mês já pago"><div style="width:${pct}%"></div></div>
    <dl>
      <div><dt>Total do mês</dt><dd>${L.fmtValor(r.total)}</dd></div>
      <div><dt>Já pago</dt><dd>${L.fmtValor(r.pago)}</dd></div>
      <div><dt>Sobra da renda</dt><dd class="${r.sobra !== null && r.sobra < 0 ? 'negativo' : ''}">${
        r.sobra === null ? '<button class="link" data-acao="ir-mais">informar renda</button>' : L.fmtValor(r.sobra)}</dd></div>
    </dl>
  </section>
  ${lista.length === 0 ? `<div class="vazio"><p>Nenhuma conta em ${L.nomeMes(ui.mes)}.</p>
     <p>Toque em <strong>+ Conta</strong> para lançar uma, ou cadastre suas contas fixas na aba <strong>Fixas</strong>.</p></div>` : ''}
  ${abertas.length ? `<h2 class="secao">A pagar <span>${abertas.length}</span></h2>
     <ul class="lista">${abertas.map((c) => linhaConta(c, hoje)).join('')}</ul>` : ''}
  ${pagas.length ? `<h2 class="secao">Pagas <span>${pagas.length}</span></h2>
     <ul class="lista">${pagas.map((c) => linhaConta(c, hoje)).join('')}</ul>` : ''}
  <button class="fab" data-acao="nova-conta">+ Conta</button>`;
}

function telaFuturo() {
  const proj = L.projecao(ui.dados, mesAtual(), 12);
  const max = Math.max(1, ...proj.map((p) => p.total));
  const parcs = [...ui.dados.parcelamentos].sort((a, b) => L.fimParcelamento(a).localeCompare(L.fimParcelamento(b)));
  const ativos = parcs.filter((p) => L.fimParcelamento(p) >= mesAtual());
  return `
  <header class="topo simples"><h1>Próximos meses</h1></header>
  <section class="cartao">
    <p class="ajuda">Quanto já está comprometido em cada mês, somando fixas, parcelas e contas lançadas.</p>
    <ul class="proj">
      ${proj.map((p) => `
      <li><button data-acao="ver-mes" data-mes="${p.mes}">
        <span class="proj-mes">${L.nomeMes(p.mes, true)}</span>
        <span class="proj-barra"><span style="width:${(p.total / max) * 100}%"></span></span>
        <span class="proj-valor">${L.fmtValor(p.total)}</span>
      </button></li>`).join('')}
    </ul>
  </section>
  <h2 class="secao">Parcelamentos <span>${ativos.length}</span></h2>
  ${ativos.length === 0 ? '<div class="vazio"><p>Nenhum parcelamento em andamento.</p></div>' : `
  <ul class="lista">
    ${ativos.map((p) => {
      const n = L.parcelaNoMes(p, mesAtual());
      const feitas = Math.max(0, Math.min(p.total, L.diffMeses(p.inicio, mesAtual()) + 1));
      return `
      <li class="item"><button class="item-corpo" data-acao="editar-parc" data-id="${esc(p.id)}">
        <span class="conta-nome">${esc(p.nome)}</span>
        <span class="conta-meta">${n ? `Parcela ${n} de ${p.total}` : `Começa em ${L.nomeMes(p.inicio)}`} · termina em ${L.nomeMes(L.fimParcelamento(p))}</span>
        <span class="barra fina"><span style="width:${(feitas / p.total) * 100}%"></span></span>
      </button><span class="conta-valor">${L.fmtValor(p.valorParcela)}<small>/mês</small></span></li>`;
    }).join('')}
  </ul>`}
  <button class="fab" data-acao="novo-parc">+ Parcelamento</button>`;
}

function telaFixas() {
  const recs = [...ui.dados.recorrentes].sort((a, b) => (a.dia - b.dia) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const mensal = recs.filter((r) => r.tipo !== 'anual').reduce((s, r) => s + (r.valor || 0), 0);
  return `
  <header class="topo simples"><h1>Contas fixas</h1></header>
  <section class="cartao">
    <p class="ajuda">Cadastre uma vez e a conta aparece sozinha todo mês. Se o valor mudar em um mês (como a luz), ajuste na própria conta do mês.</p>
    <p class="total-fixas"><span>Fixas por mês</span><strong>${L.fmtValor(mensal)}</strong></p>
  </section>
  ${recs.length === 0 ? '<div class="vazio"><p>Nenhuma conta fixa cadastrada.</p><p>Comece por aluguel, internet, luz e assinaturas.</p></div>' : `
  <ul class="lista">
    ${recs.map((r) => `
    <li class="item"><button class="item-corpo" data-acao="editar-rec" data-id="${esc(r.id)}">
      <span class="conta-nome">${esc(r.nome)}</span>
      <span class="conta-meta">${r.tipo === 'anual' ? `Todo ano, em ${L.nomeMesNum(r.mes).toLowerCase()}, dia ${r.dia}` : `Todo mês, dia ${r.dia}`} · ${esc(r.categoria || 'Outros')}</span>
    </button><span class="conta-valor">${L.fmtValor(r.valor)}</span></li>`).join('')}
  </ul>`}
  <button class="fab" data-acao="nova-rec">+ Conta fixa</button>`;
}

function telaMais() {
  const renda = ui.dados.config.renda;
  return `
  <header class="topo simples"><h1>Mais</h1></header>
  <section class="cartao">
    <h2>Renda mensal da casa</h2>
    <p class="ajuda">Usada só para calcular quanto sobra no mês.</p>
    <form data-form="renda" class="linha-form">
      <label class="sr" for="renda">Renda mensal</label>
      <div class="campo-rs"><span>R$</span><input id="renda" name="renda" inputmode="decimal" value="${renda ? L.valorParaCampo(renda) : ''}" placeholder="0,00"></div>
      <button class="btn">Salvar</button>
    </form>
  </section>
  <section class="cartao">
    <h2>Backup</h2>
    <p class="ajuda">Baixa um arquivo com todas as contas. Guarde uma cópia de vez em quando.</p>
    <button class="btn" data-acao="exportar">Exportar backup</button>
  </section>
  <section class="cartao">
    <h2>Conta</h2>
    <p class="ajuda">Conectado como ${esc(ui.user.email)}</p>
    <button class="btn" data-acao="sair">Sair</button>
  </section>`;
}

const ABAS = [['mes', 'Mês', '▤'], ['futuro', 'Futuro', '↗'], ['fixas', 'Fixas', '↻'], ['mais', 'Mais', '⋯']];

function render() {
  if (ui.user === undefined) { $app.innerHTML = '<p class="carregando">Carregando…</p>'; return; }
  if (ui.user === null) { $app.innerHTML = telaLogin(); return; }
  if (!ui.dados) { $app.innerHTML = '<p class="carregando">Carregando suas contas…</p>'; return; }
  const tela = { mes: telaMes, futuro: telaFuturo, fixas: telaFixas, mais: telaMais }[ui.aba]();
  $app.innerHTML = `
    ${store.demo ? '<p class="faixa">Modo demonstração: nada é salvo.</p>' : ''}
    ${!navigator.onLine ? '<p class="faixa">Sem internet. As alterações serão enviadas quando a conexão voltar.</p>' : ''}
    <main>${tela}</main>
    <nav class="abas" aria-label="Seções">
      ${ABAS.map(([id, nome, ic]) => `<button data-acao="aba" data-aba="${id}" ${ui.aba === id ? 'aria-current="page"' : ''}>
        <span aria-hidden="true">${ic}</span>${nome}</button>`).join('')}
    </nav>`;
}

// ---------- Formulários (folha inferior) ----------

const campoValor = (nome, valor, rotulo) => `
  <label>${rotulo}<div class="campo-rs"><span>R$</span>
    <input name="${nome}" inputmode="decimal" required placeholder="0,00" value="${valor != null ? L.valorParaCampo(valor) : ''}"></div></label>`;
const campoCategoria = (atual) => `
  <label>Categoria<select name="categoria">
    ${L.CATEGORIAS.map((c) => `<option ${c === (atual || 'Outros') ? 'selected' : ''}>${c}</option>`).join('')}
  </select></label>`;

function abrirSheet(html) {
  $sheet.innerHTML = html;
  $sheet.showModal();
}
function fecharSheet() { if ($sheet.open) $sheet.close(); }

function formConta(c) {
  const novo = !c;
  const gerada = c && c.origem !== 'avulsa';
  const venc = c ? c.venc : (ui.mes === mesAtual() ? L.hojeStr() : `${ui.mes}-01`);
  const limites = gerada ? `min="${c.mes}-01" max="${L.dataVenc(c.mes, 31)}"` : '';
  abrirSheet(`
  <form data-form="conta" data-id="${esc(c?.id || '')}" novalidate>
    <h2>${novo ? 'Nova conta' : 'Editar conta'}</h2>
    ${gerada ? `<p class="ajuda">${c.origem === 'parcela' ? `Parcela ${c.parcelaN} de ${c.parcelaTotal}.` : 'Conta fixa.'} As mudanças valem só para ${L.nomeMes(c.mes)}.</p>` : ''}
    <label>Nome<input name="nome" required maxlength="60" value="${esc(c?.nome || '')}" placeholder="Ex.: Conta de luz"></label>
    ${campoValor('valor', c?.valor, 'Valor')}
    <label>Vencimento<input name="venc" type="date" required value="${venc}" ${limites}></label>
    ${campoCategoria(c?.categoria)}
    <p class="erro" role="alert" hidden></p>
    <div class="acoes">
      ${novo ? '' : `<button type="button" class="btn perigo" data-acao="excluir-conta" data-id="${esc(c.id)}">${gerada ? 'Pular este mês' : 'Excluir'}</button>`}
      <button type="button" class="btn" data-acao="fechar">Cancelar</button>
      <button class="btn primario">Salvar</button>
    </div>
  </form>`);
}

function formRec(r) {
  abrirSheet(`
  <form data-form="rec" data-id="${esc(r?.id || '')}" novalidate>
    <h2>${r ? 'Editar conta fixa' : 'Nova conta fixa'}</h2>
    <label>Nome<input name="nome" required maxlength="60" value="${esc(r?.nome || '')}" placeholder="Ex.: Internet"></label>
    ${campoValor('valor', r?.valor, 'Valor (ou estimativa)')}
    <div class="dupla">
      <label>Repete<select name="tipo">
        <option value="mensal" ${r?.tipo !== 'anual' ? 'selected' : ''}>Todo mês</option>
        <option value="anual" ${r?.tipo === 'anual' ? 'selected' : ''}>Uma vez por ano</option>
      </select></label>
      <label>Dia do vencimento<input name="dia" type="number" inputmode="numeric" min="1" max="31" required value="${r?.dia || ''}"></label>
    </div>
    <label data-so-anual ${r?.tipo === 'anual' ? '' : 'hidden'}>Mês<select name="mes">
      ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${Number(r?.mes) === i + 1 ? 'selected' : ''}>${L.nomeMesNum(i + 1)}</option>`).join('')}
    </select></label>
    ${campoCategoria(r?.categoria)}
    <p class="erro" role="alert" hidden></p>
    <div class="acoes">
      ${r ? `<button type="button" class="btn perigo" data-acao="excluir-rec" data-id="${esc(r.id)}">Excluir</button>` : ''}
      <button type="button" class="btn" data-acao="fechar">Cancelar</button>
      <button class="btn primario">Salvar</button>
    </div>
  </form>`);
}

function formParc(p) {
  const atual = p ? Math.max(1, Math.min(p.total, L.diffMeses(p.inicio, mesAtual()) + 1)) : 1;
  abrirSheet(`
  <form data-form="parc" data-id="${esc(p?.id || '')}" novalidate>
    <h2>${p ? 'Editar parcelamento' : 'Novo parcelamento'}</h2>
    <label>O que é<input name="nome" required maxlength="60" value="${esc(p?.nome || '')}" placeholder="Ex.: Geladeira"></label>
    ${campoValor('valor', p?.valorParcela, 'Valor de cada parcela')}
    <div class="dupla">
      <label>Parcela de ${L.nomeMes(mesAtual()).split(' ')[0].toLowerCase()}<input name="atual" type="number" inputmode="numeric" min="1" required value="${atual}"></label>
      <label>Total de parcelas<input name="total" type="number" inputmode="numeric" min="1" max="360" required value="${p?.total || ''}"></label>
    </div>
    <label>Dia do vencimento<input name="dia" type="number" inputmode="numeric" min="1" max="31" required value="${p?.dia || ''}"></label>
    ${campoCategoria(p?.categoria || 'Cartão')}
    <p class="erro" role="alert" hidden></p>
    <div class="acoes">
      ${p ? `<button type="button" class="btn perigo" data-acao="excluir-parc" data-id="${esc(p.id)}">Excluir</button>` : ''}
      <button type="button" class="btn" data-acao="fechar">Cancelar</button>
      <button class="btn primario">Salvar</button>
    </div>
  </form>`);
}

// Lê e valida os campos comuns. Devolve null (e mostra o erro) se algo estiver errado.
function lerForm(form) {
  const f = Object.fromEntries(new FormData(form));
  const erro = (msg) => { const p = form.querySelector('.erro'); p.textContent = msg; p.hidden = false; return null; };
  const nome = (f.nome || '').trim();
  if (!nome) return erro('Informe o nome.');
  const valor = L.parseValor(f.valor);
  if (valor === null) return erro('Informe o valor, por exemplo 129,90.');
  const out = { nome, valor, categoria: f.categoria || 'Outros' };
  if ('dia' in f) {
    out.dia = Number(f.dia);
    if (!Number.isInteger(out.dia) || out.dia < 1 || out.dia > 31) return erro('O dia do vencimento vai de 1 a 31.');
  }
  return { f, out, erro };
}

function acharConta(id) {
  for (const mes of new Set([ui.mes, mesAtual()])) {
    const c = L.contasDoMes(ui.dados, mes).find((x) => x.id === id);
    if (c) return c;
  }
  return null;
}

// ---------- Eventos ----------

const acoes = {
  aba: (el) => { ui.aba = el.dataset.aba; render(); window.scrollTo(0, 0); },
  'ir-mais': () => { ui.aba = 'mais'; render(); },
  'mes-ant': () => { ui.mes = L.somaMes(ui.mes, -1); render(); },
  'mes-prox': () => { ui.mes = L.somaMes(ui.mes, 1); render(); },
  'mes-hoje': () => { ui.mes = mesAtual(); render(); },
  'ver-mes': (el) => { ui.mes = el.dataset.mes; ui.aba = 'mes'; render(); window.scrollTo(0, 0); },
  fechar: fecharSheet,

  pagar: (el) => {
    const c = acharConta(el.dataset.id);
    if (!c) return;
    const pago = !c.pago;
    store.gravar('contas', c.id, {
      ...L.paraGravar(c), pago,
      pagoEm: pago ? L.hojeStr() : null,
      pagoPor: pago ? ui.user.email : null,
    }, erroGravar);
    if (pago) toast(`${c.nome}: marcada como paga`);
  },

  'nova-conta': () => formConta(null),
  'editar-conta': (el) => { const c = acharConta(el.dataset.id); if (c) formConta(c); },
  'excluir-conta': (el) => {
    const c = acharConta(el.dataset.id);
    if (!c) return;
    if (c.origem === 'avulsa') {
      if (!confirm(`Excluir "${c.nome}"?`)) return;
      store.apagar('contas', c.id, erroGravar);
    } else {
      if (!confirm(`Pular "${c.nome}" em ${L.nomeMes(c.mes)}? Ela continua nos outros meses.`)) return;
      store.gravar('contas', c.id, { ...L.paraGravar(c), ignorada: true }, erroGravar);
    }
    fecharSheet();
  },

  'nova-rec': () => formRec(null),
  'editar-rec': (el) => formRec(ui.dados.recorrentes.find((r) => r.id === el.dataset.id)),
  'excluir-rec': (el) => {
    const r = ui.dados.recorrentes.find((x) => x.id === el.dataset.id);
    if (!r || !confirm(`Excluir a conta fixa "${r.nome}"? As que já foram pagas continuam no histórico.`)) return;
    store.apagar('recorrentes', r.id, erroGravar);
    fecharSheet();
  },

  'novo-parc': () => formParc(null),
  'editar-parc': (el) => formParc(ui.dados.parcelamentos.find((p) => p.id === el.dataset.id)),
  'excluir-parc': (el) => {
    const p = ui.dados.parcelamentos.find((x) => x.id === el.dataset.id);
    if (!p || !confirm(`Excluir o parcelamento "${p.nome}"? As parcelas já pagas continuam no histórico.`)) return;
    store.apagar('parcelamentos', p.id, erroGravar);
    fecharSheet();
  },

  exportar: () => {
    const blob = new Blob([JSON.stringify({ exportadoEm: new Date().toISOString(), ...ui.dados }, null, 2)],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `contas-casa-${L.hojeStr()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup baixado');
  },

  sair: () => { if (confirm('Sair do app neste aparelho?')) store.logout(); },
};

const envios = {
  login: async (form) => {
    const f = Object.fromEntries(new FormData(form));
    if (!f.email || !f.senha) { ui.erroLogin = 'Preencha e-mail e senha.'; return render(); }
    ui.entrando = true; ui.erroLogin = ''; render();
    try { await store.login(f.email.trim(), f.senha); }
    catch (e) { ui.erroLogin = e.message; }
    ui.entrando = false; render();
  },

  renda: (form) => {
    const txt = new FormData(form).get('renda');
    const renda = txt.trim() === '' ? 0 : L.parseValor(txt);
    if (renda === null) return toast('Valor inválido. Exemplo: 5.500,00');
    store.gravar('config', 'geral', { renda }, erroGravar);
    toast('Renda salva');
  },

  conta: (form) => {
    const lido = lerForm(form);
    if (!lido) return;
    const { f, out, erro } = lido;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.venc || '')) return erro('Informe a data de vencimento.');
    const antiga = form.dataset.id ? acharConta(form.dataset.id) : null;
    if (antiga && antiga.origem !== 'avulsa' && f.venc.slice(0, 7) !== antiga.mes) {
      return erro(`Esta conta é de ${L.nomeMes(antiga.mes)}. Mude só o dia.`);
    }
    const base = antiga ? L.paraGravar(antiga) : { pago: false, origem: 'avulsa' };
    const id = antiga ? antiga.id : store.novoId('contas');
    store.gravar('contas', id, { ...base, ...out, venc: f.venc, mes: f.venc.slice(0, 7) }, erroGravar);
    if (!antiga && f.venc.slice(0, 7) !== ui.mes) { ui.mes = f.venc.slice(0, 7); render(); }
    fecharSheet();
  },

  rec: (form) => {
    const lido = lerForm(form);
    if (!lido) return;
    const { f, out } = lido;
    const antiga = ui.dados.recorrentes.find((r) => r.id === form.dataset.id);
    const dados = { ...out, tipo: f.tipo === 'anual' ? 'anual' : 'mensal', mes: f.tipo === 'anual' ? Number(f.mes) : null,
      desde: antiga?.desde || mesAtual() };
    store.gravar('recorrentes', antiga ? antiga.id : store.novoId('recorrentes'), dados, erroGravar);
    fecharSheet();
  },

  parc: (form) => {
    const lido = lerForm(form);
    if (!lido) return;
    const { f, out, erro } = lido;
    const total = Number(f.total), atual = Number(f.atual);
    if (!Number.isInteger(total) || total < 1 || total > 360) return erro('Informe o total de parcelas.');
    if (!Number.isInteger(atual) || atual < 1 || atual > total) return erro(`A parcela deste mês vai de 1 a ${total}.`);
    const antiga = ui.dados.parcelamentos.find((p) => p.id === form.dataset.id);
    const dados = { nome: out.nome, valorParcela: out.valor, categoria: out.categoria, dia: out.dia, total,
      inicio: L.somaMes(mesAtual(), -(atual - 1)) };
    store.gravar('parcelamentos', antiga ? antiga.id : store.novoId('parcelamentos'), dados, erroGravar);
    fecharSheet();
  },
};

document.addEventListener('click', (ev) => {
  if (ev.target === $sheet) return fecharSheet();           // toque fora da folha
  const el = ev.target.closest('[data-acao]');
  if (el && acoes[el.dataset.acao]) acoes[el.dataset.acao](el);
});
document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('[data-form]');
  if (!form) return;
  ev.preventDefault();
  envios[form.dataset.form]?.(form);
});
document.addEventListener('change', (ev) => {
  if (ev.target.name === 'tipo') {
    ev.target.form.querySelector('[data-so-anual]').hidden = ev.target.value !== 'anual';
  }
});
window.addEventListener('online', render);
window.addEventListener('offline', render);

// ---------- Início ----------

store.onAuth((user) => {
  pararEscuta?.();
  pararEscuta = null;
  ui.user = user;
  ui.dados = null;
  if (user) {
    pararEscuta = store.subscribe(
      (dados) => { ui.dados = dados; render(); },
      (msg) => toast(msg),
    );
  }
  render();
});

if (!demo && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
