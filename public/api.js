/* Couche client : remplace les données statiques de la maquette par l'API. */
const $ = (s, r = document) => r.querySelector(s);
const eur = (c) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(c / 100);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fdate = (d) => new Date(d).toLocaleDateString('fr-FR');
const state = { token: sessionStorage.getItem('sh_token'), user: null, accounts: [], txs: [] };

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(state.token && { Authorization: 'Bearer ' + state.token }) },
    body: opts.body && JSON.stringify(opts.body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.token) return logout();
  if (!res.ok) throw new Error(data.error || 'Erreur réseau');
  return data;
}

/* ───── Écran de connexion ───── */
function mountLogin() {
  if ($('#loginView')) return;
  const el = document.createElement('div');
  el.id = 'loginView';
  el.className = 'absolute inset-0 z-[60] bg-white flex flex-col justify-center px-8 space-y-4';
  el.innerHTML = `
    <div class="text-center space-y-1">
      <img src="Credit-Agricole-logo.png" alt="Logo" class="w-14 h-14 mx-auto rounded-2xl object-contain">
      <h1 class="text-ca-green font-extrabold uppercase tracking-tight">Crédit Agricole</h1>
    </div>
    <input id="lgEmail" type="email" value="" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs" placeholder="Email">
    <input id="lgPwd" type="password" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs" placeholder="Mot de passe">
    <button id="lgBtn" class="w-full bg-ca-green text-white font-bold py-3 rounded-xl text-xs">Se connecter</button>
`;
  $('.mobile-container').appendChild(el);
  const submit = async () => {
    try {
      const r = await api('/auth/login', { method: 'POST', body: { email: $('#lgEmail').value, password: $('#lgPwd').value } });
      state.token = r.token; state.user = r.user; sessionStorage.setItem('sh_token', r.token);
      el.remove(); await loadAll();
    } catch (e) { showToast(e.message); }
  };
  $('#lgBtn').onclick = submit;
  el.querySelectorAll('[data-fill]').forEach((b) => (b.onclick = () => { $('#lgEmail').value = b.dataset.fill; $('#lgPwd').value = ''; }));
  $('#lgPwd').onkeydown = (e) => e.key === 'Enter' && submit();
}
function logout() {
  sessionStorage.removeItem('sh_token'); state.token = null; mountLogin();
  showToast('Déconnexion effectuée avec succès');
}
window.logoutUser = logout;

/* ───── Rendu ───── */
const iconFor = (t) => (t.amount > 0 ? ['bg-emerald-100 text-emerald-700', 'fa-arrow-down'] : ['bg-slate-100 text-slate-700', 'fa-arrow-up']);
function txRow(t, small) {
  const [cls, ico] = iconFor(t);
  const size = small ? 'w-9 h-9' : 'w-8 h-8';
  return `<div class="tx-item flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer" data-tx="${t.id}">
    <div class="flex items-center space-x-3"><div class="${size} rounded-full ${cls} flex items-center justify-center text-xs"><i class="fa-solid ${ico}"></i></div>
    <div><p class="text-xs font-bold text-slate-800">${esc(t.label)}</p><p class="text-[10px] text-slate-400">${fdate(t.date)} • ${esc(t.kind)}</p></div></div>
    <span class="text-xs font-bold ${t.amount > 0 ? 'text-emerald-600' : 'text-slate-900'}">${t.amount > 0 ? '+' : ''}${eur(t.amount)}</span></div>`;
}
function bindTx(root) {
  root.querySelectorAll('[data-tx]').forEach((n) => (n.onclick = () => {
    const t = state.txs.find((x) => x.id == n.dataset.tx);
    openTransactionModal(t.label, (t.amount > 0 ? '+' : '') + eur(t.amount), fdate(t.date), t.note || 'Aucun détail supplémentaire.');
  }));
}
const badge = { courant: 'bg-emerald-100 text-emerald-800', epargne: 'bg-blue-100 text-blue-800' };

function render() {
  const { user, accounts, txs } = state;
  const main = accounts.find((a) => a.kind === 'courant') || accounts[0];
  const savings = accounts.filter((a) => a.kind === 'epargne').reduce((s, a) => s + a.balance, 0);
  const up = user.name.toUpperCase();
  $('#tab-accueil p.uppercase').textContent = up;
  $('#tab-accueil .bg-ca-green h2').textContent = up;
  $('#tab-accueil .bg-ca-green p').textContent = `COMPTE DE DÉPÔT n°${main.number.replace(/\s/g, '')}`;
  $('#tab-accueil .text-3xl').textContent = eur(main.balance);
  if (user.lastLogin) $('#tab-accueil .text-slate-500.text-\\[11px\\]').textContent = new Date(user.lastLogin).toLocaleString('fr-FR');
  $('#tab-accueil .bg-white .space-y-3').innerHTML = txs.slice(0, 3).map((t) => txRow(t, true)).join('');
  bindTx($('#tab-accueil'));
  $('#tab-accueil strong.font-bold.text-slate-900:last-of-type') && ($('#tab-accueil .fa-piggy-bank').nextElementSibling.querySelector('strong').textContent = eur(savings));
  $('#tab-comptes > .space-y-3').innerHTML = accounts.map((a) => `
    <div class="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
      <div class="flex justify-between items-start"><div>
        <span class="${badge[a.kind] || badge.courant} text-[10px] font-bold px-2 py-0.5 rounded-full capitalize">${esc(a.kind)}</span>${a.status === 'blocked' ? '<span class="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full ml-1"><i class="fa-solid fa-lock mr-1"></i>Bloqué</span>' : ''}
        <h3 class="text-xs font-bold text-slate-900 mt-1">${esc(a.label)}</h3><p class="text-[10px] text-slate-400">N° ${esc(a.number)}</p></div>
        <span class="text-base font-black text-slate-900">${eur(a.balance)}</span></div>
      <div class="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center text-xs">
        <span class="text-[11px] text-slate-500">${esc(a.note || '')}</span>
        <button data-acc="${a.id}" class="text-ca-green font-semibold hover:underline">Voir l'historique →</button></div></div>`).join('');
  document.querySelectorAll('[data-acc]').forEach((b) => (b.onclick = () => filterTransactions(b.dataset.acc)));
  renderTxList();
  $('#tab-menu h3').textContent = up;
  $('#tab-menu .bg-ca-green.rounded-full').textContent = user.name.split(' ').map((w) => w[0]).join('');
  $('#tab-menu p.text-\\[10px\\]').textContent = `Profil Privilège • Client #${user.clientNo}`;
  $('#transferFrom').innerHTML = accounts.map((a) => `<option value="${a.id}">${esc(a.label)} - ${eur(a.balance)}</option>`).join('');
  renderBeneficiaries();
}
function renderTxList() {
  const box = $('#txList');
  box.innerHTML = state.txs.map((t) => txRow(t)).join('') || '<p class="text-xs text-slate-400 text-center py-4">Aucune opération</p>';
  bindTx(box);
}
let benCache = [];
async function renderBeneficiaries(selectValue) {
  benCache = await api('/beneficiaries');
  const own = state.accounts.slice(1).map((a) => `<option value="a:${a.id}">Mon ${esc(a.label)}</option>`);
  $('#transferTo').innerHTML = benCache.map((b) => `<option value="b:${b.id}">${esc(b.name)} - ${esc(b.iban.slice(0, 9))}…${esc(b.iban.slice(-3))}</option>`).join('') + own.join('');
  if (selectValue) $('#transferTo').value = selectValue;
}
async function renderChat() {
  const msgs = await api('/messages');
  $('#chatBox').innerHTML = msgs.map((m) => m.from_advisor
    ? `<div class="bg-white p-2.5 rounded-2xl rounded-tl-none border border-slate-200 max-w-[85%] text-slate-700">${esc(m.body)}</div>`
    : `<div class="bg-ca-green text-white p-2.5 rounded-2xl rounded-tr-none max-w-[85%] ml-auto">${esc(m.body)}</div>`).join('');
  $('#chatBox').scrollTop = 1e6;
}
async function loadAll() {
  [state.accounts, state.txs] = await Promise.all([api('/accounts'), api('/transactions')]);
  render(); renderChat();
}

/* ───── Actions (écrasent les fonctions de la maquette) ───── */
window.filterTransactions = async (id) => {
  state.txs = await api('/transactions?account=' + id); renderTxList();
  $('#txList').scrollIntoView({ behavior: 'smooth' });
};
let timer;
window.searchTx = () => { clearTimeout(timer); timer = setTimeout(async () => {
  state.txs = await api('/transactions?q=' + encodeURIComponent($('#txSearch').value)); renderTxList(); }, 250); };
window.executeTransfer = async () => {
  try {
    const r = await api('/transfers', { method: 'POST', body: {
      fromAccountId: $('#transferFrom').value, to: $('#transferTo').value,
      amount: $('#transferAmount').value, reason: $('#transferReason').value } });
    showToast(`Virement vers ${r.to} exécuté !`);
    $('#transferAmount').value = ''; $('#transferReason').value = '';
    await loadAll(); switchTab('accueil');
  } catch (e) { showToast(e.message); }
};
window.addBeneficiary = async () => {
  try {
    const b = await api('/beneficiaries', { method: 'POST', body: { name: $('#newBenName').value, iban: $('#beneficiaryModal input.font-mono').value } });
    closeModal('beneficiaryModal'); await renderBeneficiaries('b:' + b.id);
    showToast(`Bénéficiaire ${b.name} ajouté !`);
  } catch (e) { showToast(e.message); }
};
window.sendMessage = async () => {
  const input = $('#chatInput'); if (!input.value.trim()) return;
  const body = input.value; input.value = '';
  try { await api('/messages', { method: 'POST', body: { body } }); renderChat(); } catch (e) { showToast(e.message); }
};
document.querySelectorAll('[onclick*="Déconnexion"]').forEach((b) => (b.onclick = logout));

/* ───── Démarrage ───── */
(async () => {
  const badgeEl = document.createElement('span');
  $('header .uppercase').after(badgeEl);
  if (!state.token) return mountLogin();
  try { state.user = await api('/me'); await loadAll(); }
  catch { mountLogin(); }
})();
