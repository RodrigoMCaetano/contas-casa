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
const [contas, recorrentes, parcelamentos, dispositivos] = await Promise.all(
  ['contas', 'recorrentes', 'parcelamentos', 'dispositivos'].map(ler));
const dados = { contas, recorrentes, parcelamentos };

// "Hoje" no horário de Brasília, não no do servidor.
const hoje = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const mes = hoje.slice(0, 7);
const lista = [...L.contasDoMes(dados, L.somaMes(mes, -1)), ...L.contasDoMes(dados, mes),
  ...(hoje.slice(8) >= '28' ? L.contasDoMes(dados, L.somaMes(mes, 1)) : [])]; // fim do mês: "amanhã" pode ser dia 1º

let enviadas = 0, semAviso = 0, removidos = 0, falhas = 0;
for (const d of dispositivos) {
  const aviso = teste
    ? { titulo: 'Teste de lembrete', corpo: 'As notificações do Contas da Casa estão funcionando.' }
    : L.lembrete(lista, hoje, d.uid);
  if (!aviso) { semAviso++; continue; }
  try {
    await getMessaging().send({
      token: d.id,
      data: { title: aviso.titulo, body: aviso.corpo },
      webpush: { headers: { Urgency: 'high', TTL: '43200' } },
    });
    enviadas++;
  } catch (e) {
    if (['messaging/registration-token-not-registered', 'messaging/invalid-argument'].includes(e.code)) {
      await db.collection('dispositivos').doc(d.id).delete();   // app desinstalado ou registro vencido
      removidos++;
    } else { falhas++; console.error('Falha no envio:', e.code || 'erro desconhecido'); }
  }
}
console.log(`Aparelhos: ${dispositivos.length} | enviadas: ${enviadas} | sem nada a avisar: ${semAviso} | registros removidos: ${removidos} | falhas: ${falhas}`);
if (falhas) process.exit(1);
