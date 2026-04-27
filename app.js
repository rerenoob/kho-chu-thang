// Kho Chú Thắng — Inventory Management
const SUPABASE_URL = 'https://wgtkiapaxdrnhontmkux.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndndGtpYXBheGRybmhvbnRta3V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMDU0NTIsImV4cCI6MjA5MjU4MTQ1Mn0._w6P1xYbPN27famcr-csw9okcAyByx48IHNyzX-3peY';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== Currency Helpers =====
function formatComma(n) { return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function formatCurrency(n) { return formatComma(parseInt(n) || 0) + '₫'; }

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

function dateDropdownsHtml(prefix, defDate) {
  const dp = defDate ? defDate.split('-').map(Number) : todayParts();
  const [dd, dm, dy] = dp.length === 3 ? dp : [dp[2], dp[1], dp[0]];
  const days = Array.from({length:31}, (_,i) => `<option value="${i+1}"${i+1===dd?' selected':''}>${i+1}</option>`).join('');
  const months = Array.from({length:12}, (_,i) => `<option value="${i+1}"${i+1===dm?' selected':''}>Tháng ${i+1}</option>`).join('');
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
  settings: { low_stock_threshold: 5, currency: 'VNĐ' },
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
  if (loading) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Đang xử lý...'; }
  else { btn.disabled = false; btn.textContent = btn.id === 'loginBtn' ? 'Đăng nhập' : 'Đăng ký'; }
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
  if (!input || !password) { setAuthError('Vui lòng nhập tên đăng nhập và mật khẩu'); return; }
  clearAuthMessages();
  const btn = document.getElementById('loginBtn');
  toggleLoading(btn, true);
  let email = input;
  if (!input.includes('@')) {
    const { data: profile } = await db.from('profiles').select('email').eq('username', input.toLowerCase()).maybeSingle();
    if (!profile || !profile.email) { toggleLoading(btn, false); setAuthError('Không tìm thấy tên đăng nhập'); return; }
    email = profile.email;
  }
  const { error } = await db.auth.signInWithPassword({ email, password });
  toggleLoading(btn, false);
  if (!error) { localStorage.setItem('stayLoggedIn', stayLoggedIn ? '1' : '0'); }
  else { setAuthError(error.message.includes('Invalid login credentials') ? 'Sai tên đăng nhập hoặc mật khẩu' : error.message); }
}

async function handleSignUp() {
  const username = document.getElementById('signupUsername').value.trim().toLowerCase();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  if (!username || !email || !password) { setAuthError('Vui lòng điền đầy đủ thông tin'); return; }
  if (password.length < 6) { setAuthError('Mật khẩu phải có ít nhất 6 ký tự'); return; }
  clearAuthMessages();
  const btn = document.getElementById('signupBtn');
  toggleLoading(btn, true);
  const { data, error } = await db.auth.signUp({ email, password });
  if (error) { toggleLoading(btn, false); setAuthError(error.message); return; }
  if (data.user) {
    const { error: pe } = await db.from('profiles').insert({ user_id: data.user.id, username, email });
    if (pe) { toggleLoading(btn, false); setAuthError('Tên đăng nhập đã tồn tại'); return; }
  }
  toggleLoading(btn, false);
  setAuthSuccess('Đăng ký thành công! Kiểm tra email để xác nhận.');
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
  } catch (e) { showToast('⚠️ Lỗi tải dữ liệu'); }
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
  if (data) state.settings = { low_stock_threshold: data.low_stock_threshold || 5, currency: data.currency || 'VNĐ' };
}

async function saveSettings() {
  const threshold = parseInt(document.getElementById('lowStockThreshold').value) || 5;
  state.settings.low_stock_threshold = threshold;
  await db.from('settings').upsert({
    user_id: state.user.id,
    low_stock_threshold: threshold,
    currency: 'VNĐ'
  }, { onConflict: 'user_id' });
  showToast('✅ Đã lưu cài đặt');
}

// ===== Items CRUD =====
async function addItem(data) {
  const { error } = await db.from('items').insert({
    user_id: state.user.id, code: data.code.toUpperCase(), name: data.name,
    description: data.description || '', unit_price: data.unit_price || 0,
    current_stock: data.current_stock || 0, min_stock: data.min_stock || 0
  });
  if (error) { showToast('⚠️ ' + error.message); return false; }
  await loadItems();
  renderAll();
  showToast('✅ Đã thêm mặt hàng');
  return true;
}

async function updateItem(id, data) {
  const { error } = await db.from('items').update(data).eq('id', id).eq('user_id', state.user.id);
  if (error) { showToast('⚠️ ' + error.message); return false; }
  await loadItems();
  renderAll();
  showToast('✅ Đã cập nhật');
  return true;
}

async function deleteItem(id) {
  const { error } = await db.from('items').delete().eq('id', id).eq('user_id', state.user.id);
  if (error) { showToast('⚠️ ' + error.message); return; }
  state.transactions = state.transactions.filter(t => t.item_id !== id);
  await loadItems();
  renderAll();
  showToast('🗑️ Đã xóa');
}

// ===== Transactions =====
async function addTransaction(data) {
  const { error: txError } = await db.from('transactions').insert({
    item_id: data.item_id, type: data.type, quantity: data.quantity,
    unit_price: data.unit_price || null, note: data.note || '',
    transaction_date: data.transaction_date || todayStr()
  });
  if (txError) { showToast('⚠️ ' + txError.message); return false; }
  // Update stock
  const item = state.items.find(i => i.id === data.item_id);
  if (item) {
    const delta = data.type === 'nhap' ? data.quantity : -data.quantity;
    await db.from('items').update({ current_stock: item.current_stock + delta })
      .eq('id', data.item_id).eq('user_id', state.user.id);
  }
  await Promise.all([loadItems(), loadTransactions()]);
  renderAll();
  showToast(data.type === 'nhap' ? '📥 Đã nhập kho' : '📤 Đã xuất kho');
  return true;
}

async function deleteTransaction(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx || !confirm('Xóa giao dịch này?')) return;
  const { error } = await db.from('transactions').delete().eq('id', id);
  if (error) { showToast('⚠️ ' + error.message); return; }
  // Reverse stock
  const item = state.items.find(i => i.id === tx.item_id);
  if (item) {
    const delta = tx.type === 'nhap' ? -tx.quantity : tx.quantity;
    await db.from('items').update({ current_stock: item.current_stock + delta })
      .eq('id', tx.item_id).eq('user_id', state.user.id);
  }
  await Promise.all([loadItems(), loadTransactions()]);
  renderAll();
  showToast('🗑️ Đã xóa giao dịch');
}

// ===== Rendering =====
function renderAll() {
  renderDashboard();
  renderItems();
  renderReports();
  renderSettings();
}

function getItemName(id) { const i = state.items.find(x => x.id === id); return i ? `${i.code} - ${i.name}` : '?'; }
function getItemById(id) { return state.items.find(x => x.id === id); }
function escapeHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function renderDashboard() {
  const items = state.items;
  document.getElementById('dashTotalItems').textContent = items.length;
  document.getElementById('dashTotalStock').textContent = items.reduce((s,i) => s + (i.current_stock||0), 0);
  const thresh = state.settings.low_stock_threshold;
  const low = items.filter(i => i.current_stock <= i.min_stock);
  document.getElementById('dashLowStock').textContent = low.length;

  const recent = state.transactions.slice(0, 10);
  const html = recent.map(t => {
    const item = getItemById(t.item_id);
    const icon = t.type === 'nhap' ? '📥' : '📤';
    return `<div class="transaction-item tx-${t.type}">
      <div><strong>${item ? escapeHtml(item.code) : '?'}</strong> ${escapeHtml(item ? item.name : '')}<br><span style="font-size:12px;color:#666;">${escapeHtml(t.note)}</span></div>
      <div style="text-align:right;white-space:nowrap;">
        <div style="font-weight:600;color:${t.type==='nhap'?'#1e7e34':'#c5221f'}">${icon} ${t.type === 'nhap' ? '+' : '-'}${t.quantity}</div>
        <div style="font-size:12px;color:#999;">${formatDate(t.transaction_date)}</div>
      </div>
    </div>`;
  }).join('');
  document.getElementById('recentTransactions').innerHTML = html || '<div class="empty-state"><div class="icon">📦</div><p>Chưa có giao dịch</p></div>';
}

function renderItems() {
  const q = (document.getElementById('itemSearch').value || '').toLowerCase();
  const filtered = state.items.filter(i => (i.code+'').toLowerCase().includes(q) || (i.name+'').toLowerCase().includes(q));
  const thresh = state.settings.low_stock_threshold;
  document.getElementById('itemList').innerHTML = filtered.map(i => {
    const low = i.current_stock <= i.min_stock;
    return `<div class="item-card" onclick="openItemDetail('${i.id}')">
      <div class="name">${escapeHtml(i.name)} <span style="font-size:13px;color:#1a73e8;font-weight:500;">${escapeHtml(i.code)}</span></div>
      <div class="meta">
        <span>Tồn: <strong>${i.current_stock}</strong> ${low ? '⚠️' : ''}</span>
        <span>💰 ${formatCurrency(i.unit_price)}</span>
      </div>
    </div>`;
  }).join('') || '<div class="empty-state"><div class="icon">🔍</div><p>Không tìm thấy hàng</p></div>';
}

function renderReports() {
  const items = state.items;
  const totalValue = items.reduce((s,i) => s + (i.current_stock||0) * (i.unit_price||0), 0);
  const lowItems = items.filter(i => i.current_stock <= i.min_stock);
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-01`;
  const monthTx = state.transactions.filter(t => t.transaction_date >= monthStart);
  const nhapCount = monthTx.filter(t => t.type === 'nhap').reduce((s,t) => s + t.quantity, 0);
  const xuatCount = monthTx.filter(t => t.type === 'xuat').reduce((s,t) => s + t.quantity, 0);

  document.getElementById('reportsContent').innerHTML = `
    <div class="stats">
      <div class="stat-card"><div class="num">${items.length}</div><div class="label">Mặt hàng</div></div>
      <div class="stat-card"><div class="num">${formatCurrency(totalValue)}</div><div class="label">Tổng giá trị</div></div>
      <div class="stat-card"><div class="num danger">${lowItems.length}</div><div class="label">Sắp hết</div></div>
    </div>
    <div class="settings-group">
      <div class="settings-item"><span class="label">📥 Nhập kho tháng này</span><span class="value" style="color:#1e7e34;font-weight:600;">+${nhapCount}</span></div>
      <div class="settings-item"><span class="label">📤 Xuất kho tháng này</span><span class="value" style="color:#c5221f;font-weight:600;">-${xuatCount}</span></div>
      <div class="settings-item"><span class="label">Chênh lệch</span><span class="value" style="font-weight:600;">${nhapCount - xuatCount >= 0 ? '+' : ''}${nhapCount - xuatCount}</span></div>
    </div>
    ${lowItems.length > 0 ? `<div class="section-title">⚠️ Hàng sắp hết</div>
      ${lowItems.map(i => `<div class="item-card" onclick="openItemDetail('${i.id}')">
        <div class="name">${escapeHtml(i.name)} <span style="font-size:13px;color:#1a73e8;">${escapeHtml(i.code)}</span></div>
        <div class="meta"><span>Tồn: <strong style="color:#c5221f;">${i.current_stock}</strong> / Tối thiểu: ${i.min_stock}</span></div>
      </div>`).join('')}` : ''}
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

// ===== Open Add Item =====
function openAddItem(item) {
  const isEdit = !!item;
  const title = isEdit ? '✏️ Sửa mặt hàng' : '➕ Thêm mặt hàng';
  const code = isEdit ? escapeHtml(item.code) : '';
  const name = isEdit ? escapeHtml(item.name) : '';
  const desc = isEdit ? escapeHtml(item.description) : '';
  const price = isEdit ? item.unit_price : '';
  const stock = isEdit ? item.current_stock : '';
  const minStock = isEdit ? item.min_stock : '';
  const saveFn = isEdit ? `submitEditItem('${item.id}')` : 'submitAddItem()';
  showModal(`
    <h2>${title}</h2>
    <div class="field"><label>Mã hàng *</label><input type="text" id="itemCode" value="${code}" placeholder="VD: MT-001"></div>
    <div class="field"><label>Tên hàng</label><input type="text" id="itemName" value="${name}" placeholder="Tên dụng cụ"></div>
    <div class="field"><label>Mô tả</label><textarea id="itemDesc" rows="2">${desc}</textarea></div>
    <div class="field"><label>Giá bán (VNĐ)</label><input type="number" id="itemPrice" value="${price}" placeholder="0"></div>
    ${isEdit ? `<div class="field"><label>Tồn kho</label><input type="number" id="itemStock" value="${stock}"></div>` : `<div class="field"><label>Tồn kho ban đầu</label><input type="number" id="itemStock" value="0"></div>`}
    <div class="field"><label>Cảnh báo khi tồn kho dưới</label><input type="number" id="itemMinStock" value="${minStock}" placeholder="VD: 5"><div style="font-size:12px;color:#999;margin-top:2px;">Hệ thống sẽ đánh dấu mặt hàng sắp hết khi tồn kho xuống dưới số này</div></div>
    <div class="btn-row">
      <button class="btn-secondary" onclick="closeModal()">Hủy</button>
      <button class="btn-primary" onclick="${saveFn}">${isEdit ? 'Lưu' : 'Thêm'}</button>
    </div>
  `);
}

async function submitAddItem() {
  const code = document.getElementById('itemCode').value.trim();
  if (!code) { showToast('⚠️ Vui lòng nhập mã hàng'); return; }
  const ok = await addItem({
    code, name: document.getElementById('itemName').value.trim(),
    description: document.getElementById('itemDesc').value.trim(),
    unit_price: parseInt(document.getElementById('itemPrice').value) || 0,
    current_stock: parseInt(document.getElementById('itemStock').value) || 0,
    min_stock: parseInt(document.getElementById('itemMinStock').value) || 0
  });
  if (ok) closeModal();
}

async function submitEditItem(id) {
  const code = document.getElementById('itemCode').value.trim();
  if (!code) { showToast('⚠️ Vui lòng nhập mã hàng'); return; }
  const ok = await updateItem(id, {
    code, name: document.getElementById('itemName').value.trim(),
    description: document.getElementById('itemDesc').value.trim(),
    unit_price: parseInt(document.getElementById('itemPrice').value) || 0,
    current_stock: parseInt(document.getElementById('itemStock').value) || 0,
    min_stock: parseInt(document.getElementById('itemMinStock').value) || 0
  });
  if (ok) closeModal();
}

// ===== Open Item Detail =====
function openItemDetail(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  const txs = state.transactions.filter(t => t.item_id === id).slice(0, 50);
  const txHtml = txs.map(t => {
    const icon = t.type === 'nhap' ? '📥' : '📤';
    return `<div class="transaction-item tx-${t.type}" ${state.user ? `style="cursor:pointer;" onclick="deleteTransaction('${t.id}')"` : ''}>
      <div>
        <strong style="color:${t.type==='nhap'?'#1e7e34':'#c5221f'}">${icon} ${t.type === 'nhap' ? 'Nhập' : 'Xuất'}</strong>
        <span style="font-size:12px;color:#666;margin-left:6px;">${escapeHtml(t.note)}</span>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:600;">${t.type === 'nhap' ? '+' : '-'}${t.quantity}</div>
        <div style="font-size:12px;color:#999;">${formatDate(t.transaction_date)}</div>
      </div>
    </div>`;
  }).join('') || '<div class="empty-state"><p>Chưa có giao dịch</p></div>';

  const low = item.current_stock <= item.min_stock;
  showModal(`
    <h2>${escapeHtml(item.code)} <span class="badge ${low ? 'badge-warn' : 'badge-ok'}">${low ? '⚠️ Sắp hết' : '✅ Còn hàng'}</span></h2>
    <div style="margin-bottom:12px;">
      <div style="font-size:17px;font-weight:600;margin-bottom:4px;">${escapeHtml(item.name)}</div>
      ${item.description ? '<div style="font-size:14px;color:#666;margin-bottom:4px;">' + escapeHtml(item.description) + '</div>' : ''}
      <div style="font-size:14px;margin-bottom:4px;"><strong>💰 Giá bán:</strong> ${formatCurrency(item.unit_price)}</div>
      <div style="font-size:14px;margin-bottom:4px;"><strong>📦 Tồn kho:</strong> ${item.current_stock}</div>
      <div style="font-size:14px;margin-bottom:4px;"><strong>⚠️ Tồn tối thiểu:</strong> ${item.min_stock}</div>
    </div>
    <div class="actions" style="margin-bottom:12px;">
      <button class="btn-primary" onclick="openNhapKhoFor('${item.id}')" style="font-size:13px;">📥 Nhập</button>
      <button class="btn-success" onclick="openXuatKhoFor('${item.id}')" style="font-size:13px;">📤 Xuất</button>
      <button class="btn-secondary" onclick="openAddItem(state.items.find(i=>i.id==='${item.id}'))" style="font-size:13px;">✏️ Sửa</button>
    </div>
    <div class="section-title">Lịch sử giao dịch</div>
    ${txHtml}
    <div class="btn-row" style="margin-top:14px;">
      <button class="btn-danger" onclick="confirmDeleteItem('${item.id}','${escapeHtml(item.code)}')" style="flex:1;">🗑️ Xóa hàng</button>
      <button class="btn-secondary" onclick="closeModal()" style="flex:1;">Đóng</button>
    </div>
  `);
}

// ===== Delete Item Helper =====
async function confirmDeleteItem(id, code) {
  if (!confirm('Xóa mặt hàng ' + code + '?\nTất cả giao dịch liên quan sẽ bị xóa.')) return;
  closeModal();
  await deleteItem(id);
}

// ===== Stock In (Nhập kho) =====
function openNhapKho() { openStockForm('nhap', null); }
function openNhapKhoFor(itemId) { openStockForm('nhap', itemId); }
function openXuatKho() { openStockForm('xuat', null); }
function openXuatKhoFor(itemId) { openStockForm('xuat', itemId); }

function openStockForm(type, preselectedId) {
  const isNhap = type === 'nhap';
  const title = isNhap ? '📥 Nhập kho' : '📤 Xuất kho';
  const btnLabel = isNhap ? 'Nhập kho' : 'Xuất kho';
  const btnClass = isNhap ? 'btn-primary' : 'btn-success';
  const notePlaceholder = isNhap ? 'Ghi chú (VD: nhập từ nhà cung cấp A)' : 'Ghi chú (VD: bán cho khách B)';
  const stockWarn = !isNhap ? `<div id="stockWarn" style="font-size:13px;color:#c5221f;margin-bottom:8px;display:none;"></div>` : '';

  const itemOpts = state.items.map(i =>
    `<option value="${i.id}"${i.id===preselectedId?' selected':''}>${escapeHtml(i.code)} - ${escapeHtml(i.name)} (tồn: ${i.current_stock})</option>`
  ).join('');

  showModal(`
    <h2>${title}</h2>
    <div class="field"><label>Mặt hàng *</label>
      <select id="stockItem" onchange="${isNhap ? '' : 'checkXuatStock()'}" style="width:100%;padding:12px 14px;border:1px solid #ddd;border-radius:8px;font-size:16px;background:white;">
        <option value="">-- Chọn hàng --</option>
        ${itemOpts}
      </select>
    </div>
    <div class="field"><label>Số lượng *</label>
      <input type="number" id="stockQty" value="1" min="1" onchange="${isNhap ? '' : 'checkXuatStock()'}" oninput="${isNhap ? '' : 'checkXuatStock()'}">
    </div>
    ${isNhap ? '<div class="field"><label>Đơn giá nhập (VNĐ)</label><input type="number" id="stockPrice" value="0" min="0"></div>' : ''}
    ${stockWarn}
    <div class="field"><label>Ngày</label>${dateDropdownsHtml('stock', todayStr())}</div>
    <div class="field"><label>Ghi chú</label><input type="text" id="stockNote" placeholder="${notePlaceholder}"></div>
    <div class="btn-row">
      <button class="btn-secondary" onclick="closeModal()">Hủy</button>
      <button class="${btnClass}" onclick="submitStockForm('${type}')">✅ ${btnLabel}</button>
    </div>
  `);
}

function checkXuatStock() {
  const sel = document.getElementById('stockItem');
  const qty = parseInt(document.getElementById('stockQty').value) || 0;
  const item = state.items.find(i => i.id === sel.value);
  const warn = document.getElementById('stockWarn');
  if (item && qty > item.current_stock) { warn.style.display = 'block'; warn.textContent = '⚠️ Tồn kho hiện tại: ' + item.current_stock + '. Số lượng xuất không được lớn hơn tồn kho!'; }
  else { warn.style.display = 'none'; }
}

async function submitStockForm(type) {
  const itemId = document.getElementById('stockItem').value;
  const qty = parseInt(document.getElementById('stockQty').value) || 0;
  if (!itemId || qty <= 0) { showToast('⚠️ Chọn mặt hàng và nhập số lượng'); return; }
  const item = state.items.find(i => i.id === itemId);
  if (type === 'xuat' && qty > (item ? item.current_stock : 0)) { showToast('⚠️ Số lượng xuất vượt quá tồn kho'); return; }
  const ok = await addTransaction({
    item_id: itemId, type, quantity: qty,
    unit_price: type === 'nhap' ? (parseInt(document.getElementById('stockPrice').value) || 0) : (item ? item.unit_price : 0),
    note: document.getElementById('stockNote').value.trim(),
    transaction_date: readDateDropdowns('stock')
  });
  if (ok) closeModal();
}

// ===== Utility =====
function exportData() {
  const data = JSON.stringify({ items: state.items, transactions: state.transactions }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `kho-chu-thang-${new Date().toISOString().split('T')[0]}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('✅ Đã sao lưu');
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!confirm('Nhập dữ liệu sẽ hiển thị tạm thời. Tải lại trang sẽ mất. Tiếp tục?')) return;
      state.items = data.items || [];
      state.transactions = data.transactions || [];
      renderAll();
      showToast('✅ Đã nhập dữ liệu (tạm thời)');
    } catch(err) { showToast('⚠️ File không hợp lệ'); }
    event.target.value = '';
  };
  reader.readAsText(file);
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', initAuth);