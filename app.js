// Kho Chú Thắng — Inventory Management
const SUPABASE_URL = 'https://wgtkiapaxdrnhontmkux.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndndGtpYXBheGRybmhvbnRta3V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMDU0NTIsImV4cCI6MjA5MjU4MTQ1Mn0._w6P1xYbPN27famcr-csw9okcAyByx48IHNyzX-3peY';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== Currency Helpers =====
function formatComma(n) { return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function formatCurrency(n) { return formatComma(parseInt(n) || 0) + '\u20ab'; }

// ===== Date Helpers =====
function todayStr() { return new Date().toISOString().split('T')[0]; }
function todayParts() { const d = new Date(); return [d.getDate(), d.getMonth()+1, d.getFullYear()]; }
function pad2(n) { return n.toString().padStart(2, '0'); }
function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return pad2(dt.getDate()) + '/' + pad2(dt.getMonth()+1) + '/' + dt.getFullYear();
}

// FIX: defDate is "YYYY-MM-DD" so split gives [year, month, day] — must destructure correctly
function dateDropdownsHtml(prefix, defDate) {
  let dd, dm, dy;
  if (defDate) {
    const parts = defDate.split('-').map(Number);
    dy = parts[0]; dm = parts[1]; dd = parts[2]; // YYYY-MM-DD
  } else {
    [dd, dm, dy] = todayParts(); // [day, month, year]
  }
  const days = Array.from({length:31}, (_,i) => `<option value="${i+1}"${i+1===dd?' selected':''}>${i+1}</option>`).join('');
  const months = Array.from({length:12}, (_,i) => `<option value="${i+1}"${i+1===dm?' selected':''}>${'Th\u00e1ng'} ${i+1}</option>`).join('');
  const years = Array.from({length:10}, (_,i) => `<option value="${2022+i}"${2022+i===dy?' selected':''}>${2022+i}</option>`).join('');
  return `<div style="display:flex;gap:6px;">
    <select id="${prefix}Day" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">${days}</select>
    <select id="${prefix}Month" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">${months}</select>
    <select id="${prefix}Year" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">${years}</select>
  </div>`;
}

function readDateDropdowns(prefix) {
  const d = pad2(document.getElementById(prefix+'Day').value);
  const m = pad2(document.getElementById(prefix+'Month').value);
  const y = document.getElementById(prefix+'Year').value;
  return y+'-'+m+'-'+d;
}

// ===== State =====
let state = {
  items: [],
  transactions: [],
  settings: { low_stock_threshold: 5, currency: 'VND' },
  user: null,
  currentPage: 'dashboard',
  loading: false
};

// ===== Auth =====
async function initAuth() {
  if (localStorage.getItem('stayLoggedIn') === '0') {
    localStorage.removeItem('stayLoggedIn');
    try { await db.auth.signOut(); } catch (_) {}
  }
  try {
    const { data: { session } } = await db.auth.getSession();
    if (session) { state.user = session.user; showApp(); await initApp(); }
    else { showAuth(); }
  } catch (_) { showAuth(); }
  db.auth.onAuthStateChange((event, session) => {
    if (session && !state.user) { state.user = session.user; showApp(); initApp(); }
    else if (!session && state.user) { state.user = null; showAuth(); state.items = []; state.transactions = []; }
  });
}

function showAuth() {
  document.getElementById('authScreen').classList.remove('hide');
  document.getElementById('appScreen').classList.remove('show');
}
function showApp() {
  document.getElementById('authScreen').classList.add('hide');
  document.getElementById('appScreen').classList.add('show');
}

function toggleLoading(btn, loading) {
  if (loading) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> \u0110ang x\u1eed l\u00fd...'; }
  else { btn.disabled = false; btn.textContent = btn.id === 'loginBtn' ? '\u0110\u0103ng nh\u1eadp' : '\u0110\u0103ng k\u00fd'; }
}

function setAuthError(msg) {
  document.getElementById('authError').textContent = msg;
  document.getElementById('authError').classList.add('show');
  document.getElementById('authSuccess').classList.remove('show');
}
function setAuthSuccess(msg) {
  document.getElementById('authSuccess').textContent = msg;
  document.getElementById('authSuccess').classList.add('show');
  document.getElementById('authError').classList.remove('show');
}
function clearAuthMessages() {
  document.getElementById('authError').classList.remove('show');
  document.getElementById('authSuccess').classList.remove('show');
}

async function handleLogin() {
  const input = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const stayLoggedIn = document.getElementById('stayLoggedIn').checked;
  if (!input || !password) { setAuthError('Vui l\u00f2ng nh\u1eadp t\u00ean \u0111\u0103ng nh\u1eadp v\u00e0 m\u1eadt kh\u1ea9u'); return; }
  clearAuthMessages();
  const btn = document.getElementById('loginBtn');
  toggleLoading(btn, true);
  let email = input;
  if (!input.includes('@')) {
    const { data: profile } = await db.from('profiles').select('email').eq('username', input.toLowerCase()).maybeSingle();
    if (!profile || !profile.email) { toggleLoading(btn, false); setAuthError('Kh\u00f4ng t\u00ecm th\u1ea5y t\u00ean \u0111\u0103ng nh\u1eadp'); return; }
    email = profile.email;
  }
  const { error } = await db.auth.signInWithPassword({ email, password });
  toggleLoading(btn, false);
  if (!error) { localStorage.setItem('stayLoggedIn', stayLoggedIn ? '1' : '0'); }
  else { setAuthError(error.message.includes('Invalid login credentials') ? 'Sai t\u00ean \u0111\u0103ng nh\u1eadp ho\u1eb7c m\u1eadt kh\u1ea9u' : error.message); }
}

async function handleSignUp() {
  const username = document.getElementById('signupUsername').value.trim().toLowerCase();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  if (!username || !email || !password) { setAuthError('Vui l\u00f2ng \u0111i\u1ec1n \u0111\u1ea7y \u0111\u1ee7 th\u00f4ng tin'); return; }
  if (password.length < 6) { setAuthError('M\u1eadt kh\u1ea9u ph\u1ea3i c\u00f3 \u00edt nh\u1ea5t 6 k\u00fd t\u1ef1'); return; }
  clearAuthMessages();
  const btn = document.getElementById('signupBtn');
  toggleLoading(btn, true);
  const { data, error } = await db.auth.signUp({ email, password });
  if (error) { toggleLoading(btn, false); setAuthError(error.message); return; }
  if (data.user) {
    const { error: pe } = await db.from('profiles').insert({ user_id: data.user.id, username, email });
    if (pe) { toggleLoading(btn, false); setAuthError('T\u00ean \u0111\u0103ng nh\u1eadp \u0111\u00e3 t\u1ed3n t\u1ea1i'); return; }
  }
  toggleLoading(btn, false);
  setAuthSuccess('\u0110\u0103ng k\u00fd th\u00e0nh c\u00f4ng! Ki\u1ec3m tra email \u0111\u1ec3 x\u00e1c nh\u1eadn.');
  setTimeout(() => showLogin(), 3000);
}

async function handleLogout() {
  localStorage.removeItem('stayLoggedIn');
  await db.auth.signOut();
}
function showLogin() { document.getElementById('loginForm').style.display = 'block'; document.getElementById('signupForm').style.display = 'none'; clearAuthMessages(); }
function showSignUp() { document.getElementById('loginForm').style.display = 'none'; document.getElementById('signupForm').style.display = 'block'; clearAuthMessages(); }

// ===== Data =====
async function initApp() {
  switchPage('dashboard');
  state.loading = true;
  try {
    await Promise.all([loadItems(), loadSettings()]);
    await loadTransactions();
    renderAll();
  } catch (e) { showToast('\u26a0\ufe0f L\u1ed7i t\u1ea3i d\u1eef li\u1ec7u. Vui l\u00f2ng th\u1eed l\u1ea1i.'); }
  state.loading = false;
}

async function loadItems() {
  const { data } = await db.from('items').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false });
  state.items = (data || []).map(i => ({
    id: i.id, code: i.code, name: i.name || '', description: i.description || '',
    unit_price: i.unit_price || 0, current_stock: i.current_stock || 0,
    min_stock: i.min_stock || 0, created_at: i.created_at
  }));
}

async function loadTransactions() {
  const itemIds = state.items.map(i => i.id);
  if (itemIds.length === 0) { state.transactions = []; return; }
  const { data: tx } = await db
    .from('transactions')
    .select('*')
    .in('item_id', itemIds)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);
  state.transactions = (tx || []).map(t => ({
    id: t.id, item_id: t.item_id, type: t.type, quantity: t.quantity,
    unit_price: t.unit_price, note: t.note || '',
    transaction_date: t.transaction_date, created_at: t.created_at
  }));
}

async function loadSettings() {
  const { data } = await db.from('settings').select('*').eq('user_id', state.user.id).single();
  if (data) state.settings = { low_stock_threshold: data.low_stock_threshold || 5, currency: data.currency || 'VND' };
}

async function saveSettings() {
  const threshold = parseInt(document.getElementById('lowStockThreshold').value) || 5;
  state.settings.low_stock_threshold = threshold;
  const { error } = await db.from('settings').upsert({
    user_id: state.user.id,
    low_stock_threshold: threshold,
    currency: 'VND'
  }, { onConflict: 'user_id' });
  if (error) { showToast('\u26a0\ufe0f L\u1ed7i l\u01b0u c\u00e0i \u0111\u1eb7t'); return; }
  renderAll();
  showToast('\u2705 \u0110\u00e3 l\u01b0u c\u00e0i \u0111\u1eb7t');
}

// ===== Items CRUD =====
async function addItem(data) {
  const { error } = await db.from('items').insert({
    user_id: state.user.id, code: data.code.toUpperCase(), name: data.name,
    description: data.description || '', unit_price: data.unit_price || 0,
    current_stock: data.current_stock || 0, min_stock: data.min_stock || 0
  });
  if (error) { showToast('\u26a0\ufe0f ' + error.message); return false; }
  await loadItems();
  renderAll();
  showToast('\u2705 \u0110\u00e3 th\u00eam m\u1eb7t h\u00e0ng');
  return true;
}

async function updateItem(id, data) {
  const { error } = await db.from('items').update(data).eq('id', id).eq('user_id', state.user.id);
  if (error) { showToast('\u26a0\ufe0f ' + error.message); return false; }
  await loadItems();
  renderAll();
  showToast('\u2705 \u0110\u00e3 c\u1eadp nh\u1eadt');
  return true;
}

async function deleteItem(id) {
  const { error } = await db.from('items').delete().eq('id', id).eq('user_id', state.user.id);
  if (error) { showToast('\u26a0\ufe0f ' + error.message); return; }
  state.transactions = state.transactions.filter(t => t.item_id !== id);
  await loadItems();
  renderAll();
  showToast('\ud83d\uddd1\ufe0f \u0110\u00e3 x\u00f3a m\u1eb7t h\u00e0ng');
}

// ===== Transactions =====
// FIX: Insert transaction first, then update stock.
// If stock update fails, rollback by deleting the transaction just inserted.
async function addTransaction(data) {
  const { error: txError, data: txData } = await db.from('transactions').insert({
    item_id: data.item_id, type: data.type, quantity: data.quantity,
    unit_price: data.unit_price || null, note: data.note || '',
    transaction_date: data.transaction_date || todayStr()
  }).select().single();
  if (txError) { showToast('\u26a0\ufe0f ' + txError.message); return false; }

  const item = state.items.find(i => i.id === data.item_id);
  if (item) {
    const delta = data.type === 'nhap' ? data.quantity : -data.quantity;
    const { error: stockError } = await db.from('items')
      .update({ current_stock: item.current_stock + delta })
      .eq('id', data.item_id).eq('user_id', state.user.id);
    if (stockError) {
      // Rollback: remove the transaction we just inserted
      await db.from('transactions').delete().eq('id', txData.id);
      showToast('\u26a0\ufe0f L\u1ed7i c\u1eadp nh\u1eadt t\u1ed3n kho. Giao d\u1ecbch \u0111\u00e3 h\u1ee7y. Vui l\u00f2ng th\u1eed l\u1ea1i.');
      return false;
    }
  }

  await Promise.all([loadItems(), loadTransactions()]);
  renderAll();
  showToast(data.type === 'nhap' ? '\ud83d\udce5 \u0110\u00e3 nh\u1eadp kho' : '\ud83d\udce4 \u0110\u00e3 xu\u1ea5t kho');
  return true;
}

// FIX: Reverse stock FIRST, then delete transaction. If stock reversal fails, abort.
// FIX: Confirmation includes item name and quantity.
async function deleteTransaction(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;
  const item = state.items.find(i => i.id === tx.item_id);
  const itemLabel = item ? item.code + ' - ' + item.name : 'kh\u00f4ng x\u00e1c \u0111\u1ecbnh';
  const typeLabel = tx.type === 'nhap' ? 'Nh\u1eadp' : 'Xu\u1ea5t';
  const dateLabel = formatDate(tx.transaction_date);
  if (!confirm('X\u00f3a giao d\u1ecbch?\n\n' + typeLabel + ' ' + tx.quantity + ' c\u00e1i — ' + itemLabel + '\nNg\u00e0y: ' + dateLabel + '\n\nT\u1ed3n kho s\u1ebd \u0111\u01b0\u1ee3c \u0111i\u1ec1u ch\u1ec9nh l\u1ea1i.')) return;

  // FIX: Reverse stock first before deleting
  if (item) {
    const delta = tx.type === 'nhap' ? -tx.quantity : tx.quantity;
    const { error: stockError } = await db.from('items')
      .update({ current_stock: item.current_stock + delta })
      .eq('id', tx.item_id).eq('user_id', state.user.id);
    if (stockError) { showToast('\u26a0\ufe0f L\u1ed7i \u0111i\u1ec1u ch\u1ec9nh t\u1ed3n kho: ' + stockError.message); return; }
  }

  const { error } = await db.from('transactions').delete().eq('id', id);
  if (error) {
    // Undo the stock reversal if delete failed
    if (item) {
      const delta = tx.type === 'nhap' ? tx.quantity : -tx.quantity;
      await db.from('items').update({ current_stock: item.current_stock + delta })
        .eq('id', tx.item_id).eq('user_id', state.user.id);
    }
    showToast('\u26a0\ufe0f ' + error.message); return;
  }

  await Promise.all([loadItems(), loadTransactions()]);
  renderAll();
  showToast('\ud83d\uddd1\ufe0f \u0110\u00e3 x\u00f3a giao d\u1ecbch');
}

// ===== Rendering =====
function renderAll() {
  renderDashboard();
  renderItems();
  renderReports();
  renderSettings();
}

function getItemName(id) { const i = state.items.find(x => x.id === id); return i ? i.code + ' - ' + i.name : '?'; }
function getItemById(id) { return state.items.find(x => x.id === id); }
function escapeHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// FIX: use global threshold as fallback when per-item min_stock is 0
function isLowStock(item) {
  const thresh = item.min_stock > 0 ? item.min_stock : state.settings.low_stock_threshold;
  return item.current_stock <= thresh;
}

function renderDashboard() {
  const items = state.items;
  document.getElementById('dashTotalItems').textContent = items.length;
  document.getElementById('dashTotalStock').textContent = items.reduce((s,i) => s + (i.current_stock||0), 0);
  const low = items.filter(i => isLowStock(i));
  document.getElementById('dashLowStock').textContent = low.length;

  // FIX: helpful onboarding empty state when no items
  if (items.length === 0) {
    document.getElementById('recentTransactions').innerHTML = `
      <div class="empty-state">
        <div class="icon">\ud83d\udce6</div>
        <p><strong>Ch\u01b0a c\u00f3 m\u1eb7t h\u00e0ng n\u00e0o</strong></p>
        <p style="font-size:14px;margin-top:8px;color:#666;">B\u1ea5m <strong>\u2795 Th\u00eam h\u00e0ng</strong> ph\u00eda tr\u00ean \u0111\u1ec3 b\u1eaft \u0111\u1ea7u qu\u1ea3n l\u00fd kho</p>
      </div>`;
    return;
  }

  const recent = state.transactions.slice(0, 10);
  const html = recent.map(t => {
    const item = getItemById(t.item_id);
    const icon = t.type === 'nhap' ? '\ud83d\udce5' : '\ud83d\udce4';
    return `<div class="transaction-item tx-${t.type}">
      <div><strong>${item ? escapeHtml(item.code) : '?'}</strong> ${escapeHtml(item ? item.name : '')}<br><span style="font-size:12px;color:#666;">${escapeHtml(t.note)}</span></div>
      <div style="text-align:right;white-space:nowrap;">
        <div style="font-weight:600;color:${t.type==='nhap'?'#1e7e34':'#c5221f'}">${icon} ${t.type === 'nhap' ? '+' : '-'}${t.quantity}</div>
        <div style="font-size:12px;color:#999;">${formatDate(t.transaction_date)}</div>
      </div>
    </div>`;
  }).join('');
  document.getElementById('recentTransactions').innerHTML = html || '<div class="empty-state"><div class="icon">\ud83d\udccb</div><p>Ch\u01b0a c\u00f3 giao d\u1ecbch n\u00e0o</p></div>';
}

function renderItems() {
  const q = (document.getElementById('itemSearch').value || '').toLowerCase();
  const filtered = state.items.filter(i => (i.code+'').toLowerCase().includes(q) || (i.name+'').toLowerCase().includes(q));

  // FIX: distinguish no-items-yet from no-search-results
  let emptyHtml;
  if (state.items.length === 0) {
    emptyHtml = `<div class="empty-state">
      <div class="icon">\ud83d\udce6</div>
      <p><strong>Ch\u01b0a c\u00f3 m\u1eb7t h\u00e0ng n\u00e0o</strong></p>
      <p style="font-size:14px;margin-top:8px;color:#666;">Chuy\u1ec3n sang <strong>Trang ch\u1ee7</strong> v\u00e0 b\u1ea5m <strong>Th\u00eam h\u00e0ng</strong></p>
    </div>`;
  } else {
    emptyHtml = '<div class="empty-state"><div class="icon">\ud83d\udd0d</div><p>Kh\u00f4ng t\u00ecm th\u1ea5y h\u00e0ng ph\u00f9 h\u1ee3p</p></div>';
  }

  document.getElementById('itemList').innerHTML = filtered.map(i => {
    const low = isLowStock(i);
    return `<div class="item-card" onclick="openItemDetail('${i.id}')">
      <div class="name">${escapeHtml(i.name)} <span style="font-size:13px;color:#1a73e8;font-weight:500;">${escapeHtml(i.code)}</span></div>
      <div class="meta">
        <span>T\u1ed3n: <strong>${i.current_stock}</strong> ${low ? '\u26a0\ufe0f' : ''}</span>
        <span>${formatCurrency(i.unit_price)}</span>
      </div>
    </div>`;
  }).join('') || emptyHtml;
}

function renderReports() {
  const items = state.items;

  // FIX: empty state when no items yet
  if (items.length === 0) {
    document.getElementById('reportsContent').innerHTML = `
      <div class="empty-state">
        <div class="icon">\ud83d\udcca</div>
        <p><strong>Ch\u01b0a c\u00f3 d\u1eef li\u1ec7u</strong></p>
        <p style="font-size:14px;margin-top:8px;color:#666;">Th\u00eam m\u1eb7t h\u00e0ng \u0111\u1ec3 xem b\u00e1o c\u00e1o t\u1ed3n kho</p>
      </div>`;
    return;
  }

  const totalValue = items.reduce((s,i) => s + (i.current_stock||0) * (i.unit_price||0), 0);
  const lowItems = items.filter(i => isLowStock(i));
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-01`;
  const monthTx = state.transactions.filter(t => t.transaction_date >= monthStart);
  const nhapCount = monthTx.filter(t => t.type === 'nhap').reduce((s,t) => s + t.quantity, 0);
  const xuatCount = monthTx.filter(t => t.type === 'xuat').reduce((s,t) => s + t.quantity, 0);

  document.getElementById('reportsContent').innerHTML = `
    <div class="stats">
      <div class="stat-card"><div class="num">${items.length}</div><div class="label">M\u1eb7t h\u00e0ng</div></div>
      <div class="stat-card"><div class="num" style="font-size:16px;">${formatCurrency(totalValue)}</div><div class="label">Gi\u00e1 tr\u1ecb kho</div></div>
      <div class="stat-card"><div class="num danger">${lowItems.length}</div><div class="label">S\u1eafp h\u1ebft</div></div>
    </div>
    <div class="settings-group">
      <div class="settings-item"><span class="label">\ud83d\udce5 Nh\u1eadp kho th\u00e1ng n\u00e0y</span><span class="value" style="color:#1e7e34;font-weight:600;">+${nhapCount}</span></div>
      <div class="settings-item"><span class="label">\ud83d\udce4 Xu\u1ea5t kho th\u00e1ng n\u00e0y</span><span class="value" style="color:#c5221f;font-weight:600;">-${xuatCount}</span></div>
      <div class="settings-item"><span class="label">Ch\u00eanh l\u1ec7ch</span><span class="value" style="font-weight:600;">${nhapCount - xuatCount >= 0 ? '+' : ''}${nhapCount - xuatCount}</span></div>
    </div>
    ${lowItems.length > 0
      ? `<div class="section-title">\u26a0\ufe0f H\u00e0ng s\u1eafp h\u1ebft</div>
         ${lowItems.map(i => `<div class="item-card" onclick="openItemDetail('${i.id}')">
           <div class="name">${escapeHtml(i.name)} <span style="font-size:13px;color:#1a73e8;">${escapeHtml(i.code)}</span></div>
           <div class="meta"><span>T\u1ed3n: <strong style="color:#c5221f;">${i.current_stock}</strong> / C\u1ea3nh b\u00e1o: ${i.min_stock > 0 ? i.min_stock : state.settings.low_stock_threshold}</span></div>
         </div>`).join('')}`
      : '<div class="section-title" style="color:#1e7e34;">\u2705 T\u1ea5t c\u1ea3 m\u1eb7t h\u00e0ng \u0111\u1ec1u \u0111\u1ee7 h\u00e0ng</div>'}
  `;
}

function renderSettings() {
  document.getElementById('lowStockThreshold').value = state.settings.low_stock_threshold;
  document.getElementById('settingTotalItems').textContent = state.items.length;
}

// ===== Modals =====
function showModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('show');
}
function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').classList.remove('show');
}
function forceCloseModal() {
  document.getElementById('modalOverlay').classList.remove('show');
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove('show'), 3500);
}

// ===== Page Navigation =====
function switchPage(page, sub) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
  const navBtns = document.querySelectorAll('.bottom-nav button');
  const pages = ['dashboard','items','reports','settings'];
  const idx = pages.indexOf(page);
  if (idx >= 0 && navBtns[idx]) navBtns[idx].classList.add('active');
  if (page === 'items' && sub === 'items') renderItems();
}

// ===== Open Add/Edit Item =====
// FIX: sourceItemId lets Cancel/Save navigate back to item detail instead of closing entirely
function openAddItem(item, sourceItemId) {
  const isEdit = !!item;
  const title = isEdit ? '\u270f\ufe0f S\u1eeda m\u1eb7t h\u00e0ng' : '\u2795 Th\u00eam m\u1eb7t h\u00e0ng';
  const code = isEdit ? escapeHtml(item.code) : '';
  const name = isEdit ? escapeHtml(item.name) : '';
  const desc = isEdit ? escapeHtml(item.description) : '';
  const price = isEdit ? item.unit_price : '';
  const stock = isEdit ? item.current_stock : '';
  const minStock = isEdit ? item.min_stock : '';
  const src = sourceItemId || '';
  const cancelAction = src ? `openItemDetail('${src}')` : 'forceCloseModal()';
  const saveFn = isEdit ? `submitEditItem('${item.id}','${src}')` : `submitAddItem('${src}')`;
  showModal(`
    <h2>${title}</h2>
    <div class="field"><label>M\u00e3 h\u00e0ng *</label><input type="text" id="itemCode" value="${code}" placeholder="VD: MT-001" autocomplete="off"></div>
    <div class="field"><label>T\u00ean h\u00e0ng</label><input type="text" id="itemName" value="${name}" placeholder="T\u00ean d\u1ee5ng c\u1ee5"></div>
    <div class="field"><label>M\u00f4 t\u1ea3</label><textarea id="itemDesc" rows="2">${desc}</textarea></div>
    <div class="field"><label>Gi\u00e1 b\u00e1n (VN\u0110)</label><input type="number" id="itemPrice" value="${price}" placeholder="0" min="0"></div>
    ${isEdit
      ? `<div class="field"><label>T\u1ed3n kho</label><input type="number" id="itemStock" value="${stock}" min="0"></div>`
      : `<div class="field"><label>T\u1ed3n kho ban \u0111\u1ea7u</label><input type="number" id="itemStock" value="0" min="0"></div>`}
    <div class="field">
      <label>C\u1ea3nh b\u00e1o khi t\u1ed3n kho xu\u1ed1ng d\u01b0\u1edbi</label>
      <input type="number" id="itemMinStock" value="${minStock}" placeholder="VD: 5" min="0">
      <div style="font-size:12px;color:#999;margin-top:4px;">H\u1ec7 th\u1ed1ng b\u00e1o khi t\u1ed3n kho xu\u1ed1ng d\u01b0\u1edbi s\u1ed1 n\u00e0y. \u0110\u1ec3 tr\u1ed1ng s\u1ebd d\u00f9ng ng\u01b0\u1ee1ng m\u1eb7c \u0111\u1ecbnh trong C\u00e0i \u0111\u1eb7t.</div>
    </div>
    <div class="btn-row">
      <button class="btn-secondary" onclick="${cancelAction}">H\u1ee7y</button>
      <button class="btn-primary" onclick="${saveFn}">${isEdit ? 'L\u01b0u' : 'Th\u00eam'}</button>
    </div>
  `);
}

async function submitAddItem(sourceItemId) {
  const code = document.getElementById('itemCode').value.trim();
  if (!code) { showToast('\u26a0\ufe0f Vui l\u00f2ng nh\u1eadp m\u00e3 h\u00e0ng'); return; }
  const ok = await addItem({
    code, name: document.getElementById('itemName').value.trim(),
    description: document.getElementById('itemDesc').value.trim(),
    unit_price: parseInt(document.getElementById('itemPrice').value) || 0,
    current_stock: parseInt(document.getElementById('itemStock').value) || 0,
    min_stock: parseInt(document.getElementById('itemMinStock').value) || 0
  });
  if (ok) {
    if (sourceItemId) openItemDetail(sourceItemId);
    else forceCloseModal();
  }
}

async function submitEditItem(id, sourceItemId) {
  const code = document.getElementById('itemCode').value.trim();
  if (!code) { showToast('\u26a0\ufe0f Vui l\u00f2ng nh\u1eadp m\u00e3 h\u00e0ng'); return; }
  const ok = await updateItem(id, {
    code, name: document.getElementById('itemName').value.trim(),
    description: document.getElementById('itemDesc').value.trim(),
    unit_price: parseInt(document.getElementById('itemPrice').value) || 0,
    current_stock: parseInt(document.getElementById('itemStock').value) || 0,
    min_stock: parseInt(document.getElementById('itemMinStock').value) || 0
  });
  if (ok) {
    if (sourceItemId) openItemDetail(sourceItemId);
    else forceCloseModal();
  }
}

// ===== Open Item Detail =====
function openItemDetail(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  const txs = state.transactions.filter(t => t.item_id === id).slice(0, 50);

  // FIX: dedicated delete button per row — safer than tapping the entire row
  const txHtml = txs.map(t => {
    const icon = t.type === 'nhap' ? '\ud83d\udce5' : '\ud83d\udce4';
    const label = t.type === 'nhap' ? 'Nh\u1eadp' : 'Xu\u1ea5t';
    const color = t.type === 'nhap' ? '#1e7e34' : '#c5221f';
    return `<div class="transaction-item tx-${t.type}" style="align-items:flex-start;">
      <div style="flex:1;">
        <strong style="color:${color}">${icon} ${label} ${t.quantity}</strong>
        ${t.note ? `<span style="font-size:12px;color:#666;margin-left:6px;">${escapeHtml(t.note)}</span>` : ''}
        <div style="font-size:12px;color:#999;margin-top:2px;">${formatDate(t.transaction_date)}</div>
      </div>
      <button onclick="deleteTransaction('${t.id}')"
        style="background:none;border:1px solid #e0e0e0;border-radius:6px;padding:4px 10px;cursor:pointer;color:#c5221f;font-size:13px;white-space:nowrap;margin-left:8px;flex-shrink:0;"
        title="X\u00f3a giao d\u1ecbch n\u00e0y">X\u00f3a</button>
    </div>`;
  }).join('') || '<div class="empty-state" style="padding:20px;"><p style="color:#999;">Ch\u01b0a c\u00f3 giao d\u1ecbch n\u00e0o</p></div>';

  const low = isLowStock(item);
  showModal(`
    <h2>${escapeHtml(item.code)} <span class="badge ${low ? 'badge-warn' : 'badge-ok'}">${low ? '\u26a0\ufe0f S\u1eafp h\u1ebft' : '\u2705 C\u00f2n h\u00e0ng'}</span></h2>
    <div style="margin-bottom:12px;">
      <div style="font-size:17px;font-weight:600;margin-bottom:4px;">${escapeHtml(item.name)}</div>
      ${item.description ? '<div style="font-size:14px;color:#666;margin-bottom:4px;">' + escapeHtml(item.description) + '</div>' : ''}
      <div style="font-size:14px;margin-bottom:4px;"><strong>Gi\u00e1 b\u00e1n:</strong> ${formatCurrency(item.unit_price)}</div>
      <div style="font-size:14px;margin-bottom:4px;"><strong>T\u1ed3n kho:</strong> ${item.current_stock}</div>
      <div style="font-size:14px;margin-bottom:4px;"><strong>C\u1ea3nh b\u00e1o khi t\u1ed3n d\u01b0\u1edbi:</strong> ${item.min_stock > 0 ? item.min_stock : state.settings.low_stock_threshold}</div>
    </div>
    <div class="actions" style="margin-bottom:8px;">
      <button class="btn-primary" onclick="toggleItemForm('nhap','${item.id}')">\ud83d\udce5 Nh\u1eadp</button>
      <button class="btn-success" onclick="toggleItemForm('xuat','${item.id}')">\ud83d\udce4 Xu\u1ea5t</button>
      <button class="btn-secondary" onclick="openAddItem(getItemById('${item.id}'),'${item.id}')">\u270f\ufe0f S\u1eeda</button>
    </div>
    <div id="itemInlineForm" style="display:none;background:#f0f6ff;border-radius:10px;padding:14px;margin-bottom:12px;border:1px solid #dbeafe;"></div>
    <div class="section-title">L\u1ecbch s\u1eed giao d\u1ecbch <span style="font-size:12px;color:#999;font-weight:normal;">(b\u1ea5m "X\u00f3a" \u0111\u1ec3 x\u00f3a t\u1eebng giao d\u1ecbch)</span></div>
    ${txHtml}
    <div class="btn-row" style="margin-top:14px;">
      <button class="btn-danger" onclick="confirmDeleteItem('${item.id}','${escapeHtml(item.code)}')" style="flex:1;">\ud83d\uddd1\ufe0f X\u00f3a m\u1eb7t h\u00e0ng</button>
      <button class="btn-secondary" onclick="forceCloseModal()" style="flex:1;">\u0110\u00f3ng</button>
    </div>
  `);
}

// ===== Inline Nhập/Xuất form inside item detail =====
function toggleItemForm(type, itemId) {
  const container = document.getElementById('itemInlineForm');
  if (!container) return;
  const isNhap = type === 'nhap';
  if (container.dataset.type === type && container.style.display !== 'none') {
    container.style.display = 'none'; container.dataset.type = ''; return;
  }
  container.dataset.type = type;
  container.style.display = 'block';
  const stockWarn = !isNhap ? `<div id="inlineStockWarn" style="font-size:13px;color:#c5221f;margin-bottom:8px;display:none;"></div>` : '';
  container.innerHTML = `
    <div style="font-weight:600;margin-bottom:10px;font-size:15px;color:${isNhap ? '#1a73e8' : '#34a853'}">${isNhap ? '📥 Nhập kho' : '📤 Xuất kho'}</div>
    <div style="margin-bottom:10px;">
      <label style="display:block;font-size:13px;color:#555;margin-bottom:4px;">Số lượng *</label>
      <input type="number" id="inlineQty" value="1" min="1"
        ${!isNhap ? `onchange="checkInlineXuatStock('${itemId}')" oninput="checkInlineXuatStock('${itemId}')"` : ''}
        style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:16px;">
    </div>
    ${isNhap ? `<div style="margin-bottom:10px;"><label style="display:block;font-size:13px;color:#555;margin-bottom:4px;">Đơn giá nhập (VNĐ)</label><input type="number" id="inlinePrice" value="0" min="0" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:16px;"></div>` : ''}
    ${stockWarn}
    <div style="margin-bottom:10px;">
      <label style="display:block;font-size:13px;color:#555;margin-bottom:4px;">Ngày</label>
      ${dateDropdownsHtml('inline', todayStr())}
    </div>
    <div style="margin-bottom:12px;">
      <label style="display:block;font-size:13px;color:#555;margin-bottom:4px;">Ghi chú</label>
      <input type="text" id="inlineNote" placeholder="${isNhap ? 'VD: nhập từ nhà cung cấp A' : 'VD: bán cho khách B'}"
        style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;">
    </div>
    <div style="display:flex;gap:8px;">
      <button id="inlineSubmitBtn" onclick="submitInlineStockForm('${type}','${itemId}')"
        style="flex:1;padding:12px;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;color:white;background:${isNhap ? '#1a73e8' : '#34a853'};">
        ✅ ${isNhap ? 'Nhập kho' : 'Xuất kho'}
      </button>
      <button onclick="document.getElementById('itemInlineForm').style.display='none';document.getElementById('itemInlineForm').dataset.type='';"
        style="padding:12px 16px;border:none;border-radius:8px;font-size:15px;cursor:pointer;background:#f1f3f4;color:#222;">Hủy</button>
    </div>
  `;
  setTimeout(() => { const el = document.getElementById('inlineQty'); if (el) el.focus(); }, 50);
}

function checkInlineXuatStock(itemId) {
  const qty = parseInt(document.getElementById('inlineQty').value) || 0;
  const item = state.items.find(i => i.id === itemId);
  const warn = document.getElementById('inlineStockWarn');
  if (!warn) return;
  if (item && qty > item.current_stock) {
    warn.style.display = 'block';
    warn.textContent = '⚠️ Tồn kho hiện tại: ' + item.current_stock + '. Số lượng xuất không được lớn hơn tồn kho!';
  } else { warn.style.display = 'none'; }
}

async function submitInlineStockForm(type, itemId) {
  const qty = parseInt(document.getElementById('inlineQty').value) || 0;
  if (qty <= 0) { showToast('⚠️ Nhập số lượng hợp lệ'); return; }
  const item = state.items.find(i => i.id === itemId);
  if (type === 'xuat' && qty > (item ? item.current_stock : 0)) { showToast('⚠️ Số lượng xuất vượt quá tồn kho'); return; }
  const btn = document.getElementById('inlineSubmitBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Đang xử lý...';
  const ok = await addTransaction({
    item_id: itemId, type, quantity: qty,
    unit_price: type === 'nhap' ? (parseInt(document.getElementById('inlinePrice').value) || 0) : (item ? item.unit_price : 0),
    note: document.getElementById('inlineNote').value.trim(),
    transaction_date: readDateDropdowns('inline')
  });
  if (ok) openItemDetail(itemId);
  else { btn.disabled = false; btn.innerHTML = '✅ ' + (type === 'nhap' ? 'Nhập kho' : 'Xuất kho'); }
}

// ===== Delete Item Helper =====
async function confirmDeleteItem(id, code) {
  if (!confirm('X\u00f3a m\u1eb7t h\u00e0ng ' + code + '?\nT\u1ea5t c\u1ea3 giao d\u1ecbch li\u00ean quan s\u1ebd b\u1ecb x\u00f3a.')) return;
  forceCloseModal();
  await deleteItem(id);
}

// ===== Stock In/Out (Nhập kho / Xuất kho) =====
function openNhapKho() { openStockForm('nhap', null, null); }
function openXuatKho() { openStockForm('xuat', null, null); }

// FIX: sourceItemId enables back-navigation to item detail after submit or cancel
function openStockForm(type, preselectedId, sourceItemId) {
  const isNhap = type === 'nhap';
  const title = isNhap ? '\ud83d\udce5 Nh\u1eadp kho' : '\ud83d\udce4 Xu\u1ea5t kho';
  const btnLabel = isNhap ? 'Nh\u1eadp kho' : 'Xu\u1ea5t kho';
  const btnClass = isNhap ? 'btn-primary' : 'btn-success';
  const notePlaceholder = isNhap ? 'Ghi ch\u00fa (VD: nh\u1eadp t\u1eeb nh\u00e0 cung c\u1ea5p A)' : 'Ghi ch\u00fa (VD: b\u00e1n cho kh\u00e1ch B)';
  const stockWarn = !isNhap ? `<div id="stockWarn" style="font-size:13px;color:#c5221f;margin-bottom:8px;display:none;"></div>` : '';
  const src = sourceItemId || '';
  const cancelAction = src ? `openItemDetail('${src}')` : 'forceCloseModal()';

  if (state.items.length === 0) {
    showModal(`
      <h2>${title}</h2>
      <div class="empty-state" style="padding:30px 0;">
        <div class="icon">\ud83d\udce6</div>
        <p>Ch\u01b0a c\u00f3 m\u1eb7t h\u00e0ng n\u00e0o</p>
        <p style="font-size:13px;margin-top:8px;color:#666;">Th\u00eam h\u00e0ng tr\u01b0\u1edbc khi nh\u1eadp/xu\u1ea5t kho</p>
      </div>
      <div class="btn-row">
        <button class="btn-secondary" onclick="forceCloseModal()">\u0110\u00f3ng</button>
        <button class="btn-warning" onclick="openAddItem()">\u2795 Th\u00eam h\u00e0ng</button>
      </div>
    `);
    return;
  }

  const itemOpts = state.items.map(i =>
    `<option value="${i.id}"${i.id===preselectedId?' selected':''}>${escapeHtml(i.code)} - ${escapeHtml(i.name)} (t\u1ed3n: ${i.current_stock})</option>`
  ).join('');

  showModal(`
    <h2>${title}</h2>
    <div class="field"><label>M\u1eb7t h\u00e0ng *</label>
      <select id="stockItem" onchange="${isNhap ? '' : 'checkXuatStock()'}" style="width:100%;padding:12px 14px;border:1px solid #ddd;border-radius:8px;font-size:16px;background:white;">
        <option value="">-- Ch\u1ecdn h\u00e0ng --</option>
        ${itemOpts}
      </select>
    </div>
    <div class="field"><label>S\u1ed1 l\u01b0\u1ee3ng *</label>
      <input type="number" id="stockQty" value="1" min="1" onchange="${isNhap ? '' : 'checkXuatStock()'}" oninput="${isNhap ? '' : 'checkXuatStock()'}">
    </div>
    ${isNhap ? '<div class="field"><label>\u0110\u01a1n gi\u00e1 nh\u1eadp (VN\u0110)</label><input type="number" id="stockPrice" value="0" min="0"></div>' : ''}
    ${stockWarn}
    <div class="field"><label>Ng\u00e0y</label>${dateDropdownsHtml('stock', todayStr())}</div>
    <div class="field"><label>Ghi ch\u00fa</label><input type="text" id="stockNote" placeholder="${notePlaceholder}"></div>
    <div class="btn-row">
      <button class="btn-secondary" onclick="${cancelAction}">H\u1ee7y</button>
      <button id="stockSubmitBtn" class="${btnClass}" onclick="submitStockForm('${type}','${src}')">\u2705 ${btnLabel}</button>
    </div>
  `);
}

function checkXuatStock() {
  const sel = document.getElementById('stockItem');
  const qty = parseInt(document.getElementById('stockQty').value) || 0;
  const item = state.items.find(i => i.id === sel.value);
  const warn = document.getElementById('stockWarn');
  if (item && qty > item.current_stock) {
    warn.style.display = 'block';
    warn.textContent = '\u26a0\ufe0f T\u1ed3n kho hi\u1ec7n t\u1ea1i: ' + item.current_stock + '. S\u1ed1 l\u01b0\u1ee3ng xu\u1ea5t kh\u00f4ng \u0111\u01b0\u1ee3c l\u1edbn h\u01a1n t\u1ed3n kho!';
  } else {
    warn.style.display = 'none';
  }
}

// FIX: sourceItemId passed so after success we return to item detail
async function submitStockForm(type, sourceItemId) {
  const itemId = document.getElementById('stockItem').value;
  const qty = parseInt(document.getElementById('stockQty').value) || 0;
  if (!itemId || qty <= 0) { showToast('\u26a0\ufe0f Ch\u1ecdn m\u1eb7t h\u00e0ng v\u00e0 nh\u1eadp s\u1ed1 l\u01b0\u1ee3ng'); return; }
  const item = state.items.find(i => i.id === itemId);
  if (type === 'xuat' && qty > (item ? item.current_stock : 0)) { showToast('\u26a0\ufe0f S\u1ed1 l\u01b0\u1ee3ng xu\u1ea5t v\u01b0\u1ee3t qu\u00e1 t\u1ed3n kho'); return; }
  const btn = document.getElementById('stockSubmitBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> \u0110ang x\u1eed l\u00fd...'; }
  const ok = await addTransaction({
    item_id: itemId, type, quantity: qty,
    unit_price: type === 'nhap' ? (parseInt(document.getElementById('stockPrice').value) || 0) : (item ? item.unit_price : 0),
    note: document.getElementById('stockNote').value.trim(),
    transaction_date: readDateDropdowns('stock')
  });
  if (ok) {
    if (sourceItemId) openItemDetail(sourceItemId);
    else forceCloseModal();
  } else if (btn) {
    btn.disabled = false;
    btn.innerHTML = '\u2705 ' + (type === 'nhap' ? 'Nh\u1eadp kho' : 'Xu\u1ea5t kho');
  }
}

// ===== Utility =====
function exportData() {
  const data = JSON.stringify({ items: state.items, transactions: state.transactions }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `kho-chu-thang-${new Date().toISOString().split('T')[0]}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('\u2705 \u0110\u00e3 sao l\u01b0u d\u1eef li\u1ec7u');
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!confirm('Nh\u1eadp d\u1eef li\u1ec7u s\u1ebd hi\u1ec3n th\u1ecb t\u1ea1m th\u1eddi. T\u1ea3i l\u1ea1i trang s\u1ebd m\u1ea5t. Ti\u1ebfp t\u1ee5c?')) return;
      state.items = data.items || [];
      state.transactions = data.transactions || [];
      renderAll();
      showToast('\u2705 \u0110\u00e3 nh\u1eadp d\u1eef li\u1ec7u (t\u1ea1m th\u1eddi)');
    } catch(err) { showToast('\u26a0\ufe0f File kh\u00f4ng h\u1ee3p l\u1ec7'); }
    event.target.value = '';
  };
  reader.readAsText(file);
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', initAuth);
