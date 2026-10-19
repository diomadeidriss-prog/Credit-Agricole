import fs from 'node:fs';

function edit(file, pairs, marker) {
  let s = fs.readFileSync(file, 'utf8');
  if (s.includes(marker)) { console.log(file + ' : déjà à jour'); return; }
  for (const [from, to] of pairs) {
    if (!s.includes(from)) { console.error('Introuvable dans ' + file + ' : ' + from.slice(0, 60)); process.exit(1); }
    s = s.replace(from, () => to);
  }
  fs.writeFileSync(file, s);
  console.log(file + ' : modifié');
}

edit('server.js', [
  ['function seed() {', `if (!db.prepare('PRAGMA table_info(accounts)').all().some((c) => c.name === 'status'))
  db.exec("ALTER TABLE accounts ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
const BLOCKED_MSG = 'Compte bloqué : opération impossible. Contactez votre conseiller.';
const blocked = () => Object.assign(new Error(BLOCKED_MSG), { status: 403, code: 'ACCOUNT_BLOCKED' });

function seed() {`],
  ['SELECT id,label,kind,number,balance,note FROM accounts', 'SELECT id,label,kind,number,balance,note,status FROM accounts'],
  ['  if (from.balance < cents)', "  if (from.status === 'blocked') throw blocked();\n  if (from.balance < cents)"],
  ['    db.prepare(\'UPDATE accounts SET balance = balance + ? WHERE id = ?\').run(cents, dest.id);', "    if (dest.status === 'blocked') throw blocked();\n    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(cents, dest.id);"],
  ['res.status(e.status || 500).json({ error: e.message });', 'res.status(e.status || 500).json({ error: e.message, code: e.code });'],
  ["  const name = String(req.body?.name || '').trim().slice(0, 80);", `  if (db.prepare("SELECT 1 FROM accounts WHERE user_id = ? AND status = 'blocked'").get(req.user.id))
    return res.status(403).json({ error: BLOCKED_MSG, code: 'ACCOUNT_BLOCKED' });
  const name = String(req.body?.name || '').trim().slice(0, 80);`],
  ['app.use((err, _req', `// Back-office : bloquer / débloquer un compte (protégé par une clé admin)
app.patch('/api/admin/accounts/:id', (req, res) => {
  if (req.headers['x-admin-key'] !== (process.env.ADMIN_KEY || 'admin-dev')) return res.status(403).json({ error: 'Interdit.' });
  const status = req.body?.status === 'blocked' ? 'blocked' : 'active';
  const r = db.prepare('UPDATE accounts SET status = ? WHERE id = ?').run(status, req.params.id);
  r.changes ? res.json({ id: Number(req.params.id), status }) : res.status(404).json({ error: 'Compte introuvable.' });
});

app.use((err, _req`],
], 'BLOCKED_MSG');

edit('public/api.js', [
  ['capitalize">${esc(a.kind)}</span>', `capitalize">\${esc(a.kind)}</span>\${a.status === 'blocked' ? '<span class="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full ml-1"><i class="fa-solid fa-lock mr-1"></i>Bloqué</span>' : ''}`],
], 'Bloqué</span>');
