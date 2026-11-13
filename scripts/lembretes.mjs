// Lembrete diário de vencimento. Roda no GitHub Actions (.github/workflows/lembretes.yml).
// Lê as contas no Firestore e envia uma notificação para cada celular registrado.
//
// ATENÇÃO: o registro de execução de um repositório público é público.
// Este script nunca imprime nomes de contas, valores, e-mails ou códigos de aparelho.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import * as L from '../logic.js';

const chave = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!chave) {
  console.error('Falta o segredo FIREBASE_SERVICE_ACCOUNT (Settings > Secrets and variables > Actions).');
  process.exit(1);
}
let conta;
try { conta = JSON.parse(chave); } catch {
  console.error('O segredo FIREBASE_SERVICE_ACCOUNT não é um JSON válido. Cole o conteúdo inteiro do arquivo da chave.');
  process.exit(1);
}
const teste = process.env.TESTE === 'true';

initializeApp({ credential: cert(conta) });
const db = getFirestore();

const ler = async (col) => (await db.collection(col).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const [contas, recorrentes, parcelamentos, metas, gastos, dispositivos] = await Promise.all(
  ['contas', 'recorrentes', 'parcelamentos', 'metas', 'gastos', 'dispositivos'].map(ler));
const dados = { contas, recorrentes, parcelamentos, metas, gastos };

// "Hoje" no horário de Brasília, não no do servidor.
const hoje = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const mes = hoje.slice(0, 7);
const lista = [...L.contasDoMes(dados, L.somaMes(mes, -1)), ...L.contasDoMes(dados, mes),
  ...(hoje.slice(8) >= '28' ? L.contasDoMes(dados, L.somaMes(mes, 1)) : [])]; // fim do mês: "amanhã" pode ser dia 1º

// Avisos do dia para uma pessoa: vencimentos (todo dia), resumo da semana (segunda) e fechamento (dia 1º).
function avisosDe(uid) {
  if (teste) return [{ titulo: 'Teste de lembrete', corpo: 'As notificações do Contas da Casa estão funcionando.', tag: 'teste' }];
  const avisos = [];
  const venc = L.lembrete(lista, hoje, uid);
  if (venc) avisos.push({ ...venc, tag: 'lembrete-contas' });
  const semana = L.diaDaSemana(hoje) === 1 && L.resumoSemana(dados, hoje, uid);
  if (semana) avisos.push({ ...semana, tag: 'resumo-semana' });
  const fecho = hoje.slice(8) === '01' && L.fechamento(dados, hoje);
  if (fecho) avisos.push({ ...fecho, tag: 'fechamento-mes' });
  return avisos;
}

let enviadas = 0, semAviso = 0, removidos = 0, falhas = 0;
for (const d of dispositivos) {
  const avisos = avisosDe(d.uid);
  if (!avisos.length) { semAviso++; continue; }
  for (const aviso of avisos) {
    try {
      await getMessaging().send({
        token: d.id,
        data: { title: aviso.titulo, body: aviso.corpo, tag: aviso.tag },
        webpush: { headers: { Urgency: 'high', TTL: '43200' } },
      });
      enviadas++;
    } catch (e) {
      if (['messaging/registration-token-not-registered', 'messaging/invalid-argument'].includes(e.code)) {
        await db.collection('dispositivos').doc(d.id).delete();   // app desinstalado ou registro vencido
        removidos++;
        break;
      }
      falhas++; console.error('Falha no envio:', e.code || 'erro desconhecido');
    }
  }
}
console.log(`Aparelhos: ${dispositivos.length} | enviadas: ${enviadas} | sem nada a avisar: ${semAviso} | registros removidos: ${removidos} | falhas: ${falhas}`);
if (falhas) process.exit(1);
