import express from 'express';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

/* ───────── Base de données (montants stockés en centimes) ───────── */
const db = new Database(process.env.DB_FILE || 'souverain.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL,
  name TEXT NOT NULL, client_no TEXT NOT NULL, last_login TEXT);
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  label TEXT NOT NULL, kind TEXT NOT NULL, number TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0, note TEXT);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
  label TEXT NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL,
  date TEXT NOT NULL, note TEXT);
CREATE TABLE IF NOT EXISTS beneficiaries (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, iban TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  from_advisor INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id, date DESC);
`);

if (!db.prepare('PRAGMA table_info(accounts)').all().some((c) => c.name === 'status'))
  db.exec("ALTER TABLE accounts ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
const BLOCKED_MSG = 'Compte bloqué : opération impossible. Contactez votre conseiller.';
const blocked = () => Object.assign(new Error(BLOCKED_MSG), { status: 403, code: 'ACCOUNT_BLOCKED' });

function seed() {
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c) return;
  const uid = db.prepare('INSERT INTO users (email,pass_hash,name,client_no) VALUES (?,?,?,?)')
    .run('juliana0kender@gmail.com', bcrypt.hashSync('juli@n@321kender', 10), 'Juliana Kender', '902831').lastInsertRowid;
  const acc = db.prepare('INSERT INTO accounts (user_id,label,kind,number,balance,note) VALUES (?,?,?,?,?,?)');
  const a1 = acc.run(uid, 'Compte Courant', 'courant', '0730 3041 809', 150000000, 'Solde disponible').lastInsertRowid;
  acc.run(uid, 'Livret Épargne', 'epargne', '0812 9920 114', 150000000, 'Taux fixe 3,85 %');
  const tx = db.prepare('INSERT INTO transactions (account_id,label,kind,amount,date,note) VALUES (?,?,?,?,?,?)');
  tx.run(a1, 'Cabinet Horizon', 'Virement SEPA', 150000, '2025-06-19', 'Règlement facture #4892');
  tx.run(a1, 'Souverain Patrimoine', 'Prélèvement', -24500, '2025-06-15', 'Gestion mensualisée');
  tx.run(a1, 'Restaurant Le Levantin', 'Carte bancaire', -18050, '2025-06-12', 'Carte **** 9012');
  tx.run(a1, 'Intérêts Livret', 'Crédit d\'intérêts', 31200, '2025-06-01', 'Versement semestriel');
  const ben = db.prepare('INSERT INTO beneficiaries (user_id,name,iban) VALUES (?,?,?)');
  ben.run(uid, 'Cabinet Horizon', 'FR76 3000 2005 0000 0000 0912');
  ben.run(uid, 'Souverain Patrimoine', 'FR76 1002 0000 0000 0000 0401');
  db.prepare('INSERT INTO messages (user_id,from_advisor,body,created_at) VALUES (?,?,?,?)')
    .run(uid, 1, 'Bonjour Juliana , votre synthèse trimestrielle est prête. Avez-vous des questions ?', new Date().toISOString());
}
seed();

// Second compte de démo, bloqué dès le départ (recréé à chaque démarrage si absent)
function seedBlocked() {
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get('julianakender@gmail.com')) return;
  const uid = db.prepare('INSERT INTO users (email,pass_hash,name,client_no) VALUES (?,?,?,?)')
    .run('Juliana0Kender@gmail.com', bcrypt.hashSync('juli@n@3210kender', 10), 'Juliana Kender', '902832').lastInsertRowid;
  const accId = db.prepare("INSERT INTO accounts (user_id,label,kind,number,balance,note,status) VALUES (?,?,?,?,?,?,'blocked')")
    .run(uid, 'Compte Courant', 'courant', '0730 3041 810', 150000000, 'Solde disponible').lastInsertRowid;
  db.prepare('INSERT INTO transactions (account_id,label,kind,amount,date,note) VALUES (?,?,?,?,?,?)')
    .run(accId, 'Patrimoine', 'Virement SEPA', 15000000, '2025-06-01', 'Patrimoine ');
  db.prepare('INSERT INTO beneficiaries (user_id,name,iban) VALUES (?,?,?)')
    .run(uid, 'Cabinet Horizon', 'FR76 3000 2005 0000 0000 0912');
}
seedBlocked();

/* ───────── App ───────── */
const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const auth = (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Session expirée, reconnectez-vous.' }); }
};
const attempts = new Map(); // anti brute-force minimal (en mémoire)

app.post('/api/auth/login', (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const key = req.ip, a = attempts.get(key) || { n: 0, t: Date.now() };
  if (a.n >= 5 && Date.now() - a.t < 60_000) return res.status(429).json({ error: 'Trop de tentatives, patientez 1 min.' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!user || !bcrypt.compareSync(String(password), user.pass_hash)) {
    attempts.set(key, { n: a.n + 1, t: Date.now() });
    return res.status(401).json({ error: 'Identifiants invalides.' });
  }
  attempts.delete(key);
  const previous = user.last_login;
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(new Date().toISOString(), user.id);
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ token, user: { name: user.name, clientNo: user.client_no, lastLogin: previous } });
});

app.get('/api/me', auth, (req, res) => {
  const u = db.prepare('SELECT name, client_no, last_login FROM users WHERE id = ?').get(req.user.id);
  res.json({ name: u.name, clientNo: u.client_no, lastLogin: u.last_login });
});

app.get('/api/accounts', auth, (req, res) =>
  res.json(db.prepare('SELECT id,label,kind,number,balance,note,status FROM accounts WHERE user_id = ?').all(req.user.id)));

app.get('/api/transactions', auth, (req, res) => {
  const { account, q = '' } = req.query;
  const rows = db.prepare(`
    SELECT t.id,t.label,t.kind,t.amount,t.date,t.note,t.account_id FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE a.user_id = @uid AND (@acc IS NULL OR a.id = @acc)
      AND (t.label LIKE @q OR t.kind LIKE @q OR t.note LIKE @q)
    ORDER BY t.date DESC, t.id DESC LIMIT 100`)
    .all({ uid: req.user.id, acc: account ? Number(account) : null, q: `%${q}%` });
  res.json(rows);
});

app.get('/api/beneficiaries', auth, (req, res) =>
  res.json(db.prepare('SELECT id,name,iban FROM beneficiaries WHERE user_id = ?').all(req.user.id)));

app.post('/api/beneficiaries', auth, (req, res) => {
  if (db.prepare("SELECT 1 FROM accounts WHERE user_id = ? AND status = 'blocked'").get(req.user.id))
    return res.status(403).json({ error: BLOCKED_MSG, code: 'ACCOUNT_BLOCKED' });
  const name = String(req.body?.name || '').trim().slice(0, 80);
  const iban = String(req.body?.iban || '').replace(/\s/g, '').toUpperCase();
  if (!name) return res.status(400).json({ error: 'Nom requis.' });
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return res.status(400).json({ error: 'IBAN invalide.' });
  const id = db.prepare('INSERT INTO beneficiaries (user_id,name,iban) VALUES (?,?,?)').run(req.user.id, name, iban).lastInsertRowid;
  res.status(201).json({ id, name, iban });
});

// Virement atomique : débit + crédit éventuel + écritures, ou rien.
const doTransfer = db.transaction((uid, fromId, to, cents, reason) => {
  const from = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(fromId, uid);
  if (!from) throw Object.assign(new Error('Compte débiteur introuvable.'), { status: 404 });
  if (from.status === 'blocked') throw blocked();
  if (from.balance < cents) throw Object.assign(new Error('Solde insuffisant.'), { status: 422 });
  const today = new Date().toISOString().slice(0, 10);
  const ins = db.prepare('INSERT INTO transactions (account_id,label,kind,amount,date,note) VALUES (?,?,?,?,?,?)');
  let label;
  if (to.type === 'a') {
    const dest = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(to.id, uid);
    if (!dest || dest.id === from.id) throw Object.assign(new Error('Compte destinataire invalide.'), { status: 400 });
    if (dest.status === 'blocked') throw blocked();
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(cents, dest.id);
    ins.run(dest.id, `Virement depuis ${from.label}`, 'Virement interne', cents, today, reason);
    label = dest.label;
  } else {
    const b = db.prepare('SELECT * FROM beneficiaries WHERE id = ? AND user_id = ?').get(to.id, uid);
    if (!b) throw Object.assign(new Error('Bénéficiaire introuvable.'), { status: 404 });
    label = b.name;
  }
  db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(cents, from.id);
  ins.run(from.id, `Virement - ${label}`, 'Virement SEPA', -cents, today, reason);
  return { to: label, newBalance: from.balance - cents };
});

app.post('/api/transfers', auth, wrap((req, res) => {
  const { fromAccountId, to, amount, reason = '' } = req.body || {};
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isFinite(cents) || cents <= 0 || cents > 10_000_000_00)
    return res.status(400).json({ error: 'Montant invalide.' });
  const [type, id] = String(to || '').split(':');
  if (!['a', 'b'].includes(type) || !Number(id)) return res.status(400).json({ error: 'Destinataire invalide.' });
  try {
    res.json(doTransfer(req.user.id, Number(fromAccountId), { type, id: Number(id) }, cents, String(reason).slice(0, 140)));
  } catch (e) { res.status(e.status || 500).json({ error: e.message, code: e.code }); }
}));

app.get('/api/messages', auth, (req, res) =>
  res.json(db.prepare('SELECT id,from_advisor,body,created_at FROM messages WHERE user_id = ? ORDER BY id').all(req.user.id)));

app.post('/api/messages', auth, (req, res) => {
  const body = String(req.body?.body || '').trim().slice(0, 500);
  if (!body) return res.status(400).json({ error: 'Message vide.' });
  const ins = db.prepare('INSERT INTO messages (user_id,from_advisor,body,created_at) VALUES (?,?,?,?)');
  const now = new Date().toISOString();
  ins.run(req.user.id, 0, body, now);
  const reply = `Bien reçu, je prends en charge votre demande : « ${body.slice(0, 60)} ». Je reviens vers vous rapidement.`;
  ins.run(req.user.id, 1, reply, now);
  res.status(201).json({ reply });
});

// Back-office : bloquer / débloquer un compte (protégé par une clé admin)
app.patch('/api/admin/accounts/:id', (req, res) => {
  if (req.headers['x-admin-key'] !== (process.env.ADMIN_KEY || 'admin-dev')) return res.status(403).json({ error: 'Interdit.' });
  const status = req.body?.status === 'blocked' ? 'blocked' : 'active';
  const r = db.prepare('UPDATE accounts SET status = ? WHERE id = ?').run(status, req.params.id);
  r.changes ? res.json({ id: Number(req.params.id), status }) : res.status(404).json({ error: 'Compte introuvable.' });
});

app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Erreur serveur.' }); });
app.listen(PORT, () => console.log(`Souverain Hub → http://localhost:${PORT}  (Juliana0Kender@gmail.com / Juli@n@321Kender)`));
