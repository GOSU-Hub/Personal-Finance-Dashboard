/* =============================================
   FINSIGHT — script.js
   Frontend logic: fetch, render, charts, sort,
   edit & delete transactions
   ============================================= */

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// 🔧 แก้ GAS_URL เป็น URL ของ Google Apps Script Web App ที่ Deploy แล้ว
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwKWo_RwW6tR_KrayYjs7NNNmrDuWLG4_CPpVf60g3RQXKxct0g74YL-dFs-rhSa8i9/exec';

// ─── STATE ───────────────────────────────────────────────────────────────────
let allTransactions  = [];      // ข้อมูลทั้งหมดจาก API (แต่ละ item มี _row)
let filteredData     = [];      // ข้อมูลหลังกรอง (Dashboard)
let tableData        = [];      // ข้อมูลหลังกรอง (Table)
let sortCol          = 'date';  // คอลัมน์ที่ sort
let sortDir          = 'desc';  // ทิศทาง
let pieChartInst     = null;
let barChartInst     = null;
let pendingDeleteIdx = null;    // index ใน allTransactions ที่รอลบ

// ─── DOM REFS ────────────────────────────────────────────────────────────────
const loadingOverlay  = document.getElementById('loadingOverlay');
const totalIncomeEl   = document.getElementById('totalIncome');
const totalExpenseEl  = document.getElementById('totalExpense');
const netBalanceEl    = document.getElementById('netBalance');
const incomeCountEl   = document.getElementById('incomeCount');
const expenseCountEl  = document.getElementById('expenseCount');
const balanceStatusEl = document.getElementById('balanceStatus');
const latestListEl    = document.getElementById('latestList');
const txTableBodyEl   = document.getElementById('txTableBody');
const rowCountEl      = document.getElementById('rowCount');
const formFeedbackEl  = document.getElementById('formFeedback');
const editBackdrop    = document.getElementById('editModalBackdrop');
const deleteBackdrop  = document.getElementById('deleteModalBackdrop');
const deleteDetailEl  = document.getElementById('deleteDetail');

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function setLoading(show) {
  loadingOverlay.classList.toggle('show', show);
}

/** Format ตัวเลขเป็น ฿ x,xxx.xx */
function fmt(num) {
  return '฿ ' + Number(num).toLocaleString('th-TH', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

/** Format วันที่ YYYY-MM-DD → DD/MM/YY */
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function today()     { return new Date().toISOString().split('T')[0]; }
function thisMonth() { return today().slice(0, 7); }

// ─── API CALLS ───────────────────────────────────────────────────────────────

async function fetchTransactions() {
  setLoading(true);
  try {
    const res  = await fetch(`${GAS_URL}?action=getTransactions`);
    const json = await res.json();
    if (json.status === 'ok') allTransactions = json.data || [];
  } catch {
    allTransactions = getDemoData();
  }
  setLoading(false);
}

async function postTransaction(data) {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'addTransaction', ...data }),
  });
  return res.json();
}

async function patchTransaction(row, data) {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'updateTransaction', row, ...data }),
  });
  return res.json();
}

async function deleteTransactionApi(row) {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'deleteTransaction', row }),
  });
  return res.json();
}

// ─── DEMO DATA ───────────────────────────────────────────────────────────────
function getDemoData() {
  const m = thisMonth();
  return [
    { _row: 2,  date: `${m}-01`, type: 'Income',  amount: 45000,  category: 'Salary',        note: 'Monthly salary' },
    { _row: 3,  date: `${m}-03`, type: 'Expense', amount: 1200,   category: 'Food',          note: 'Lunch BKK' },
    { _row: 4,  date: `${m}-05`, type: 'Expense', amount: 3500,   category: 'Transport',     note: 'BTS Monthly pass' },
    { _row: 5,  date: `${m}-07`, type: 'Income',  amount: 8000,   category: 'Freelance',     note: 'Website project' },
    { _row: 6,  date: `${m}-09`, type: 'Expense', amount: 2800,   category: 'Shopping',      note: 'Clothes' },
    { _row: 7,  date: `${m}-10`, type: 'Expense', amount: 900,    category: 'Entertainment', note: 'Netflix + Spotify' },
    { _row: 8,  date: `${m}-12`, type: 'Expense', amount: 1500,   category: 'Bills',         note: 'Electricity' },
    { _row: 9,  date: `${m}-14`, type: 'Income',  amount: 2000,   category: 'Investment',    note: 'Dividend' },
    { _row: 10, date: `${m}-15`, type: 'Expense', amount: 600,    category: 'Health',        note: 'Gym membership' },
    { _row: 11, date: `${m}-18`, type: 'Expense', amount: 450,    category: 'Food',          note: 'Coffee & snacks' },
  ];
}

// ─── FILTER ──────────────────────────────────────────────────────────────────
function applyFilters(data, period, type) {
  return data.filter(tx => {
    let matchPeriod = true;
    if (period === 'today') matchPeriod = tx.date === today();
    else if (period === 'month') matchPeriod = (tx.date || '').startsWith(thisMonth());
    const matchType = type === 'all' || tx.type === type;
    return matchPeriod && matchType;
  });
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
function renderDashboard() {
  const period = document.getElementById('filterPeriod').value;
  const type   = document.getElementById('filterType').value;
  filteredData = applyFilters(allTransactions, period, type);

  let totalIncome = 0, totalExpense = 0, incCount = 0, expCount = 0;
  filteredData.forEach(tx => {
    if (tx.type === 'Income')  { totalIncome  += Number(tx.amount); incCount++; }
    if (tx.type === 'Expense') { totalExpense += Number(tx.amount); expCount++; }
  });
  const balance = totalIncome - totalExpense;

  totalIncomeEl.textContent   = fmt(totalIncome);
  totalExpenseEl.textContent  = fmt(totalExpense);
  netBalanceEl.textContent    = fmt(balance);
  incomeCountEl.textContent   = `${incCount} transaction${incCount !== 1 ? 's' : ''}`;
  expenseCountEl.textContent  = `${expCount} transaction${expCount !== 1 ? 's' : ''}`;
  balanceStatusEl.textContent = balance >= 0 ? '✓ Positive' : '⚠ Negative';
  netBalanceEl.style.color    = balance >= 0 ? 'var(--income)' : 'var(--expense)';

  renderPieChart(filteredData);
  renderBarChart(filteredData);
  renderLatest(filteredData);
}

// ─── PIE CHART ───────────────────────────────────────────────────────────────
function renderPieChart(data) {
  const catMap = {};
  data.filter(tx => tx.type === 'Expense').forEach(tx => {
    catMap[tx.category] = (catMap[tx.category] || 0) + Number(tx.amount);
  });
  const labels  = Object.keys(catMap);
  const values  = Object.values(catMap);
  const palette = ['#ff5e7a','#5b8fff','#00d68f','#ffb020','#c0a0ff','#ff9a3c','#00cfff','#ff6bcb','#a0e84c','#f0c030'];
  const ctx = document.getElementById('pieChart').getContext('2d');
  if (pieChartInst) pieChartInst.destroy();
  if (!labels.length) { ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); return; }
  pieChartInst = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: palette, borderWidth: 0, hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { color: '#6b7594', font: { size: 11 }, boxWidth: 10, padding: 14 } },
        tooltip: { callbacks: { label: c => ` ${c.label}: ฿${Number(c.raw).toLocaleString()}` } }
      }
    }
  });
}

// ─── BAR CHART ───────────────────────────────────────────────────────────────
function renderBarChart(data) {
  const monthMap = {};
  data.forEach(tx => {
    const m = (tx.date || '').slice(0, 7);
    if (!m) return;
    if (!monthMap[m]) monthMap[m] = { Income: 0, Expense: 0 };
    if (tx.type === 'Income')  monthMap[m].Income  += Number(tx.amount);
    if (tx.type === 'Expense') monthMap[m].Expense += Number(tx.amount);
  });
  const labels   = Object.keys(monthMap).sort();
  const incomes  = labels.map(m => monthMap[m].Income);
  const expenses = labels.map(m => monthMap[m].Expense);
  const ctx = document.getElementById('barChart').getContext('2d');
  if (barChartInst) barChartInst.destroy();
  barChartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Income',  data: incomes,  backgroundColor: '#00d68f44', borderColor: '#00d68f', borderWidth: 1.5, borderRadius: 6 },
        { label: 'Expense', data: expenses, backgroundColor: '#ff5e7a44', borderColor: '#ff5e7a', borderWidth: 1.5, borderRadius: 6 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#6b7594', font: { size: 11 }, boxWidth: 10 } },
        tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ฿${Number(c.raw).toLocaleString()}` } }
      },
      scales: {
        x: { grid: { color: '#252a38' }, ticks: { color: '#6b7594', font: { size: 11 } } },
        y: { grid: { color: '#252a38' }, ticks: { color: '#6b7594', font: { size: 11 }, callback: v => '฿' + Number(v).toLocaleString() } }
      }
    }
  });
}

// ─── LATEST LIST ─────────────────────────────────────────────────────────────
function renderLatest(data) {
  const sorted = [...data].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6);
  if (!sorted.length) {
    latestListEl.innerHTML = '<div class="empty-state">No transactions for this period</div>';
    return;
  }
  latestListEl.innerHTML = sorted.map(tx => {
    const cls  = tx.type === 'Income' ? 'income' : 'expense';
    const sign = tx.type === 'Income' ? '+' : '-';
    return `
      <div class="tx-row">
        <div class="tx-dot ${cls}"></div>
        <div class="tx-info">
          <div class="tx-cat">${tx.category || '—'}</div>
          <div class="tx-note">${tx.note || '—'}</div>
        </div>
        <div class="tx-date-label">${fmtDate(tx.date)}</div>
        <div class="tx-amount-label ${cls}">${sign}${fmt(tx.amount)}</div>
      </div>`;
  }).join('');
}

// ─── TRANSACTION TABLE ───────────────────────────────────────────────────────
function renderTable() {
  const period = document.getElementById('tblFilterPeriod').value;
  const type   = document.getElementById('tblFilterType').value;
  const search = document.getElementById('searchInput').value.toLowerCase().trim();

  tableData = applyFilters(allTransactions, period, type).filter(tx => {
    if (!search) return true;
    return (tx.category || '').toLowerCase().includes(search) ||
           (tx.note     || '').toLowerCase().includes(search);
  });

  tableData.sort((a, b) => {
    let va = a[sortCol] ?? '', vb = b[sortCol] ?? '';
    if (sortCol === 'amount') { va = Number(va); vb = Number(vb); }
    if (va < vb) return sortDir === 'asc' ? -1 :  1;
    if (va > vb) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  rowCountEl.textContent = `${tableData.length} record${tableData.length !== 1 ? 's' : ''}`;

  if (!tableData.length) {
    txTableBodyEl.innerHTML = '<tr><td colspan="6" class="empty-state">No matching records</td></tr>';
    return;
  }

  txTableBodyEl.innerHTML = tableData.map(tx => {
    const cls     = tx.type === 'Income' ? 'income' : 'expense';
    const sign    = tx.type === 'Income' ? '+' : '-';
    const realIdx = allTransactions.indexOf(tx); // index จริงสำหรับ edit/delete
    return `
      <tr>
        <td class="mono">${fmtDate(tx.date)}</td>
        <td><span class="badge badge-${cls}">${tx.type}</span></td>
        <td class="mono" style="color:var(--${cls})">${sign}${fmt(tx.amount)}</td>
        <td>${tx.category || '—'}</td>
        <td style="color:var(--text-dim)">${tx.note || '—'}</td>
        <td>
          <div class="action-btns">
            <button class="btn-icon edit" title="Edit" data-idx="${realIdx}">
              <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon del" title="Delete" data-idx="${realIdx}">
              <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');

  // ผูก click หลัง render
  txTableBodyEl.querySelectorAll('.btn-icon.edit').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(Number(btn.dataset.idx)));
  });
  txTableBodyEl.querySelectorAll('.btn-icon.del').forEach(btn => {
    btn.addEventListener('click', () => openDeleteModal(Number(btn.dataset.idx)));
  });
}

// ─── SORT ────────────────────────────────────────────────────────────────────
document.querySelectorAll('.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    sortDir = sortCol === col ? (sortDir === 'asc' ? 'desc' : 'asc') : 'desc';
    sortCol = col;
    document.querySelectorAll('.sort-icon').forEach(ic => ic.textContent = '↕');
    th.querySelector('.sort-icon').textContent = sortDir === 'asc' ? '↑' : '↓';
    renderTable();
  });
});

// ─── EDIT MODAL ──────────────────────────────────────────────────────────────

function openEditModal(idx) {
  const tx = allTransactions[idx];
  if (!tx) return;
  document.getElementById('editIndex').value    = idx;
  document.getElementById('editDate').value     = tx.date     || today();
  document.getElementById('editAmount').value   = tx.amount   || '';
  document.getElementById('editNote').value     = tx.note     || '';
  document.getElementById('editCategory').value = tx.category || 'Other';
  setEditType(tx.type || 'Income');
  editBackdrop.classList.add('show');
}

function closeEditModal() { editBackdrop.classList.remove('show'); }

function setEditType(val) {
  document.getElementById('editType').value = val;
  document.getElementById('editBtnIncome').classList.toggle('active', val === 'Income');
  document.getElementById('editBtnExpense').classList.toggle('active', val === 'Expense');
}

document.getElementById('editBtnIncome').addEventListener('click',  () => setEditType('Income'));
document.getElementById('editBtnExpense').addEventListener('click', () => setEditType('Expense'));
document.getElementById('editModalClose').addEventListener('click',  closeEditModal);
document.getElementById('editModalCancel').addEventListener('click', closeEditModal);
editBackdrop.addEventListener('click', e => { if (e.target === editBackdrop) closeEditModal(); });

document.getElementById('editModalSave').addEventListener('click', async () => {
  const idx      = Number(document.getElementById('editIndex').value);
  const type     = document.getElementById('editType').value;
  const amount   = parseFloat(document.getElementById('editAmount').value);
  const date     = document.getElementById('editDate').value;
  const category = document.getElementById('editCategory').value;
  const note     = document.getElementById('editNote').value.trim();

  if (!amount || amount <= 0) { alert('Please enter a valid amount.'); return; }
  if (!date)                  { alert('Please select a date.'); return; }

  const saveBtn = document.getElementById('editModalSave');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  setLoading(true);

  const newData = { date, type, amount, category, note };

  try {
    if (GAS_URL.includes('YOUR_SCRIPT_ID')) {
      // Demo mode — อัปเดต local state
      allTransactions[idx] = { ...allTransactions[idx], ...newData };
    } else {
      const row = allTransactions[idx]._row;
      const res = await patchTransaction(row, newData);
      if (res.status !== 'ok') throw new Error(res.message);
      allTransactions[idx] = { ...allTransactions[idx], ...newData };
    }
    closeEditModal();
    renderTable();
    renderDashboard();
  } catch (err) {
    alert('Error saving: ' + err.message);
  }

  setLoading(false);
  saveBtn.disabled = false;
  saveBtn.textContent = 'Save Changes';
});

// ─── DELETE MODAL ─────────────────────────────────────────────────────────────

function openDeleteModal(idx) {
  const tx = allTransactions[idx];
  if (!tx) return;
  pendingDeleteIdx = idx;
  const cls  = tx.type === 'Income' ? 'income' : 'expense';
  const sign = tx.type === 'Income' ? '+' : '-';
  deleteDetailEl.innerHTML = `
    <strong>${tx.category || '—'}</strong><br>
    <span>${fmtDate(tx.date)} &nbsp;·&nbsp; </span>
    <strong style="color:var(--${cls})">${sign}${fmt(tx.amount)}</strong><br>
    <span>${tx.note || '—'}</span>
  `;
  deleteBackdrop.classList.add('show');
}

function closeDeleteModal() {
  deleteBackdrop.classList.remove('show');
  pendingDeleteIdx = null;
}

document.getElementById('deleteModalClose').addEventListener('click',  closeDeleteModal);
document.getElementById('deleteModalCancel').addEventListener('click', closeDeleteModal);
deleteBackdrop.addEventListener('click', e => { if (e.target === deleteBackdrop) closeDeleteModal(); });

document.getElementById('deleteModalConfirm').addEventListener('click', async () => {
  if (pendingDeleteIdx === null) return;
  const idx = pendingDeleteIdx;

  const btn = document.getElementById('deleteModalConfirm');
  btn.disabled = true;
  btn.textContent = 'Deleting…';
  setLoading(true);

  try {
    if (GAS_URL.includes('YOUR_SCRIPT_ID')) {
      allTransactions.splice(idx, 1);
    } else {
      const row = allTransactions[idx]._row;
      const res = await deleteTransactionApi(row);
      if (res.status !== 'ok') throw new Error(res.message);
      allTransactions.splice(idx, 1);
    }
    closeDeleteModal();
    renderTable();
    renderDashboard();
  } catch (err) {
    alert('Error deleting: ' + err.message);
  }

  setLoading(false);
  btn.disabled = false;
  btn.textContent = 'Delete';
});

// ─── ADD TRANSACTION ─────────────────────────────────────────────────────────

document.getElementById('btnIncome').addEventListener('click',  () => setAddType('Income'));
document.getElementById('btnExpense').addEventListener('click', () => setAddType('Expense'));

function setAddType(val) {
  document.getElementById('txType').value = val;
  document.getElementById('btnIncome').classList.toggle('active',  val === 'Income');
  document.getElementById('btnExpense').classList.toggle('active', val === 'Expense');
}

document.getElementById('txDate').value = today();

document.getElementById('submitBtn').addEventListener('click', async () => {
  const type     = document.getElementById('txType').value;
  const amount   = parseFloat(document.getElementById('txAmount').value);
  const date     = document.getElementById('txDate').value;
  const category = document.getElementById('txCategory').value;
  const note     = document.getElementById('txNote').value.trim();

  if (!amount || amount <= 0) { showFeedback('Please enter a valid amount.', 'error'); return; }
  if (!date)                  { showFeedback('Please select a date.', 'error'); return; }

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';
  setLoading(true);

  const data = { date, type, amount, category, note };

  try {
    if (GAS_URL.includes('YOUR_SCRIPT_ID')) {
      allTransactions.unshift({ _row: Date.now(), ...data });
      showFeedback('✓ Added (demo mode — not saved to Sheets)', 'success');
    } else {
      const result = await postTransaction(data);
      if (result.status !== 'ok') throw new Error(result.message || 'Unknown error');
      allTransactions.unshift({ _row: result.row, ...data });
      showFeedback('✓ Transaction saved to Google Sheets!', 'success');
    }
    document.getElementById('txAmount').value = '';
    document.getElementById('txNote').value   = '';
    document.getElementById('txDate').value   = today();
    renderDashboard();
  } catch (err) {
    showFeedback('✗ Error: ' + err.message, 'error');
  }

  setLoading(false);
  submitBtn.disabled = false;
  submitBtn.textContent = 'Add Transaction';
});

function showFeedback(msg, type) {
  formFeedbackEl.textContent = msg;
  formFeedbackEl.className   = 'form-feedback ' + type;
  setTimeout(() => { formFeedbackEl.className = 'form-feedback'; }, 4000);
}

// ─── NAVIGATION ──────────────────────────────────────────────────────────────

function navigateTo(sectionId) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const sec = document.getElementById(`section-${sectionId}`);
  if (sec) sec.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
  if (nav) nav.classList.add('active');
  const titles = { dashboard: 'Dashboard', add: 'Add Transaction', transactions: 'Transactions' };
  document.getElementById('sectionTitle').textContent = titles[sectionId] || sectionId;
  if (sectionId === 'dashboard')    renderDashboard();
  if (sectionId === 'transactions') renderTable();
  document.querySelector('.sidebar').classList.remove('open');
  document.querySelector('.sidebar-overlay')?.classList.remove('show');
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => { e.preventDefault(); navigateTo(item.dataset.section); });
});
document.querySelector('.latest-link').addEventListener('click', e => {
  e.preventDefault(); navigateTo('transactions');
});

// ─── FILTERS ─────────────────────────────────────────────────────────────────
document.getElementById('applyFilter').addEventListener('click', renderDashboard);
document.getElementById('tblApplyFilter').addEventListener('click', renderTable);
document.getElementById('searchInput').addEventListener('input', renderTable);

// ─── REFRESH ─────────────────────────────────────────────────────────────────
document.getElementById('refreshBtn').addEventListener('click', async () => {
  await fetchTransactions();
  renderDashboard();
  renderTable();
});

// ─── MOBILE SIDEBAR ──────────────────────────────────────────────────────────
const overlay = document.createElement('div');
overlay.className = 'sidebar-overlay';
document.body.appendChild(overlay);

document.getElementById('hamburgerBtn').addEventListener('click', () => {
  document.querySelector('.sidebar').classList.toggle('open');
  overlay.classList.toggle('show');
});
overlay.addEventListener('click', () => {
  document.querySelector('.sidebar').classList.remove('open');
  overlay.classList.remove('show');
});

// ─── INIT ────────────────────────────────────────────────────────────────────
async function init() {
  await fetchTransactions();
  renderDashboard();
}

init();
