// ── State ────────────────────────────────────────────────────────────────────
let allOrders = [];
let itemCatalog = [];
let deleteTargetId = null;
let currentPage = 1;
const PAGE_SIZE = 10;
let sortByOrderDate = null; // null = no sort, 'asc' or 'desc'

const ITEM_PRICES = {
  'Sooji Puri': 3.99,
  'Farsi Puri': 4.49,
  'Methi Puri': 4.49,
  'Namak Para': 4.49,
  'Tikha Ganthiya': 3.99,
  'Sev': 2.99,
  'Chakri': 4.49
};

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Display current date
  const now = new Date();
  const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('currentDate').textContent = now.toLocaleDateString('en-US', opts);

  loadOrders();
  loadItems();

  // Order Date sorting handler
  const th = document.getElementById('thOrderDate');
  if (th) th.addEventListener('click', () => {
    if (!sortByOrderDate) sortByOrderDate = 'asc';
    else if (sortByOrderDate === 'asc') sortByOrderDate = 'desc';
    else sortByOrderDate = null;
    updateSortIcon();
    filterOrders();
  });
  updateSortIcon();

  // enable/disable Reset button based on date inputs
  const dfInput = document.getElementById('filterDateFrom');
  const dtInput = document.getElementById('filterDateTo');
  const resetBtn = document.getElementById('filterDateResetBtn');
  function updateResetButtonState() {
    if (!resetBtn) return;
    const has = (dfInput && dfInput.value) || (dtInput && dtInput.value);
    resetBtn.disabled = !has;
  }
  // attach listeners
  [dfInput, dtInput].forEach(el => {
    if (!el) return;
    el.addEventListener('input', updateResetButtonState);
    el.addEventListener('change', updateResetButtonState);
  });
  // set initial state
  updateResetButtonState();

  // Month is set server-side; date-range filter inputs handle filtering
  // Trigger search when pressing Enter in date inputs
  try {
    const df = document.getElementById('filterDateFrom');
    const dt = document.getElementById('filterDateTo');
    [df, dt].forEach(el => {
      if (!el) return;
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); filterOrders(); } });
    });
  } catch (e) {}
});

// ── API Calls ────────────────────────────────────────────────────────────────
async function loadOrders() {
  setLoadStatus('Loading orders…', 'loading');
  try {
    const res = await fetch('/api/orders');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allOrders = await res.json();
    updateStats();
    filterOrders();
    // show alert for today's deliveries (if any)
    checkTodaysDeliveries();
    setLoadStatus(`Loaded ${allOrders.length} orders`, 'success');
  } catch (err) {
    console.error('Failed to load orders:', err);
    setLoadStatus('Failed to load orders. Click retry.', 'error');
  }
}

function updateSortIcon() {
  const el = document.getElementById('orderDateSortIcon');
  if (!el) return;
  if (sortByOrderDate === 'asc') el.textContent = '▲';
  else if (sortByOrderDate === 'desc') el.textContent = '▼';
  else el.textContent = '';
}

async function loadItems() {
  try {
    const res = await fetch('/api/items');
    itemCatalog = await res.json();
  } catch (err) {
    console.error('Failed to load items:', err);
  }
}

function setLoadStatus(message, type = 'neutral') {
  const statusEl = document.getElementById('loadStatus');
  const statusText = document.getElementById('loadStatusText');
  const retryBtn = document.getElementById('refreshBtn');
  if (!statusEl || !statusText) return;
  statusText.textContent = message;
  statusEl.classList.remove('neutral', 'loading', 'success', 'error');
  statusEl.classList.add(type);
  if (retryBtn) retryBtn.style.display = type === 'error' ? 'inline-flex' : 'none';
}

// Full-screen action loader overlay (used for save/update/delete)
function showActionLoader(message = 'Working…') {
  const overlay = document.getElementById('actionOverlay');
  const txt = document.getElementById('actionOverlayText');
  if (!overlay) return;
  if (txt) txt.textContent = message;
  overlay.style.display = 'flex';
}

function hideActionLoader() {
  const overlay = document.getElementById('actionOverlay');
  if (!overlay) return;
  overlay.style.display = 'none';
}

// Parse a date in DD/MM/YYYY or ISO and return YYYY-MM-DD or null
function parseAnyDateToISO(d) {
  if (!d) return null;
  if (d.includes('/')) {
    const parts = d.split('/');
    if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
  }
  return (d || '').split('T')[0] || null;
}

// Check for deliveries scheduled for today and show an alert banner
function checkTodaysDeliveries() {
  try {
    const wrap = document.getElementById('deliveryAlertWrap');
    if (!wrap) return;
    // don't show alert again if already dismissed this session
    if (sessionStorage.getItem('deliveryAlertDismissed') === 'true') {
      wrap.innerHTML = '';
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    const todays = allOrders.filter(o => {
      const iso = parseAnyDateToISO(o.deliveryDate || '');
      return iso === today && o.orderStatus !== 'Delivered';
    });
    if (todays.length === 0) {
      wrap.innerHTML = '';
      return;
    }
    const plural = todays.length > 1 ? 'orders' : 'order';
    wrap.innerHTML = `
      <div class="alert" style="background: linear-gradient(90deg, rgba(212,32,39,0.08), rgba(212,32,39,0.04)); border:1px solid rgba(212,32,39,0.12); padding:12px 16px; border-radius:10px; display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div style="display:flex;gap:12px;align-items:center">
          <i class="bi bi-bell-fill" style="color:var(--saffron);font-size:1.1rem"></i>
          <div style="font-weight:600">You have ${todays.length} ${plural} scheduled for delivery today.</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn-add" onclick="showTodaysDeliveries()">Show</button>
          <button class="btn-cancel" onclick="dismissDeliveryAlert()">Dismiss</button>
        </div>
      </div>
    `;
  } catch (e) {
    console.error('checkTodaysDeliveries', e);
  }
}

function showTodaysDeliveries() {
  const today = new Date().toISOString().split('T')[0];
  const filtered = allOrders.filter(o => parseAnyDateToISO(o.deliveryDate || '') === today && o.orderStatus !== 'Delivered');
  if (filtered.length === 0) {
    showToast('No deliveries found for today', 'neutral');
    return;
  }
  // clear other filters/search to avoid accidental masking
  try { document.getElementById('searchInput').value = ''; } catch (e) {}
  try { document.getElementById('filterStatus').value = ''; } catch (e) {}
  try { document.getElementById('filterPayment').value = ''; } catch (e) {}
  currentPage = 1;
  window._filteredOrders = filtered;
  renderOrders(filtered);
  // bring orders table into view for convenience
  try {
    const card = document.querySelector('.orders-card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {}
}

function dismissDeliveryAlert() {
  // wipe out the alert immediately and remember dismissal for this session
  const wrap = document.getElementById('deliveryAlertWrap');
  if (wrap) wrap.innerHTML = '';
  sessionStorage.setItem('deliveryAlertDismissed', 'true');
  // reload all orders quietly (top status bar only, no full-screen loader)
  loadOrders();
}

// ── Stats ────────────────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('statTotal').textContent = allOrders.length;
  document.getElementById('statToday').textContent = getTodayOrders().length;
  document.getElementById('statPending').textContent =
    allOrders.filter(o => o.orderStatus === 'Pending').length;
  document.getElementById('statDelivered').textContent =
    allOrders.filter(o => o.orderStatus === 'Delivered').length;
  document.getElementById('statUnpaid').textContent =
    allOrders.filter(o => o.paymentStatus === 'No').length;
  const revenue = allOrders.reduce((s, o) => s + o.totalAmount, 0);
  document.getElementById('statRevenue').textContent = '$' + revenue.toFixed(2);
}

// ── Card Filters ─────────────────────────────────────────────────────────────
let activeCardFilter = null;

function getTodayOrders() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return allOrders.filter(o => {
    const d = o.deliveryDate || '';
    const normalized = d.includes('/') ? d.split('/').reverse().join('-') : d;
    return normalized === today;
  });
}

function getFilteredByCard(filter) {
  switch (filter) {
    case 'all': return allOrders;
    case 'today': return getTodayOrders();
    case 'pending': return allOrders.filter(o => o.orderStatus === 'Pending');
    case 'delivered': return allOrders.filter(o => o.orderStatus === 'Delivered');
    case 'unpaid': return allOrders.filter(o => o.paymentStatus === 'No');
    default: return allOrders;
  }
}

  // no sorting helpers (sorting by Order Date removed)

function toggleCardFilter(filter) {
  // toggle off if same card clicked again
  if (activeCardFilter === filter) {
    activeCardFilter = null;
  } else {
    activeCardFilter = filter;
  }
  // update active state on cards
  document.querySelectorAll('.stat-card.clickable').forEach(c => c.classList.remove('active'));
  if (activeCardFilter) {
    const card = document.querySelector(`.stat-card[data-filter="${activeCardFilter}"]`);
    if (card) card.classList.add('active');
  }
  // clear toolbar filters
  document.getElementById('searchInput').value = '';
  document.getElementById('filterStatus').value = '';
  document.getElementById('filterPayment').value = '';
  const df = document.getElementById('filterDateFrom');
  const dt = document.getElementById('filterDateTo');
  if (df) df.value = '';
  if (dt) dt.value = '';
  currentPage = 1;
  renderOrders(activeCardFilter ? getFilteredByCard(activeCardFilter) : allOrders);
}

// ── Month Filter Dropdown ────────────────────────────────────────────────────
function populateMonthFilter() {
  // populateMonthFilter is no longer used (replaced by date-range picker)
}

// ── Filter & Render ──────────────────────────────────────────────────────────
function filterOrders() {
  // deactivate card filter when user changes toolbar filters
  activeCardFilter = null;
  document.querySelectorAll('.stat-card.clickable').forEach(c => c.classList.remove('active'));

  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const status = document.getElementById('filterStatus').value;
  const payment = document.getElementById('filterPayment').value;
  const from = document.getElementById('filterDateFrom').value;
  const to = document.getElementById('filterDateTo').value;

  let filtered = allOrders;

  if (q) {
    filtered = filtered.filter(o =>
      String(o.orderId).includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.items.some(i => i.itemName.toLowerCase().includes(q)) ||
      o.deliveryLocation.toLowerCase().includes(q)
    );
  }
  if (status) filtered = filtered.filter(o => o.orderStatus === status);
  if (payment) filtered = filtered.filter(o => o.paymentStatus === payment);
  // Filter by date range if provided. Use orderDate only (parse DD/MM/YYYY or ISO).
  const parseOrderDateISO = (d) => {
    if (!d) return null;
    if (d.includes('/')) {
      const parts = d.split('/');
      if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
    }
    return d.split('T')[0];
  };

  if (from) {
    filtered = filtered.filter(o => {
      const iso = parseOrderDateISO(o.orderDate || '');
      return iso && iso >= from;
    });
  }
  if (to) {
    filtered = filtered.filter(o => {
      const iso = parseOrderDateISO(o.orderDate || '');
      return iso && iso <= to;
    });
  }

  currentPage = 1;
  renderOrders(filtered);
}

// Clear date range filters and reload all orders
async function clearDateFilters() {
  const df = document.getElementById('filterDateFrom');
  const dt = document.getElementById('filterDateTo');
  if (df) df.value = '';
  if (dt) dt.value = '';
  // update Reset button state immediately
  try { document.getElementById('filterDateResetBtn').disabled = true; } catch (e) {}
  // show loading overlay and status while reloading
  try {
    showActionLoader('Loading orders…');
    setLoadStatus('Loading orders…', 'loading');
    await loadOrders();
  } finally {
    hideActionLoader();
    try { document.getElementById('filterDateResetBtn').disabled = true; } catch (e) {}
  }
  showToast('Date filters cleared — showing all orders', 'success');
}

function renderOrders(orders) {
  // apply sorting if requested
  if (sortByOrderDate) {
    orders = orders.slice().sort((a,b) => {
      const da = (a.orderDate || '').split('T')[0];
      const db = (b.orderDate || '').split('T')[0];
      if (!da && !db) return 0;
      if (!da) return sortByOrderDate === 'asc' ? 1 : -1;
      if (!db) return sortByOrderDate === 'asc' ? -1 : 1;
      if (da === db) return 0;
      return (da < db ? -1 : 1) * (sortByOrderDate === 'asc' ? 1 : -1);
    });
  }
  const tbody = document.getElementById('ordersBody');
  const noOrders = document.getElementById('noOrders');
  document.getElementById('orderCount').textContent = orders.length;

  if (orders.length === 0) {
    tbody.innerHTML = '';
    noOrders.style.display = 'block';
    renderPagination(0, 0);
    return;
  }
  noOrders.style.display = 'none';

  const totalPages = Math.ceil(orders.length / PAGE_SIZE);
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageOrders = orders.slice(start, start + PAGE_SIZE);

  // Store filtered orders for pagination re-render
  window._filteredOrders = orders;

  tbody.innerHTML = pageOrders.map(o => {
    const statusBadge = o.orderStatus === 'Delivered'
      ? '<span class="badge-status badge-delivered"><i class="bi bi-circle-fill"></i> Delivered</span>'
      : '<span class="badge-status badge-pending"><i class="bi bi-circle-fill"></i> Pending</span>';

    const payBadge = o.paymentStatus === 'Yes'
      ? '<span class="badge-status badge-paid"><i class="bi bi-circle-fill"></i> Paid</span>'
      : '<span class="badge-status badge-unpaid"><i class="bi bi-circle-fill"></i> Unpaid</span>';

    const itemsList = '<div class="items-cell">' + o.items.map(i =>
      `<span class="item-chip"><i class="bi bi-box-seam item-icon"></i><span class="item-label">${escapeHtml(i.itemName)}</span><span class="qty">×${i.quantity}</span></span>`
    ).join('') + '</div>';

    const initials = o.customerName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

    let deliveryDateHtml = o.deliveryDate ? `<i class="bi bi-calendar-event"></i>${o.deliveryDate}` : '';
    let deliveryLocHtml = o.deliveryLocation ? `<i class="bi bi-geo-alt"></i>${escapeHtml(o.deliveryLocation)}` : '';

    const orderDateDisplay = o.orderDate ? o.orderDate.replace(/[T ].*/,'') : '';

    return `<tr onclick="openDetailModal(${o.orderId})">
      <td data-label="Order Date" style="white-space:nowrap;font-size:.82rem"><i class="bi bi-calendar3" style="color:var(--saffron);margin-right:4px"></i>${orderDateDisplay}</td>
      <td data-label="Customer">
        <div class="customer-cell">
          <div class="customer-avatar">${initials}</div>
          <span class="customer-name">${escapeHtml(o.customerName)}</span>
        </div>
      </td>
      <td data-label="Items">${itemsList}</td>
      <td data-label="Delivery Status">${statusBadge}</td>
      <td data-label="Payment Status">${payBadge}</td>
      <td data-label="Amount" class="amount-cell" style="text-align:right">$${o.totalAmount.toFixed(2)}</td>
    </tr>`;
  }).join('');

  renderPagination(orders.length, totalPages);
}

function renderPagination(totalItems, totalPages) {
  const container = document.getElementById('paginationWrap');
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  const start = (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, totalItems);

  let btns = '';
  btns += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})"><i class="bi bi-chevron-left"></i></button>`;

  const maxVisible = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);

  if (startPage > 1) {
    btns += `<button class="page-btn" onclick="goToPage(1)">1</button>`;
    if (startPage > 2) btns += `<span class="page-dots">...</span>`;
  }
  for (let i = startPage; i <= endPage; i++) {
    btns += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) btns += `<span class="page-dots">...</span>`;
    btns += `<button class="page-btn" onclick="goToPage(${totalPages})">${totalPages}</button>`;
  }

  btns += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})"><i class="bi bi-chevron-right"></i></button>`;

  container.innerHTML = `<span class="page-info">Showing ${start}-${end} of ${totalItems}</span><div class="page-btns">${btns}</div>`;
}

function goToPage(page) {
  currentPage = page;
  renderOrders(window._filteredOrders || allOrders);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// ── Detail Modal ─────────────────────────────────────────────────────────────
function openDetailModal(orderId) {
  const o = allOrders.find(x => x.orderId === orderId);
  if (!o) return;

  document.getElementById('detailTitle').innerHTML = `<i class="bi bi-receipt"></i> Order Details`;

  const statusBadge = o.orderStatus === 'Delivered'
    ? '<span class="badge-status badge-delivered"><i class="bi bi-circle-fill"></i> Delivered</span>'
    : '<span class="badge-status badge-pending"><i class="bi bi-circle-fill"></i> Pending</span>';
  const payBadge = o.paymentStatus === 'Yes'
    ? '<span class="badge-status badge-paid"><i class="bi bi-circle-fill"></i> Paid</span>'
    : '<span class="badge-status badge-unpaid"><i class="bi bi-circle-fill"></i> Unpaid</span>';

  const itemsTable = o.items.map(i => `
    <tr>
      <td style="padding:8px 12px"><i class="bi bi-box-seam" style="color:var(--saffron);margin-right:6px"></i>${escapeHtml(i.itemName)}</td>
      <td style="padding:8px 12px;text-align:center">${i.quantity}</td>
      <td style="padding:8px 12px;text-align:right">$${i.unitPrice.toFixed(2)}</td>
      <td style="padding:8px 12px;text-align:right;font-weight:600">$${i.itemTotal.toFixed(2)}</td>
    </tr>
  `).join('');

  const orderDate = o.orderDate ? o.orderDate.replace(/[T ].*/, '') : '-';

  document.getElementById('detailBody').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;margin-bottom:20px">
      <div><span style="font-size:.75rem;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px">Customer</span><div style="font-weight:600;font-size:.95rem;margin-top:2px">${escapeHtml(o.customerName)}</div></div>
      <div><span style="font-size:.75rem;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px">Month</span><div style="font-weight:500;font-size:.95rem;margin-top:2px">${escapeHtml(o.month || '-')}</div></div>
      <div><span style="font-size:.75rem;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px">Order Date</span><div style="font-weight:500;font-size:.95rem;margin-top:2px"><i class="bi bi-calendar3" style="color:var(--saffron);margin-right:4px"></i>${orderDate}</div></div>
      <div><span style="font-size:.75rem;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px">Delivery Date</span><div style="font-weight:500;font-size:.95rem;margin-top:2px"><i class="bi bi-calendar-event" style="color:var(--saffron);margin-right:4px"></i>${o.deliveryDate || '-'}</div></div>
      <div><span style="font-size:.75rem;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px">Delivery Location</span><div style="font-weight:500;font-size:.95rem;margin-top:2px"><i class="bi bi-geo-alt" style="color:var(--saffron);margin-right:4px"></i>${escapeHtml(o.deliveryLocation || '-')}</div></div>
      <div><span style="font-size:.75rem;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px">Delivery Status</span><div style="margin-top:4px">${statusBadge}</div></div>
      <div><span style="font-size:.75rem;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px">Payment Status</span><div style="margin-top:4px">${payBadge}</div></div>
    </div>
    <div style="border-top:1px solid var(--gray-200);padding-top:16px">
      <h6 style="font-weight:600;margin-bottom:10px"><i class="bi bi-basket-fill" style="color:var(--saffron)"></i> Items</h6>
      <table style="width:100%;border-collapse:collapse;font-size:.88rem">
        <thead><tr style="background:var(--gray-50);border-bottom:2px solid var(--gray-200)">
          <th style="padding:8px 12px;font-size:.72rem;font-weight:600;text-transform:uppercase;color:var(--gray-500)">Item</th>
          <th style="padding:8px 12px;font-size:.72rem;font-weight:600;text-transform:uppercase;color:var(--gray-500);text-align:center">Qty</th>
          <th style="padding:8px 12px;font-size:.72rem;font-weight:600;text-transform:uppercase;color:var(--gray-500);text-align:right">Price</th>
          <th style="padding:8px 12px;font-size:.72rem;font-weight:600;text-transform:uppercase;color:var(--gray-500);text-align:right">Subtotal</th>
        </tr></thead>
        <tbody>${itemsTable}</tbody>
        <tfoot><tr style="border-top:2px solid var(--gray-200)">
          <td colspan="3" style="padding:10px 12px;font-weight:700;text-align:right">Total</td>
          <td style="padding:10px 12px;font-weight:700;text-align:right;color:var(--saffron);font-size:1rem">$${o.totalAmount.toFixed(2)}</td>
        </tr></tfoot>
      </table>
    </div>
  `;

  document.getElementById('detailEditBtn').onclick = () => {
    bootstrap.Modal.getInstance(document.getElementById('detailModal')).hide();
    openEditModal(orderId);
  };
  document.getElementById('detailDeleteBtn').onclick = () => {
    bootstrap.Modal.getInstance(document.getElementById('detailModal')).hide();
    openDeleteModal(orderId);
  };

  new bootstrap.Modal(document.getElementById('detailModal')).show();
}

// ── New Order Modal ──────────────────────────────────────────────────────────
function openNewOrderModal() {
  document.getElementById('modalTitle').innerHTML = '<i class="bi bi-plus-circle"></i> New Order';
  document.getElementById('editOrderId').value = '';
  document.getElementById('orderForm').reset();

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  document.getElementById('fOrderDate').value = `${now.getFullYear()}-${mm}-${dd}`;

  const monthNames = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  document.getElementById('fStatus').value = 'Pending';
  document.getElementById('fPayment').value = 'No';

  document.getElementById('itemsContainer').innerHTML = '';
  addItemRow();

  updateOrderTotal();
  new bootstrap.Modal(document.getElementById('orderModal')).show();
}

// ── Edit Order Modal ─────────────────────────────────────────────────────────
function openEditModal(orderId) {
  const order = allOrders.find(o => o.orderId === orderId);
  if (!order) return;

  document.getElementById('modalTitle').innerHTML = `<i class="bi bi-pencil-square"></i> Edit Order #${orderId}`;
  document.getElementById('editOrderId').value = orderId;
  // support multiple stored formats: DD/MM/YYYY or ISO YYYY-MM-DD[THH:MM:SS]
  const rawOrderDate = order.orderDate || '';
  let orderDateValue = '';
  if (rawOrderDate.includes('/')) {
    const parts = rawOrderDate.split('/');
    if (parts.length === 3) orderDateValue = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
  } else if (rawOrderDate.includes('-')) {
    orderDateValue = rawOrderDate.split('T')[0];
  }
  document.getElementById('fOrderDate').value = orderDateValue;
  document.getElementById('fCustomer').value = order.customerName || '';
  document.getElementById('fStatus').value = order.orderStatus || 'Pending';
  document.getElementById('fPayment').value = order.paymentStatus || 'No';
  // Convert DD/MM/YYYY to YYYY-MM-DD for date input
  const rawDeliveryDate = order.deliveryDate || '';
  let deliveryDateValue = '';
  if (rawDeliveryDate.includes('/')) {
    const dparts = rawDeliveryDate.split('/');
    if (dparts.length === 3) deliveryDateValue = `${dparts[2]}-${dparts[1].padStart(2,'0')}-${dparts[0].padStart(2,'0')}`;
  } else if (rawDeliveryDate.includes('-')) {
    deliveryDateValue = rawDeliveryDate.split('T')[0];
  }
  document.getElementById('fDeliveryDate').value = deliveryDateValue;
  document.getElementById('fDeliveryLoc').value = order.deliveryLocation || '';

  const container = document.getElementById('itemsContainer');
  container.innerHTML = '';
  order.items.forEach(item => addItemRow(item));

  updateOrderTotal();
  new bootstrap.Modal(document.getElementById('orderModal')).show();
}

// ── Item Rows ────────────────────────────────────────────────────────────────
function addItemRow(item = null) {
  const container = document.getElementById('itemsContainer');

  const div = document.createElement('div');
  div.className = 'item-row';
  div.innerHTML = `
    <div>
      <label>Item Name</label>
      <select class="item-name" required onchange="autoFillPrice(this)">
        <option value="">Select item...</option>
        ${Object.keys(ITEM_PRICES).map(name => `<option value="${escapeHtml(name)}" ${item && item.itemName === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}
      </select>
    </div>
    <div>
      <label>Qty</label>
      <input type="number" class="item-qty" min="1" value="${item ? item.quantity : 1}"
        oninput="updateOrderTotal()">
    </div>
    <div>
      <label>Price ($)</label>
      <input type="number" class="item-price" step="0.01" min="0"
        value="${item ? item.unitPrice : ''}" placeholder="0.00" oninput="updateOrderTotal()">
    </div>
    <div>
      <label>Subtotal</label>
      <div class="item-subtotal">$0.00</div>
    </div>
    <button type="button" class="btn-remove-item" onclick="removeItemRow(this)" title="Remove">
      <i class="bi bi-x-lg"></i>
    </button>
  `;

  container.appendChild(div);
  updateOrderTotal();

  // UX improvements: autofocus new row and handle Enter to add a new row
  const selectEl = div.querySelector('.item-name');
  const qtyEl = div.querySelector('.item-qty');
  const priceEl = div.querySelector('.item-price');

  // focus the item select for quick input
  if (selectEl) {
    setTimeout(() => { try { selectEl.focus(); } catch (e) {} }, 50);
  }

  const handleEnterAdd = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const container = document.getElementById('itemsContainer');
      // if this is the last row, add a new one
      if (div === container.lastElementChild) {
        addItemRow();
      } else {
        // otherwise focus the next row's item select
        const next = div.nextElementSibling;
        if (next) {
          const nextSelect = next.querySelector('.item-name');
          if (nextSelect) nextSelect.focus();
        }
      }
    }
  };

  [selectEl, qtyEl, priceEl].forEach(el => {
    if (!el) return;
    el.addEventListener('keydown', handleEnterAdd);
  });
}

function removeItemRow(btn) {
  const container = document.getElementById('itemsContainer');
  if (container.children.length <= 1) return;
  const row = btn.closest('.item-row');
  const prev = row.previousElementSibling;
  row.remove();
  updateOrderTotal();
  // focus previous row's item select for smoother workflow
  if (prev) {
    const sel = prev.querySelector('.item-name');
    if (sel) sel.focus();
  }
}

function autoFillPrice(input) {
  const name = input.value.trim();
  const price = ITEM_PRICES[name];
  if (price !== undefined) {
    const row = input.closest('.item-row');
    row.querySelector('.item-price').value = price;
    updateOrderTotal();
  }
}

function updateOrderTotal() {
  let total = 0;
  document.querySelectorAll('#itemsContainer .item-row').forEach(row => {
    const qty = Number(row.querySelector('.item-qty').value) || 0;
    const price = Number(row.querySelector('.item-price').value) || 0;
    const sub = Math.round(qty * price * 100) / 100;
    row.querySelector('.item-subtotal').textContent = '$' + sub.toFixed(2);
    total += sub;
  });
  document.getElementById('orderTotal').textContent = total.toFixed(2);
}

// ── Save Order ───────────────────────────────────────────────────────────────
async function saveOrder() {
  const form = document.getElementById('orderForm');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const items = [];
  let valid = true;
  document.querySelectorAll('#itemsContainer .item-row').forEach(row => {
    const name = row.querySelector('.item-name').value.trim();
    const qty = Number(row.querySelector('.item-qty').value);
    const price = Number(row.querySelector('.item-price').value);
    if (!name || qty <= 0 || price <= 0) valid = false;
    items.push({ itemName: name, quantity: qty, unitPrice: price });
  });

  if (!valid || items.length === 0) {
    showToast('Please fill all item fields correctly.', 'danger');
    return;
  }

  const order = {
    orderDate: (() => { const v = document.getElementById('fOrderDate').value; return v ? v.split('-').reverse().join('/') : ''; })(),
    customerName: document.getElementById('fCustomer').value.trim(),
    orderStatus: document.getElementById('fStatus').value,
    paymentStatus: document.getElementById('fPayment').value,
    deliveryDate: (() => { const v = document.getElementById('fDeliveryDate').value; return v ? v.split('-').reverse().join('/') : ''; })(),
    deliveryLocation: document.getElementById('fDeliveryLoc').value.trim(),
    referredBy: '',
    items
  };

  const editId = document.getElementById('editOrderId').value;
  const saveBtn = document.querySelector('.btn-save');
  const originalSaveHtml = saveBtn ? saveBtn.innerHTML : null;
  try {
    // show full-screen loader and disable save button
    showActionLoader(editId ? 'Saving changes…' : 'Saving order…');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Saving...';
    }

    let res;
    if (editId) {
      res = await fetch(`/api/orders/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });
    } else {
      res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to save');
    }

    bootstrap.Modal.getInstance(document.getElementById('orderModal')).hide();
    showToast(editId ? 'Order updated successfully!' : 'New order created!', 'success');
    await loadOrders();
    await loadItems();
  } catch (err) {
    showToast(err.message || 'Error saving order. Please try again.', 'danger');
  } finally {
    hideActionLoader();
    if (saveBtn) {
      saveBtn.disabled = false;
      if (originalSaveHtml) saveBtn.innerHTML = originalSaveHtml;
    }
  }
}

// ── Delete ───────────────────────────────────────────────────────────────────
function openDeleteModal(orderId) {
  deleteTargetId = orderId;
  document.getElementById('deleteOrderId').textContent = orderId;
  new bootstrap.Modal(document.getElementById('deleteModal')).show();
}

async function confirmDelete() {
  if (!deleteTargetId) return;
  const delBtn = document.querySelector('.btn-delete-confirm');
  const originalDelHtml = delBtn ? delBtn.innerHTML : null;
  try {
    showActionLoader('Deleting order…');
    if (delBtn) {
      delBtn.disabled = true;
      delBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Deleting...';
    }

    const res = await fetch(`/api/orders/${deleteTargetId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed');
    bootstrap.Modal.getInstance(document.getElementById('deleteModal')).hide();
    showToast('Order deleted successfully.', 'success');
    deleteTargetId = null;
    await loadOrders();
  } catch (err) {
    showToast('Error deleting order.', 'danger');
  } finally {
    hideActionLoader();
    if (delBtn) {
      delBtn.disabled = false;
      if (originalDelHtml) delBtn.innerHTML = originalDelHtml;
    }
  }
}

// ── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.className = `toast custom-toast align-items-center text-bg-${type}`;
  document.getElementById('toastMsg').textContent = msg;
  bootstrap.Toast.getOrCreateInstance(toast).show();
}
