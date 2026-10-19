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

// Nécessite d'avoir appliqué patch-blocage.mjs avant (colonne "status").
edit('server.js', [
  ['\nseed();\n', `
seed();

// Second compte de démo, bloqué dès le départ (recréé à chaque démarrage si absent)
function seedBlocked() {
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get('bloque@souverain.dev')) return;
  const uid = db.prepare('INSERT INTO users (email,pass_hash,name,client_no) VALUES (?,?,?,?)')
    .run('bloque@souverain.dev', bcrypt.hashSync('demo1234', 10), 'Sam Bernard', '902832').lastInsertRowid;
  const accId = db.prepare("INSERT INTO accounts (user_id,label,kind,number,balance,note,status) VALUES (?,?,?,?,?,?,'blocked')")
    .run(uid, 'Compte Courant', 'courant', '0730 3041 810', 215000, 'Solde disponible').lastInsertRowid;
  db.prepare('INSERT INTO transactions (account_id,label,kind,amount,date,note) VALUES (?,?,?,?,?,?)')
    .run(accId, 'Salaire', 'Virement SEPA', 215000, '2025-06-01', 'Salaire de juin');
  db.prepare('INSERT INTO beneficiaries (user_id,name,iban) VALUES (?,?,?)')
    .run(uid, 'Cabinet Horizon', 'FR76 3000 2005 0000 0000 0912');
}
seedBlocked();
`],
], 'seedBlocked');

edit('public/api.js', [
  ['Se connecter</button>' + String.fromCharCode(96) + ';', `Se connecter</button>
    <div class="flex gap-2 text-[10px]">
      <button type="button" data-fill="demo@souverain.dev" class="flex-1 border border-slate-200 rounded-lg py-1.5 text-slate-600">Compte normal</button>
      <button type="button" data-fill="bloque@souverain.dev" class="flex-1 border border-rose-200 rounded-lg py-1.5 text-rose-600">Compte bloqué</button>
    </div>` + String.fromCharCode(96) + ';'],
  ["$('#lgBtn').onclick = submit;", `$('#lgBtn').onclick = submit;
  el.querySelectorAll('[data-fill]').forEach((b) => (b.onclick = () => { $('#lgEmail').value = b.dataset.fill; $('#lgPwd').value = 'demo1234'; }));`],
], 'data-fill');
