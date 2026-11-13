// Camada de dados: Firebase Auth + Firestore (com cache offline).
const V = '13.3.0';
const base = `https://www.gstatic.com/firebasejs/${V}`;

const { initializeApp } = await import(`${base}/firebase-app.js`);
const { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } =
  await import(`${base}/firebase-auth.js`);
const {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, setDoc, deleteDoc,
} = await import(`${base}/firebase-firestore.js`);

// Estes valores identificam o projeto e não são segredo:
// o acesso é protegido pelo login e pelas regras do Firestore.
const firebaseConfig = {
  apiKey: 'AIzaSyBpmThQmHxkEhq35nawn813wHh3CSpmgcM',
  authDomain: 'contas-casa-f0a6b.firebaseapp.com',
  projectId: 'contas-casa-f0a6b',
  storageBucket: 'contas-casa-f0a6b.firebasestorage.app',
  messagingSenderId: '309519287092',
  appId: '1:309519287092:web:8ffc6bf496c242d1ab1b61',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch (e) {
  db = initializeFirestore(app, {}); // navegador sem IndexedDB: segue sem cache offline
}

const ERROS = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
  'auth/network-request-failed': 'Sem internet. Conecte-se para entrar.',
  'auth/unauthorized-domain': 'Este endereço não está autorizado no Firebase (Authentication > Configurações > Domínios autorizados).',
};

export default {
  demo: false,

  onAuth(cb) {
    return onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email } : null));
  },

  async login(email, senha) {
    try { await signInWithEmailAndPassword(auth, email, senha); }
    catch (e) { throw new Error(ERROS[e.code] || 'Não foi possível entrar. Tente de novo.'); }
  },

  logout() { return signOut(auth); },

  // Escuta tudo em tempo real. cb(dados) a cada mudança; onErro(msg) se falhar.
  subscribe(cb, onErro) {
    const dados = { contas: [], recorrentes: [], parcelamentos: [], config: {} };
    const prontos = new Set();
    const avisar = (chave) => { prontos.add(chave); if (prontos.size === 4) cb({ ...dados }); };
    const falha = (e) => onErro(e.code === 'permission-denied'
      ? 'Sem permissão para ler os dados. Confira as regras do Firestore.'
      : 'Erro ao carregar os dados.');
    const lista = (nome) => onSnapshot(collection(db, nome), (snap) => {
      dados[nome] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      avisar(nome);
    }, falha);
    const paradas = [
      lista('contas'), lista('recorrentes'), lista('parcelamentos'),
      onSnapshot(doc(db, 'config', 'geral'), (d) => { dados.config = d.data() || {}; avisar('config'); }, falha),
    ];
    return () => paradas.forEach((p) => p());
  },

  novoId(col) { return doc(collection(db, col)).id; },

  // Sem await de propósito: offline, a gravação fica na fila e sincroniza depois.
  gravar(col, id, dados, onErro) {
    setDoc(doc(db, col, id), dados, { merge: true }).catch((e) => onErro?.(e));
  },
  apagar(col, id, onErro) {
    deleteDoc(doc(db, col, id)).catch((e) => onErro?.(e));
  },
};
