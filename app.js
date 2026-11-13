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

function lerLocal(k) { try { return localStorage.getItem(k); } catch { return null; } }
function gravarLocal(k, v) { try { localStorage.setItem(k, v); } catch { /* vale só nesta sessão */ } }
function lerFiltro() { try { return localStorage.getItem('filtro') || 'tudo'; } catch { return 'tudo'; } }
function salvarFiltro(v) { try { localStorage.setItem('filtro', v); } catch { /* sem armazenamento: vale só nesta sessão */ } }

const ui = {
  user: undefined,          // undefined = verificando; null = deslogado
  aba: 'inicio',
  inicioVista: 'resumo',    // 'resumo' | 'graficos'
  grafMes: null,            // mês em destaque no gráfico (null = mês atual)
  mes: L.mesDe(new Date()),
  dados: null,
  erroLogin: '',
  entrando: false,
  filtro: lerFiltro(),      // 'tudo' | 'casa' | uid
  notifOk: null,            // este navegador aceita notificações? (null = verificando)
  notifLigada: lerLocal('lembretes') === '1',
  notifOcupado: false,
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
// Pessoas da casa: { uid: nome }. Cada um entra na lista ao abrir o app pela primeira vez.
const pessoas = () => ui.dados?.config?.pessoas || {};
const donos = () => ['casa', ...Object.keys(pessoas()).sort((a, b) => (a === ui.user.uid ? -1 : b === ui.user.uid ? 1 : a.localeCompare(b)))];
const filtroAtual = () => (ui.filtro === 'tudo' || donos().includes(ui.filtro) ? ui.filtro : 'tudo');
const nomeDono = (d) => L.nomeDono(d, pessoas());
const uids = () => Object.keys(pessoas()).sort();
const cotaDe = (uid) => L.cota(ui.dados.config, uid, uids());
const rendaCasa = () => L.rendaCasa(ui.dados.config);

function chipsFiltro() {
  const f = filtroAtual();
  const chip = (v, nome) => `<button data-acao="filtro" data-filtro="${esc(v)}" aria-pressed="${f === v}">${esc(nome)}</button>`;
  return `<div class="chips" role="group" aria-label="Mostrar contas de">
    ${chip('tudo', 'Tudo')}${donos().map((d) => chip(d, nomeDono(d))).join('')}</div>`;
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
  const fixa = c.origem === 'recorrente' ? '<span class="tag">fixa</span>' : c.origem === 'meta' ? '<span class="tag">meta</span>' : '';
  return `
  <li class="conta st-${st.tipo}">
    <button class="check" role="checkbox" aria-checked="${!!c.pago}" data-acao="pagar" data-id="${esc(c.id)}"
      aria-label="${c.pago ? 'Desmarcar' : 'Marcar'} ${esc(c.nome)} como paga"><span aria-hidden="true">✓</span></button>
    <button class="conta-corpo" data-acao="editar-conta" data-id="${esc(c.id)}">
      <span class="conta-nome">${esc(c.nome)} ${parcela}${fixa}</span>
      <span class="conta-meta"><em>${esc(st.texto)}${c.pago && c.pagoEm ? ` em ${L.dataCurta(c.pagoEm)}` : ''}${
        c.pago && pessoas()[c.pagoPorUid] ? ` por ${esc(pessoas()[c.pagoPorUid])}` : ''}</em> · ${esc(c.categoria || 'Outros')}${
        filtroAtual() === 'tudo' ? ` · <span class="dono">${esc(nomeDono(L.donoDe(c)))}</span>` : ''}</span>
    </button>
    <span class="conta-valor">${L.fmtValor(c.valor)}</span>
  </li>`;
}

function telaMes() {
  const hoje = L.hojeStr();
  const f = filtroAtual();
  const doMes = L.contasDoMes(ui.dados, ui.mes);
  const lista = L.filtrar(doMes, f);
  const gVista = L.gastosDoMes(ui.dados, ui.mes).filter(L.aVista);
  const r = L.resumo(lista, rendaCasa(), L.somar(gVista));
  const pessoa = f !== 'tudo' && f !== 'casa' && L.rendaDe(ui.dados.config, f) ? f : null;
  const sobraPessoa = pessoa
    ? L.rendaDe(ui.dados.config, pessoa) - L.parteDe(doMes, pessoa, cotaDe(pessoa)) - L.parteDe(gVista, pessoa, cotaDe(pessoa)) : 0;
  const partes = f === 'tudo' ? L.porDono(doMes) : [];
  const pct = r.total ? Math.round((r.pago / r.total) * 100) : 0;
  const abertas = lista.filter((c) => !c.pago);
  const pagas = lista.filter((c) => c.pago);
  const tudoPago = lista.length > 0 && abertas.length === 0;
  return `
  ${cabecalhoMes()}
  ${chipsFiltro()}
  <section class="resumo" aria-label="Resumo do mês">
    <p class="rotulo">${tudoPago ? 'Tudo pago neste mês' : 'Falta pagar'}${f === 'tudo' ? '' : ` · ${esc(nomeDono(f))}`}</p>
    <p class="destaque">${L.fmtValor(r.falta)}</p>
    <div class="barra" role="img" aria-label="${pct}% do mês já pago"><div style="width:${pct}%"></div></div>
    <dl>
      <div><dt>Total do mês</dt><dd>${L.fmtValor(r.total)}</dd></div>
      <div><dt>Já pago</dt><dd>${L.fmtValor(r.pago)}</dd></div>
      ${f === 'tudo' ? `<div><dt>Sobra da casa</dt><dd class="${r.sobra !== null && r.sobra < 0 ? 'negativo' : ''}">${
        r.sobra === null ? '<button class="link" data-acao="ir-mais">informar renda</button>' : L.fmtValor(r.sobra)}</dd></div>`
        : pessoa ? `<div><dt>Sobra de ${esc(nomeDono(pessoa))}</dt><dd class="${sobraPessoa < 0 ? 'negativo' : ''}">${L.fmtValor(sobraPessoa)}</dd></div>`
        : `<div><dt>Contas</dt><dd>${pagas.length} de ${lista.length} pagas</dd></div>`}
    </dl>
    ${pessoa ? `<p class="limite">A sobra já desconta ${Math.round(cotaDe(pessoa) * 100)}% das contas e gastos dos dois.</p>` : ''}
    ${partes.length > 1 ? `<ul class="partes" aria-label="Total do mês por pessoa">
      ${partes.map((p) => `<li><button data-acao="filtro" data-filtro="${esc(p.dono)}"><span>${esc(nomeDono(p.dono))}</span><strong>${L.fmtValor(p.total)}</strong></button></li>`).join('')}
    </ul>` : ''}
  </section>
  ${lista.length === 0 ? `<div class="vazio"><p>Nenhuma conta ${f === 'tudo' ? '' : `de "${esc(nomeDono(f))}" `}em ${L.nomeMes(ui.mes)}.</p>
     <p>Toque em <strong>+ Conta</strong> para lançar uma, ou cadastre suas contas fixas na aba <strong>Planejar</strong>.</p></div>` : ''}
  ${abertas.length ? `<h2 class="secao">A pagar <span>${abertas.length}</span></h2>
     <ul class="lista">${abertas.map((c) => linhaConta(c, hoje)).join('')}</ul>` : ''}
  ${pagas.length ? `<h2 class="secao">Pagas <span>${pagas.length}</span></h2>
     <ul class="lista">${pagas.map((c) => linhaConta(c, hoje)).join('')}</ul>` : ''}
  <button class="fab" data-acao="nova-conta">+ Conta</button>`;
}

function cabecalhoMes() {
  return `
  <header class="topo">
    <button class="seta" data-acao="mes-ant" aria-label="Mês anterior">‹</button>
    <button class="titulo-mes" data-acao="mes-hoje" ${ui.mes === mesAtual() ? 'disabled' : ''}>
      <h1>${L.nomeMes(ui.mes)}</h1>${ui.mes === mesAtual() ? '' : '<small>voltar para o mês atual</small>'}
    </button>
    <button class="seta" data-acao="mes-prox" aria-label="Próximo mês">›</button>
  </header>`;
}

function telaGastos() {
  const f = filtroAtual();
  const hoje = L.hojeStr();
  const lista = L.gastosDoMes(ui.dados, ui.mes, f);
  const total = L.somar(lista);
  const anterior = L.somar(L.gastosDoMes(ui.dados, L.somaMes(ui.mes, -1), f));
  const cats = L.porCategoria(lista);
  const doDia = L.somar(lista.filter((g) => g.data === hoje));
  const limite = f === 'tudo' ? (ui.dados.config.limiteGastos || 0) : 0;
  const pct = limite ? Math.min(100, Math.round((total / limite) * 100)) : 0;
  return `
  ${cabecalhoMes()}
  ${chipsFiltro()}
  <section class="resumo ${limite && total > limite ? 'estourou' : ''}" aria-label="Gastos do mês">
    <p class="rotulo">Gastos do dia a dia${f === 'tudo' ? '' : ` · ${esc(nomeDono(f))}`}</p>
    <p class="destaque">${L.fmtValor(total)}</p>
    ${limite ? `<div class="barra" role="img" aria-label="${pct}% do limite usado"><div style="width:${pct}%"></div></div>
      <p class="limite">${total > limite ? `Passou ${L.fmtValor(total - limite)} do limite de ${L.fmtValor(limite)}`
        : `Restam ${L.fmtValor(limite - total)} do limite de ${L.fmtValor(limite)}`}</p>` : ''}
    <dl>
      <div><dt>Hoje</dt><dd>${ui.mes === mesAtual() ? L.fmtValor(doDia) : '—'}</dd></div>
      <div><dt>No cartão</dt><dd>${L.fmtValor(total - L.somar(lista.filter(L.aVista)))}</dd></div>
      <div><dt>Mês anterior</dt><dd>${L.fmtValor(anterior)}</dd></div>
    </dl>
    ${!limite && f === 'tudo' ? '<p class="limite"><button class="link" data-acao="ir-mais">Definir um limite mensal</button></p>' : ''}
  </section>
  ${lista.length === 0 ? `<div class="vazio"><p>Nenhum gasto ${f === 'tudo' ? '' : `de "${esc(nomeDono(f))}" `}em ${L.nomeMes(ui.mes)}.</p>
    <p>Toque em <strong>+ Gasto</strong> para anotar lanche, mercado, combustível e outras compras do dia.</p></div>` : `
  <h2 class="secao">Por categoria</h2>
  <section class="cartao">${barrasCategoria(cats)}</section>
  ${L.porDia(lista).map((d) => `
  <h2 class="secao dia"><b>${L.rotuloDia(d.data, hoje)}</b><span>${L.fmtValor(d.total)}</span></h2>
  <ul class="lista">
    ${d.itens.map((g) => `
    <li class="item"><button class="item-corpo" data-acao="editar-gasto" data-id="${esc(g.id)}">
      <span class="conta-nome">${esc(g.descricao)}${L.aVista(g) ? '' : ' <span class="tag">cartão</span>'}</span>
      <span class="conta-meta">${esc(g.categoria || 'Outros')}${f === 'tudo' ? ` · ${esc(nomeDono(L.donoDe(g)))}` : ''}</span>
    </button><span class="conta-valor">${L.fmtValor(g.valor)}</span></li>`).join('')}
  </ul>`).join('')}`}
  <button class="fab" data-acao="novo-gasto">+ Gasto</button>`;
}

// Colunas empilhadas (contas + gastos) dos últimos 6 meses. Tocar em um mês mostra os valores.
function graficoMeses() {
  const serie = L.serieMeses(ui.dados, mesAtual(), 6);
  const renda = rendaCasa();
  const { topo, marcas } = L.escala(Math.max(renda, ...serie.map((m) => m.total)));
  const sel = serie.find((m) => m.mes === ui.grafMes) || serie.at(-1);
  const pct = (v) => `${(v / topo) * 100}%`;
  return `
  <figure class="grafico" aria-label="Saídas por mês: contas e gastos dos últimos 6 meses">
    <div class="graf-plot">
      ${marcas.map((v) => `<div class="graf-grade" style="bottom:${pct(v)}"><span>${L.fmtCompacto(v)}</span></div>`).join('')}
      ${renda ? `<div class="graf-renda" style="bottom:${pct(renda)}"><span>Renda</span></div>` : ''}
      <div class="graf-colunas">
        ${serie.map((m) => `
        <button data-acao="graf-mes" data-mes="${m.mes}" aria-pressed="${m.mes === sel.mes}"
          aria-label="${L.nomeMes(m.mes)}: contas ${L.fmtValor(m.contas)}, gastos ${L.fmtValor(m.gastos)}, total ${L.fmtValor(m.total)}">
          <span class="graf-pilha" style="height:${pct(m.total)}">
            ${m.gastos ? `<i class="s2" style="flex:${m.gastos}"></i>` : ''}
            ${m.contas ? `<i class="s1" style="flex:${m.contas}"></i>` : ''}
          </span>
        </button>`).join('')}
      </div>
    </div>
    <div class="graf-eixo">${serie.map((m) => `<span class="${m.mes === sel.mes ? 'sel' : ''}">${L.nomeMes(m.mes, true).slice(0, 3)}</span>`).join('')}</div>
    <figcaption class="graf-leitura">
      <b>${L.nomeMes(sel.mes)}</b>
      <span><i class="s1"></i>Contas <strong>${L.fmtValor(sel.contas)}</strong></span>
      <span><i class="s2"></i>Gastos <strong>${L.fmtValor(sel.gastos)}</strong></span>
      <span>Total <strong>${L.fmtValor(sel.total)}</strong></span>
    </figcaption>
    <details class="graf-tabela"><summary>Ver em tabela</summary>
      <table><thead><tr><th>Mês</th><th>Contas</th><th>Gastos</th><th>Total</th></tr></thead><tbody>
        ${serie.map((m) => `<tr><th>${L.nomeMes(m.mes, true)}</th><td>${L.fmtValor(m.contas)}</td><td>${L.fmtValor(m.gastos)}</td><td>${L.fmtValor(m.total)}</td></tr>`).join('')}
      </tbody></table>
    </details>
  </figure>`;
}

function barrasCategoria(cats) {
  return `<ul class="proj cats">
    ${cats.map((c) => `<li><div>
      <span class="proj-mes">${esc(c.categoria)}</span>
      <span class="proj-barra"><span style="width:${(c.total / cats[0].total) * 100}%"></span></span>
      <span class="proj-valor">${L.fmtValor(c.total)}</span></div></li>`).join('')}
  </ul>`;
}

function linhaMeta(m) {
  const guardado = L.guardadoMeta(ui.dados, m);
  const pct = m.alvo ? Math.min(100, Math.round((guardado / m.alvo) * 100)) : 0;
  const falta = Math.max(0, m.alvo - guardado);
  const meses = m.mensal && falta ? Math.ceil(falta / m.mensal) : 0;
  return `
  <li class="item"><button class="item-corpo" data-acao="editar-meta" data-id="${esc(m.id)}">
    <span class="conta-nome">${esc(m.nome)}</span>
    <span class="conta-meta">${L.fmtValor(guardado)} de ${L.fmtValor(m.alvo)}${
      !falta ? ' · meta atingida' : meses ? ` · ${meses === 1 ? 'falta 1 mês' : `faltam ${meses} meses`}` : ''}</span>
    <span class="barra fina" role="img" aria-label="${pct}% guardado"><span style="width:${pct}%"></span></span>
  </button><span class="conta-valor">${pct}%${m.mensal ? `<small>${L.fmtValor(m.mensal)}/mês</small>` : ''}</span></li>`;
}

function telaInicio() {
  const hoje = L.hojeStr();
  const mes = mesAtual();
  const cfg = ui.dados.config;
  const doMes = L.contasDoMes(ui.dados, mes);
  const gastos = L.gastosDoMes(ui.dados, mes);
  const vista = gastos.filter(L.aVista);
  const noCartao = L.somar(gastos) - L.somar(vista);
  const pg = L.podeGastar({ renda: rendaCasa(), contas: L.somar(doMes), gastosAVista: L.somar(vista),
    gastosHoje: L.somar(vista.filter((g) => g.data === hoje)), hoje });
  const abertas = [...L.contasDoMes(ui.dados, L.somaMes(mes, -1)), ...doMes].filter((c) => !c.pago);
  const ac = L.acerto(ui.dados, mes, uids(), cfg);
  const nome = pessoas()[ui.user.uid];
  const cats = L.saidasPorCategoria(ui.dados, mes);
  const vistaBtn = (v, n) => `<button data-acao="inicio-vista" data-vista="${v}" aria-pressed="${ui.inicioVista === v}">${n}</button>`;
  const topo = `
  <header class="topo simples"><div><h1>${nome ? `Olá, ${esc(nome)}` : 'Olá'}</h1><p class="sub">${L.nomeMes(mes)}</p></div></header>
  <div class="chips" role="group" aria-label="O que mostrar">${vistaBtn('resumo', 'Resumo')}${vistaBtn('graficos', 'Gráficos')}</div>`;

  if (ui.inicioVista === 'graficos') {
    return `${topo}
    <h2 class="secao">Saídas por mês</h2>
    <section class="cartao">${graficoMeses()}</section>
    <h2 class="secao">Para onde foi o dinheiro em ${L.nomeMes(mes).split(' ')[0].toLowerCase()}</h2>
    <section class="cartao">${cats.length ? `<p class="ajuda">Contas e gastos do mês, somados por categoria.</p>${barrasCategoria(cats)}`
      : '<p class="ajuda sem-margem">Ainda não há contas nem gastos neste mês.</p>'}</section>`;
  }

  const cartao = !pg ? `
    <p class="rotulo">Saídas do mês</p>
    <p class="destaque">${L.fmtValor(L.somar(doMes) + L.somar(vista))}</p>
    <p class="limite"><button class="link" data-acao="ir-mais">Informar a renda para ver quanto dá para gastar por dia</button></p>`
    : pg.noVermelho ? `
    <p class="rotulo">O mês passou da renda em</p>
    <p class="destaque">${L.fmtValor(-pg.livre)}</p>
    <p class="limite">Contas, metas e gastos já somam mais do que a renda de ${L.fmtValor(rendaCasa())}.</p>`
    : `
    <p class="rotulo">Hoje ainda dá para gastar</p>
    <p class="destaque">${L.fmtValor(pg.hoje)}</p>
    <p class="limite">Restam ${L.fmtValor(pg.livre)} para ${pg.dias === 1 ? 'hoje, o último dia do mês' : `os ${pg.dias} dias que faltam`}${pg.dias > 1 ? `: ${L.fmtValor(pg.porDia)} por dia` : ''}.</p>`;
  return `${topo}
  <section class="resumo" aria-label="Quanto dá para gastar">
    ${cartao}
    <dl>
      <div><dt>${pg ? 'Renda' : 'Falta pagar'}</dt><dd>${L.fmtValor(pg ? rendaCasa() : L.resumo(doMes, 0).falta)}</dd></div>
      <div><dt>Contas e metas</dt><dd>${L.fmtValor(L.somar(doMes))}</dd></div>
      <div><dt>Gastos</dt><dd>${L.fmtValor(L.somar(vista))}</dd></div>
    </dl>
    ${noCartao ? `<p class="limite">No cartão este mês: ${L.fmtValor(noCartao)}. Esse valor vem na próxima fatura.</p>` : ''}
  </section>
  <div class="atalhos">
    <button class="btn primario" data-acao="novo-gasto">+ Gasto</button>
    <button class="btn" data-acao="nova-conta">+ Conta</button>
  </div>
  <h2 class="secao com-botao">Próximos vencimentos<button class="link" data-acao="ir-contas">ver todas</button></h2>
  ${abertas.length ? `<ul class="lista">${abertas.slice(0, 4).map((c) => linhaConta(c, hoje)).join('')}</ul>
    ${abertas.length > 4 ? `<p class="mais-itens">e mais ${abertas.length - 4} em aberto</p>` : ''}`
    : `<div class="vazio"><p>${doMes.length ? 'Tudo pago por aqui.' : 'Nenhuma conta neste mês ainda.'}</p></div>`}
  <h2 class="secao com-botao">Metas<button class="link" data-acao="ir-plano">${ui.dados.metas.length ? 'ver todas' : 'criar'}</button></h2>
  ${ui.dados.metas.length ? `<ul class="lista">${ui.dados.metas.slice(0, 2).map(linhaMeta).join('')}</ul>`
    : '<div class="vazio"><p>Nenhuma meta ainda.</p><p>Uma reserva de emergência costuma ser a primeira.</p></div>'}
  ${ac ? `<h2 class="secao">Acerto de ${L.nomeMes(mes).split(' ')[0].toLowerCase()}</h2>
  <section class="cartao">
    <p class="acerto">${ac.valor < 100 ? 'Vocês estão quites.'
      : `<strong>${esc(nomeDono(ac.devedor))}</strong> deve <strong>${L.fmtValor(ac.valor)}</strong> a <strong>${esc(nomeDono(ac.credor))}</strong>`}</p>
    <p class="ajuda sem-margem">Das despesas dos dois (${L.fmtValor(ac.total)}), ${uids().map((u) => `${esc(nomeDono(u))} pagou ${L.fmtValor(ac.pagos[u])}`).join(' e ')}. Divisão: ${uids().map((u) => `${Math.round(cotaDe(u) * 100)}%`).join(' e ')}.</p>
  </section>` : ''}`;
}

function telaPlano() {
  const f = filtroAtual();
  const proj = L.projecao(ui.dados, mesAtual(), 12, f);
  const max = Math.max(1, ...proj.map((p) => p.total));
  const metas = L.filtrar(ui.dados.metas, f);
  const ativos = L.filtrar(ui.dados.parcelamentos, f)
    .filter((p) => L.fimParcelamento(p) >= mesAtual())
    .sort((a, b) => L.fimParcelamento(a).localeCompare(L.fimParcelamento(b)));
  const parcMes = L.parcelasDoMes({ parcelamentos: ativos }, mesAtual());
  const recs = L.filtrar(ui.dados.recorrentes, f).sort((a, b) => (a.dia - b.dia) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const mensal = recs.filter((r) => r.tipo !== 'anual').reduce((s, r) => s + (r.valor || 0), 0);
  const anuais = L.totalAnuais(recs);
  return `
  <header class="topo simples"><h1>Planejar</h1></header>
  ${chipsFiltro()}
  <h2 class="secao com-botao">Metas <span>${metas.length}</span><button class="btn pequeno" data-acao="nova-meta">+ Nova</button></h2>
  ${metas.length === 0 ? '<div class="vazio"><p>Nenhuma meta.</p><p>Guardar primeiro e gastar o que sobra funciona melhor do que guardar o que sobrar.</p></div>'
    : `<ul class="lista">${metas.map(linhaMeta).join('')}</ul>`}
  <h2 class="secao com-botao">Contas fixas <span>${recs.length}</span><button class="btn pequeno" data-acao="nova-rec">+ Nova</button></h2>
  ${recs.length === 0 ? '<div class="vazio"><p>Nenhuma conta fixa cadastrada.</p><p>Cadastre aluguel, internet, luz e assinaturas uma vez, e elas aparecem sozinhas todo mês.</p></div>' : `
  <ul class="lista">
    ${recs.map((r) => `
    <li class="item"><button class="item-corpo" data-acao="editar-rec" data-id="${esc(r.id)}">
      <span class="conta-nome">${esc(r.nome)}${r.variavel ? ' <span class="tag">valor varia</span>' : ''}</span>
      <span class="conta-meta">${r.tipo === 'anual' ? `Todo ano, em ${L.nomeMesNum(r.mes).toLowerCase()}, dia ${r.dia}` : `Todo mês, dia ${r.dia}`} · ${esc(r.categoria || 'Outros')} · ${esc(nomeDono(L.donoDe(r)))}</span>
    </button><span class="conta-valor">${L.fmtValor(r.valor)}</span></li>`).join('')}
    <li class="total-linha"><span>Fixas por mês</span><strong>${L.fmtValor(mensal)}</strong></li>
    ${anuais ? `<li class="total-linha"><span>Para as anuais não pesarem, guardar por mês</span><strong>${L.fmtValor(Math.round(anuais / 12))}</strong></li>` : ''}
  </ul>`}
  <h2 class="secao com-botao">Parcelamentos <span>${ativos.length}</span><button class="btn pequeno" data-acao="novo-parc">+ Novo</button></h2>
  ${ativos.length === 0 ? '<div class="vazio"><p>Nenhum parcelamento em andamento.</p></div>' : `
  <ul class="lista">
    ${ativos.map((p) => {
      const n = L.parcelaNoMes(p, mesAtual());
      const feitas = Math.max(0, Math.min(p.total, L.diffMeses(p.inicio, mesAtual()) + 1));
      return `
      <li class="item"><button class="item-corpo" data-acao="editar-parc" data-id="${esc(p.id)}">
        <span class="conta-nome">${esc(p.nome)}${p.naFatura ? ' <span class="tag">na fatura</span>' : ''}</span>
        <span class="conta-meta">${n ? `Parcela ${n} de ${p.total}` : `Começa em ${L.nomeMes(p.inicio)}`} · termina em ${L.nomeMes(L.fimParcelamento(p))} · ${esc(nomeDono(L.donoDe(p)))}</span>
        <span class="barra fina"><span style="width:${(feitas / p.total) * 100}%"></span></span>
      </button><span class="conta-valor">${L.fmtValor(p.valorParcela)}<small>/mês</small></span></li>`;
    }).join('')}
    <li class="total-linha"><span>Parcelas neste mês${f === 'tudo' && rendaCasa() ? ` (${Math.round((parcMes / rendaCasa()) * 100)}% da renda)` : ''}</span><strong>${L.fmtValor(parcMes)}</strong></li>
  </ul>`}
  <h2 class="secao">Próximos 12 meses</h2>
  <section class="cartao">
    <p class="ajuda">Quanto já está comprometido em cada mês, somando fixas, metas, parcelas e contas lançadas. Toque em um mês para abrir.</p>
    <ul class="proj">
      ${proj.map((p) => `
      <li><button data-acao="ver-mes" data-mes="${p.mes}">
        <span class="proj-mes">${L.nomeMes(p.mes, true)}</span>
        <span class="proj-barra"><span style="width:${(p.total / max) * 100}%"></span></span>
        <span class="proj-valor">${L.fmtValor(p.total)}</span>
      </button></li>`).join('')}
    </ul>
  </section>`;
}

function secaoLembrete() {
  if (store.demo) return '<p class="ajuda">Indisponível no modo demonstração.</p>';
  if (ui.notifOk === null) return '<p class="ajuda">Verificando…</p>';
  if (!ui.notifOk) return '<p class="ajuda">Este navegador não aceita notificações. No Android, use o app instalado pelo Chrome.</p>';
  if (Notification.permission === 'denied') {
    return '<p class="ajuda">As notificações estão bloqueadas para este app. Libere nas configurações do Android (Apps → Contas → Notificações) e volte aqui.</p>';
  }
  const ligada = ui.notifLigada && Notification.permission === 'granted';
  return `
    <p class="ajuda">${ligada ? 'Ativado neste celular. Você recebe' : 'Receba'} um aviso por dia, de manhã, quando houver conta sua ou dos dois vencendo hoje, amanhã ou atrasada.</p>
    <button class="btn ${ligada ? '' : 'primario'}" data-acao="${ligada ? 'lembrete-off' : 'lembrete-on'}" ${ui.notifOcupado ? 'disabled' : ''}>${
      ui.notifOcupado ? 'Aguarde…' : ligada ? 'Desativar neste celular' : 'Ativar neste celular'}</button>`;
}

function telaMais() {
  const cfg = ui.dados.config;
  return `
  <header class="topo simples"><h1>Mais</h1></header>
  <section class="cartao">
    <h2>Renda mensal</h2>
    <p class="ajuda">A renda de cada um. A soma (${L.fmtValor(rendaCasa())}) é a renda da casa, usada para calcular quanto dá para gastar.</p>
    <form data-form="rendas">
      ${uids().map((u) => `<label>${esc(nomeDono(u))}<div class="campo-rs"><span>R$</span>
        <input name="renda_${esc(u)}" inputmode="decimal" value="${L.rendaDe(cfg, u) ? L.valorParaCampo(L.rendaDe(cfg, u)) : ''}" placeholder="0,00"></div></label>`).join('')}
      <button class="btn">Salvar</button>
    </form>
  </section>
  <section class="cartao">
    <h2>Divisão das despesas dos dois</h2>
    <p class="ajuda">Vale para o acerto do mês e para a sobra de cada um.</p>
    <div class="chips quebra" role="group" aria-label="Como dividir">
      <button data-acao="divisao" data-modo="meio" aria-pressed="${cfg.divisao !== 'proporcional'}">Partes iguais</button>
      <button data-acao="divisao" data-modo="proporcional" aria-pressed="${cfg.divisao === 'proporcional'}">Proporcional à renda</button>
    </div>
    ${uids().length > 1 ? `<p class="ajuda sem-margem">Hoje: ${uids().map((u) => `${esc(nomeDono(u))} ${Math.round(cotaDe(u) * 100)}%`).join(' · ')}</p>` : ''}
  </section>
  <section class="cartao">
    <h2>Lembrete de vencimento</h2>
    ${secaoLembrete()}
  </section>
  <section class="cartao">
    <h2>Limite de gastos do dia a dia</h2>
    <p class="ajuda">Opcional. A aba Gastos mostra quanto ainda resta no mês.</p>
    <form data-form="limite" class="linha-form">
      <label class="sr" for="limite">Limite mensal de gastos</label>
      <div class="campo-rs"><span>R$</span><input id="limite" name="limite" inputmode="decimal" value="${ui.dados.config.limiteGastos ? L.valorParaCampo(ui.dados.config.limiteGastos) : ''}" placeholder="0,00"></div>
      <button class="btn">Salvar</button>
    </form>
  </section>
  <section class="cartao">
    <h2>Categorias</h2>
    <p class="ajuda">Crie categorias próprias. Elas aparecem nas contas e nos gastos.</p>
    ${(ui.dados.config.categoriasExtras || []).length ? `<ul class="cats-extras">
      ${ui.dados.config.categoriasExtras.map((c) => `<li><span>${esc(c)}</span><button data-acao="remover-categoria" data-nome="${esc(c)}" aria-label="Remover ${esc(c)}">×</button></li>`).join('')}
    </ul>` : ''}
    <form data-form="categoria" class="linha-form">
      <label class="sr" for="novacat">Nova categoria</label>
      <input id="novacat" name="categoria" maxlength="20" placeholder="Ex.: Pet">
      <button class="btn">Criar</button>
    </form>
  </section>
  <section class="cartao">
    <h2>Seu nome</h2>
    <p class="ajuda">Aparece no filtro e nas contas que são só suas.</p>
    <form data-form="nome" class="linha-form">
      <label class="sr" for="meunome">Seu nome</label>
      <input id="meunome" name="nome" maxlength="20" required value="${esc(pessoas()[ui.user.uid] || '')}">
      <button class="btn">Salvar</button>
    </form>
  </section>
  <section class="cartao">
    <h2>Backup</h2>
    <p class="ajuda">Baixa um arquivo com tudo o que está no app. Guarde uma cópia de vez em quando.</p>
    <div class="linha-botoes">
      <button class="btn" data-acao="exportar">Exportar backup</button>
      <button class="btn" data-acao="importar">Restaurar backup</button>
    </div>
    <input type="file" id="arquivo-backup" accept="application/json,.json" hidden>
  </section>
  <section class="cartao">
    <h2>Conta</h2>
    <p class="ajuda">Conectado como ${esc(ui.user.email)}</p>
    <button class="btn" data-acao="sair">Sair</button>
  </section>`;
}

const ABAS = [['inicio', 'Início', '⌂'], ['mes', 'Contas', '▤'], ['gastos', 'Gastos', '◎'], ['plano', 'Planejar', '↗'], ['mais', 'Mais', '⋯']];

function render() {
  if (ui.user === undefined) { $app.innerHTML = '<p class="carregando">Carregando…</p>'; return; }
  if (ui.user === null) { $app.innerHTML = telaLogin(); return; }
  if (!ui.dados) { $app.innerHTML = '<p class="carregando">Carregando suas contas…</p>'; return; }
  const tela = { inicio: telaInicio, mes: telaMes, gastos: telaGastos, plano: telaPlano, mais: telaMais }[ui.aba]();
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
    ${L.categoriasDe('conta', ui.dados.config, atual).map((c) => `<option ${c === (atual || 'Outros') ? 'selected' : ''}>${esc(c)}</option>`).join('')}
    <option value="__nova">＋ Nova categoria…</option>
  </select></label>`;

// Pergunta o nome, grava na lista da casa e devolve o nome final (ou null se cancelou).
function criarCategoria() {
  const extras = ui.dados.config.categoriasExtras || [];
  const todas = [...new Set([...L.CATEGORIAS, ...L.CATEGORIAS_GASTO, ...extras])];
  const nome = L.normalizarCategoria(prompt('Nome da nova categoria:'), todas);
  if (!nome) return null;
  if (!todas.includes(nome)) {
    ui.dados.config.categoriasExtras = [...extras, nome];
    store.gravar('config', 'geral', { categoriasExtras: ui.dados.config.categoriasExtras }, erroGravar);
  }
  return nome;
}

// Em item novo, sugere o dono do filtro que está ativo.
const campoDono = (atual) => {
  const sel = atual || (filtroAtual() === 'tudo' ? 'casa' : filtroAtual());
  return `<fieldset class="dono-campo"><legend>De quem é</legend><div class="chips">
    ${donos().map((d) => `<label><input type="radio" name="dono" value="${esc(d)}" ${d === sel ? 'checked' : ''}><span>${esc(nomeDono(d))}</span></label>`).join('')}
  </div></fieldset>`;
};

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
    ${gerada ? `<p class="ajuda">${c.origem === 'parcela' ? `Parcela ${c.parcelaN} de ${c.parcelaTotal}.` : c.origem === 'meta' ? 'Depósito da meta.' : 'Conta fixa.'} As mudanças valem só para ${L.nomeMes(c.mes)}.</p>` : ''}
    <label>Nome<input name="nome" required maxlength="60" value="${esc(c?.nome || '')}" placeholder="Ex.: Conta de luz"></label>
    ${campoValor('valor', c?.valor, 'Valor')}
    <label>Vencimento<input name="venc" type="date" required value="${venc}" ${limites}></label>
    ${campoCategoria(c?.categoria)}
    ${campoDono(c && L.donoDe(c))}
    <p class="erro" role="alert" hidden></p>
    <div class="acoes">
      ${novo ? '' : `<button type="button" class="btn perigo" data-acao="excluir-conta" data-id="${esc(c.id)}">${gerada ? 'Pular este mês' : 'Excluir'}</button>`}
      <button type="button" class="btn" data-acao="fechar">Cancelar</button>
      <button class="btn primario">Salvar</button>
    </div>
  </form>`);
}

function formGasto(g) {
  const data = g ? g.data : (ui.mes === mesAtual() ? L.hojeStr() : `${ui.mes}-01`);
  const cat = g?.categoria || 'Alimentação';
  abrirSheet(`
  <form data-form="gasto" data-id="${esc(g?.id || '')}" novalidate>
    <h2>${g ? 'Editar gasto' : 'Novo gasto'}</h2>
    ${campoValor('valor', g?.valor, 'Quanto foi')}
    <label>O que foi<input name="descricao" maxlength="60" list="sugestoes" autocomplete="off" value="${esc(g?.descricao || '')}" placeholder="Ex.: Lanche (opcional)"></label>
    <datalist id="sugestoes">${L.sugestoesGasto(ui.dados.gastos).map((s) => `<option value="${esc(s.descricao)}">`).join('')}</datalist>
    <fieldset class="dono-campo"><legend>Categoria</legend><div class="chips quebra">
      ${L.categoriasDe('gasto', ui.dados.config, g?.categoria).map((c) => `<label><input type="radio" name="categoria" value="${esc(c)}" ${c === cat ? 'checked' : ''}><span>${esc(c)}</span></label>`).join('')}
      <button type="button" class="chip-nova" data-acao="nova-categoria">＋ Nova</button>
    </div></fieldset>
    ${campoDono(g && L.donoDe(g))}
    <fieldset class="dono-campo"><legend>Pagou como</legend><div class="chips quebra">
      ${[['avista', 'Dinheiro, Pix ou débito'], ['cartao', 'Cartão de crédito']].map(([v, n]) => `<label><input type="radio" name="pagamento" value="${v}" ${v === (g?.pagamento || lerLocal('pagamento') || 'avista') ? 'checked' : ''}><span>${n}</span></label>`).join('')}
    </div></fieldset>
    <label>Dia<input name="data" type="date" required value="${data}" max="${L.hojeStr()}"></label>
    <p class="erro" role="alert" hidden></p>
    <div class="acoes">
      ${g ? `<button type="button" class="btn perigo" data-acao="excluir-gasto" data-id="${esc(g.id)}">Excluir</button>` : ''}
      <button type="button" class="btn" data-acao="fechar">Cancelar</button>
      <button class="btn primario">Salvar</button>
    </div>
  </form>`);
  if (!g) $sheet.querySelector('[name=valor]').focus();
}

function marcarPaga(c, pago, valor = c.valor) {
  store.gravar('contas', c.id, {
    ...L.paraGravar(c), valor, pago,
    pagoEm: pago ? L.hojeStr() : null,
    pagoPor: pago ? ui.user.email : null,
    pagoPorUid: pago ? ui.user.uid : null,
  }, erroGravar);
  if (pago) toast(`${c.nome}: marcada como paga`);
}

// Conta de valor variável: confirma o valor real antes de marcar como paga.
function formPagar(c) {
  abrirSheet(`
  <form data-form="pagar" data-id="${esc(c.id)}" novalidate>
    <h2>Pagar ${esc(c.nome)}</h2>
    <p class="ajuda">O valor desta conta muda todo mês. Confira com a fatura de ${L.nomeMes(c.mes).split(' ')[0].toLowerCase()}.</p>
    ${campoValor('valor', c.valor, 'Valor pago')}
    <p class="erro" role="alert" hidden></p>
    <div class="acoes">
      <button type="button" class="btn" data-acao="fechar">Cancelar</button>
      <button class="btn primario">Confirmar pagamento</button>
    </div>
  </form>`);
  const campo = $sheet.querySelector('[name=valor]');
  campo.focus(); campo.select();
}

function formMeta(m) {
  abrirSheet(`
  <form data-form="meta" data-id="${esc(m?.id || '')}" novalidate>
    <h2>${m ? 'Editar meta' : 'Nova meta'}</h2>
    <label>Para quê<input name="nome" required maxlength="40" value="${esc(m?.nome || '')}" placeholder="Ex.: Reserva de emergência"></label>
    ${campoValor('alvo', m?.alvo, 'Quanto querem juntar')}
    <div class="dupla">
      ${campoValor('mensal', m?.mensal, 'Guardar por mês')}
      <label>Dia de guardar<input name="dia" type="number" inputmode="numeric" min="1" max="31" value="${m?.dia || 5}"></label>
    </div>
    ${campoValor('guardado', m?.guardado || null, 'Já guardado fora do app (opcional)')}
    ${campoDono(m && L.donoDe(m))}
    <p class="ajuda">O valor mensal aparece em Contas todo mês, como "Meta: nome". Ao marcar como paga, ele soma no progresso.</p>
    <p class="erro" role="alert" hidden></p>
    <div class="acoes">
      ${m ? `<button type="button" class="btn perigo" data-acao="excluir-meta" data-id="${esc(m.id)}">Excluir</button>` : ''}
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
    <label class="marcar"><input type="checkbox" name="variavel" ${r?.variavel ? 'checked' : ''}><span>O valor muda todo mês (luz, água). O app pede o valor certo na hora de pagar.</span></label>
    ${campoCategoria(r?.categoria)}
    ${campoDono(r && L.donoDe(r))}
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
    <label class="marcar"><input type="checkbox" name="naFatura" ${p?.naFatura ? 'checked' : ''}><span>Já vem dentro da fatura do cartão. Não cria uma conta separada, para não contar duas vezes.</span></label>
    ${campoCategoria(p?.categoria || 'Cartão')}
    ${campoDono(p && L.donoDe(p))}
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
  const out = { nome, valor, categoria: f.categoria || 'Outros', dono: f.dono || 'casa' };
  if ('dia' in f) {
    out.dia = Number(f.dia);
    if (!Number.isInteger(out.dia) || out.dia < 1 || out.dia > 31) return erro('O dia do vencimento vai de 1 a 31.');
  }
  return { f, out, erro };
}

function acharConta(id) {
  for (const mes of new Set([ui.mes, mesAtual(), L.somaMes(mesAtual(), -1)])) {
    const c = L.contasDoMes(ui.dados, mes).find((x) => x.id === id);
    if (c) return c;
  }
  return null;
}

// ---------- Eventos ----------

const acoes = {
  aba: (el) => { ui.aba = el.dataset.aba; if (ui.aba === 'inicio') ui.mes = mesAtual(); render(); window.scrollTo(0, 0); },
  'ir-mais': () => { ui.aba = 'mais'; render(); },
  'mes-ant': () => { ui.mes = L.somaMes(ui.mes, -1); render(); },
  'mes-prox': () => { ui.mes = L.somaMes(ui.mes, 1); render(); },
  'mes-hoje': () => { ui.mes = mesAtual(); render(); },
  'ver-mes': (el) => { ui.mes = el.dataset.mes; ui.aba = 'mes'; render(); window.scrollTo(0, 0); },
  fechar: fecharSheet,
  filtro: (el) => { ui.filtro = el.dataset.filtro; salvarFiltro(ui.filtro); render(); },

  pagar: (el) => {
    const c = acharConta(el.dataset.id);
    if (!c) return;
    if (c.pago) return marcarPaga(c, false);
    const variavel = c.origem === 'recorrente' && ui.dados.recorrentes.find((r) => r.id === c.origemId)?.variavel;
    if (variavel) return formPagar(c);
    marcarPaga(c, true);
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

  'novo-gasto': () => formGasto(null),
  'editar-gasto': (el) => { const g = ui.dados.gastos.find((x) => x.id === el.dataset.id); if (g) formGasto(g); },
  'excluir-gasto': (el) => {
    const g = ui.dados.gastos.find((x) => x.id === el.dataset.id);
    if (!g || !confirm(`Excluir o gasto "${g.descricao}"?`)) return;
    store.apagar('gastos', g.id, erroGravar);
    fecharSheet();
  },
  importar: () => document.getElementById('arquivo-backup').click(),

  'nova-categoria': (el) => {
    const nome = criarCategoria();
    if (!nome) return;
    const grupo = el.closest('.chips');
    let radio = [...grupo.querySelectorAll('input')].find((r) => r.value === nome);
    if (!radio) {
      const label = document.createElement('label');
      label.innerHTML = `<input type="radio" name="categoria" value="${esc(nome)}"><span>${esc(nome)}</span>`;
      grupo.insertBefore(label, el);
      radio = label.firstChild;
    }
    radio.checked = true;
  },
  'remover-categoria': (el) => {
    const nome = el.dataset.nome;
    if (!confirm(`Remover a categoria "${nome}" da lista? O que já foi lançado com ela continua igual.`)) return;
    store.gravar('config', 'geral', { categoriasExtras: (ui.dados.config.categoriasExtras || []).filter((c) => c !== nome) }, erroGravar);
  },
  'graf-mes': (el) => { ui.grafMes = el.dataset.mes; render(); },
  'ir-contas': () => { ui.aba = 'mes'; ui.mes = mesAtual(); render(); window.scrollTo(0, 0); },

  'lembrete-on': async () => {
    ui.notifOcupado = true; render();
    try {
      if (await Notification.requestPermission() !== 'granted') throw new Error('negado');
      await store.notificacoes.ativar(ui.user.uid);
      ui.notifLigada = true; gravarLocal('lembretes', '1');
      toast('Lembretes ativados neste celular');
    } catch (e) {
      toast(e.message === 'negado' ? 'Permissão de notificação não concedida.'
        : 'Não foi possível ativar. Confira a internet e tente de novo.');
    }
    ui.notifOcupado = false; render();
  },
  'lembrete-off': async () => {
    ui.notifOcupado = true; render();
    await store.notificacoes.desativar().catch(() => {});
    ui.notifLigada = false; gravarLocal('lembretes', '0');
    ui.notifOcupado = false; render();
    toast('Lembretes desativados neste celular');
  },

  'nova-meta': () => formMeta(null),
  'editar-meta': (el) => formMeta(ui.dados.metas.find((m) => m.id === el.dataset.id)),
  'excluir-meta': (el) => {
    const m = ui.dados.metas.find((x) => x.id === el.dataset.id);
    if (!m || !confirm(`Excluir a meta "${m.nome}"? Os depósitos já marcados continuam no histórico das contas.`)) return;
    store.apagar('metas', m.id, erroGravar);
    fecharSheet();
  },
  'inicio-vista': (el) => { ui.inicioVista = el.dataset.vista; render(); },
  'ir-plano': () => { ui.aba = 'plano'; render(); window.scrollTo(0, 0); },
  divisao: (el) => { store.gravar('config', 'geral', { divisao: el.dataset.modo }, erroGravar); },

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

  categoria: (form) => {
    const extras = ui.dados.config.categoriasExtras || [];
    const todas = [...new Set([...L.CATEGORIAS, ...L.CATEGORIAS_GASTO, ...extras])];
    const nome = L.normalizarCategoria(new FormData(form).get('categoria'), todas);
    if (!nome) return toast('Digite o nome da categoria.');
    if (todas.includes(nome)) return toast(`"${nome}" já existe.`);
    store.gravar('config', 'geral', { categoriasExtras: [...extras, nome] }, erroGravar);
    toast(`Categoria "${nome}" criada`);
  },

  nome: (form) => {
    const nome = new FormData(form).get('nome').trim();
    if (!nome) return toast('Informe seu nome.');
    store.gravar('config', 'geral', { pessoas: { [ui.user.uid]: nome } }, erroGravar);
    toast('Nome salvo');
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

  gasto: (form) => {
    const f = Object.fromEntries(new FormData(form));
    const erro = (msg) => { const p = form.querySelector('.erro'); p.textContent = msg; p.hidden = false; };
    const valor = L.parseValor(f.valor);
    if (!valor) return erro('Informe o valor, por exemplo 45,00.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data || '')) return erro('Informe o dia.');
    const categoria = f.categoria || 'Outros';
    const antigo = ui.dados.gastos.find((g) => g.id === form.dataset.id);
    store.gravar('gastos', antigo ? antigo.id : store.novoId('gastos'), {
      descricao: (f.descricao || '').trim() || categoria, valor, categoria, dono: f.dono || 'casa',
      data: f.data, mes: f.data.slice(0, 7),
      criadoEm: antigo?.criadoEm || Date.now(), criadoPor: antigo?.criadoPor || ui.user.email,
      pagamento: f.pagamento === 'cartao' ? 'cartao' : 'avista',
      pagoPorUid: antigo ? (antigo.pagoPorUid || null) : ui.user.uid,   // quem lança é quem pagou
    }, erroGravar);
    gravarLocal('pagamento', f.pagamento === 'cartao' ? 'cartao' : 'avista');
    if (!antigo) toast(`Gasto de ${L.fmtValor(valor)} anotado`);
    if (f.data.slice(0, 7) !== ui.mes) { ui.mes = f.data.slice(0, 7); render(); }
    fecharSheet();
  },

  limite: (form) => {
    const txt = new FormData(form).get('limite');
    const limiteGastos = txt.trim() === '' ? 0 : L.parseValor(txt);
    if (limiteGastos === null) return toast('Valor inválido. Exemplo: 800,00');
    store.gravar('config', 'geral', { limiteGastos }, erroGravar);
    toast(limiteGastos ? 'Limite salvo' : 'Limite removido');
  },

  pagar: (form) => {
    const c = acharConta(form.dataset.id);
    const valor = L.parseValor(new FormData(form).get('valor'));
    if (!c) return fecharSheet();
    if (valor === null) { const p = form.querySelector('.erro'); p.textContent = 'Informe o valor pago, por exemplo 129,90.'; p.hidden = false; return; }
    marcarPaga(c, true, valor);
    fecharSheet();
  },

  meta: (form) => {
    const f = Object.fromEntries(new FormData(form));
    const erro = (msg) => { const p = form.querySelector('.erro'); p.textContent = msg; p.hidden = false; };
    const nome = (f.nome || '').trim();
    if (!nome) return erro('Dê um nome para a meta.');
    const alvo = L.parseValor(f.alvo);
    if (!alvo) return erro('Informe quanto querem juntar, por exemplo 5.000,00.');
    const mensal = f.mensal.trim() === '' ? 0 : L.parseValor(f.mensal);
    const guardado = f.guardado.trim() === '' ? 0 : L.parseValor(f.guardado);
    if (mensal === null || guardado === null) return erro('Confira os valores. Exemplo: 300,00.');
    const dia = Number(f.dia) || 5;
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) return erro('O dia vai de 1 a 31.');
    const antiga = ui.dados.metas.find((m) => m.id === form.dataset.id);
    store.gravar('metas', antiga ? antiga.id : store.novoId('metas'),
      { nome, alvo, mensal, guardado, dia, dono: f.dono || 'casa', desde: antiga?.desde || mesAtual() }, erroGravar);
    fecharSheet();
  },

  rendas: (form) => {
    const rendas = {};
    for (const [campo, txt] of new FormData(form)) {
      const v = txt.trim() === '' ? 0 : L.parseValor(txt);
      if (v === null) return toast('Valor inválido. Exemplo: 3.500,00');
      rendas[campo.replace('renda_', '')] = v;
    }
    store.gravar('config', 'geral', { rendas }, erroGravar);
    toast('Renda salva');
  },

  rec: (form) => {
    const lido = lerForm(form);
    if (!lido) return;
    const { f, out } = lido;
    const antiga = ui.dados.recorrentes.find((r) => r.id === form.dataset.id);
    const dados = { ...out, variavel: f.variavel === 'on', tipo: f.tipo === 'anual' ? 'anual' : 'mensal', mes: f.tipo === 'anual' ? Number(f.mes) : null,
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
    const dados = { nome: out.nome, valorParcela: out.valor, categoria: out.categoria, dono: out.dono, dia: out.dia, total, naFatura: f.naFatura === 'on',
      inicio: L.somaMes(mesAtual(), -(atual - 1)), desde: antiga?.desde || mesAtual() };
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
  if (ev.target.id === 'arquivo-backup' && ev.target.files[0]) restaurar(ev.target);
  if (ev.target.name === 'categoria' && ev.target.value === '__nova') {
    const sel = ev.target;
    const nome = criarCategoria();
    if (!nome) { sel.value = 'Outros'; return; }
    if (![...sel.options].some((o) => o.value === nome)) sel.insertBefore(new Option(nome, nome), [...sel.options].find((o) => o.value === 'Outros'));
    sel.value = nome;
  }
});
// Ao escolher uma descrição já usada, marca a mesma categoria da última vez.
document.addEventListener('input', (ev) => {
  if (ev.target.name !== 'descricao' || ev.target.form.dataset.id) return;
  const txt = ev.target.value.trim().toLowerCase();
  const s = L.sugestoesGasto(ui.dados.gastos).find((x) => x.descricao.toLowerCase() === txt);
  const radio = s && [...ev.target.form.querySelectorAll('[name=categoria]')].find((r) => r.value === s.categoria);
  if (radio) radio.checked = true;
});

async function restaurar(input) {
  const lido = L.lerBackup(await input.files[0].text());
  input.value = '';
  if (lido.erro) return toast(lido.erro);
  const n = lido.itens.length;
  if (!confirm(`Restaurar ${n} ${n === 1 ? 'item' : 'itens'} deste backup? O que existir com a mesma identificação volta a ser como no arquivo. Nada é apagado.`)) return;
  for (const [col, id, dados] of lido.itens) store.gravar(col, id, dados, erroGravar);
  toast('Backup restaurado');
}
window.addEventListener('online', render);
window.addEventListener('offline', render);

// ---------- Início ----------

// Atalho do ícone do app (segurar o ícone > "Novo gasto"): abre direto no formulário.
function abrirAtalho() {
  const url = new URL(location.href);
  const novo = url.searchParams.get('novo');
  if (!novo) return;
  url.searchParams.delete('novo');
  history.replaceState(null, '', url);
  if (novo === 'gasto') { ui.aba = 'gastos'; render(); formGasto(null); }
  if (novo === 'conta') { ui.aba = 'mes'; render(); formConta(null); }
}

let registrou = false;
store.onAuth((user) => {
  registrou = false;
  pararEscuta?.();
  pararEscuta = null;
  ui.user = user;
  ui.dados = null;
  if (user && store.notificacoes) {
    store.notificacoes.suportado().then((ok) => {
      ui.notifOk = ok; render();
      // Mantém o registro do aparelho em dia (o código de entrega pode mudar com o tempo).
      if (ok && ui.notifLigada && Notification.permission === 'granted') store.notificacoes.ativar(user.uid).catch(() => {});
    });
  }
  if (user) {
    pararEscuta = store.subscribe(
      (dados) => {
        const primeira = !ui.dados;
        ui.dados = { gastos: [], metas: [], ...dados };
        if (primeira) {
          // renda única antiga passa a ser a renda de quem abriu o app primeiro
          if (dados.config.renda && !dados.config.rendas) store.gravar('config', 'geral', { rendas: { [user.uid]: dados.config.renda } }, erroGravar);
          // parcelamentos criados antes de existir o campo "desde"
          for (const p of dados.parcelamentos) if (!p.desde) store.gravar('parcelamentos', p.id, { desde: mesAtual() }, erroGravar);
        }
        if (!dados.config.pessoas?.[user.uid] && !registrou) {   // primeira vez neste aparelho/conta
          registrou = true;
          store.gravar('config', 'geral', { pessoas: { [user.uid]: L.nomePadrao(user.email) } }, erroGravar);
        }
        render();
        if (primeira) abrirAtalho();
      },
      (msg) => toast(msg),
    );
  }
  render();
});

if (!demo && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
