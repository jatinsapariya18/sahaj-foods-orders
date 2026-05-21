// ── State ────────────────────────────────────────────────────────────────────
let allOrders = [];
let itemCatalog = [];
let deleteTargetId = null;
let currentPage = 1;
const PAGE_SIZE = 10;

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

  // Auto-set month
  const monthNames = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  document.getElementById('fMonth').value = monthNames[now.getMonth()];
});

// ── API Calls ────────────────────────────────────────────────────────────────
async function loadOrders() {
  try {
    const res = await fetch('/api/orders');
    allOrders = await res.json();
    updateStats();
    populateMonthFilter();
    filterOrders();
  } catch (err) {
    console.error('Failed to load orders:', err);
  }
}

async function loadItems() {
  try {
    const res = await fetch('/api/items');
    itemCatalog = await res.json();
  } catch (err) {
    console.error('Failed to load items:', err);
  }
}

// ── Stats ────────────────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('statTotal').textContent = allOrders.length;
  document.getElementById('statToday').textContent = getTodayOrders().length;
  document.getElementById('statPending').textContent =
    allOrders.filter(o => o.orderStatus === 'Pending').length;
  document.getElementById('statDelivered').textContent =
    allOrders.filter(o => o.orderStatus === 'Delivered').length;
  const revenue = allOrders.reduce((s, o) => s + o.totalAmount, 0);
  document.getElementById('statRevenue').textContent = '$' + revenue.toFixed(2);
}

// ── Today's Orders ───────────────────────────────────────────────────────────
let todayFilterActive = false;

function getTodayOrders() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return allOrders.filter(o => {
    const d = o.orderDate || '';
    // handle both YYYY-MM-DD and DD/MM/YYYY
    const normalized = d.includes('/') ? d.split('/').reverse().join('-') : d;
    return normalized === today;
  });
}

function toggleTodayFilter() {
  todayFilterActive = !todayFilterActive;
  const card = document.getElementById('todayCard');
  card.classList.toggle('active', todayFilterActive);
  // clear other filters
  document.getElementById('searchInput').value = '';
  document.getElementById('filterStatus').value = '';
  document.getElementById('filterPayment').value = '';
  document.getElementById('filterMonth').value = '';
  currentPage = 1;
  if (todayFilterActive) {
    renderOrders(getTodayOrders());
  } else {
    renderOrders(allOrders);
  }
}

// ── Month Filter Dropdown ────────────────────────────────────────────────────
function populateMonthFilter() {
  const sel = document.getElementById('filterMonth');
  const months = [...new Set(allOrders.map(o => o.month).filter(Boolean))];
  while (sel.options.length > 1) sel.remove(1);
  months.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    sel.appendChild(opt);
  });
}

// ── Filter & Render ──────────────────────────────────────────────────────────
function filterOrders() {
  // deactivate today shortcut when user changes filters
  todayFilterActive = false;
  document.getElementById('todayCard').classList.remove('active');

  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const status = document.getElementById('filterStatus').value;
  const payment = document.getElementById('filterPayment').value;
  const month = document.getElementById('filterMonth').value;

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
  if (month) filtered = filtered.filter(o => o.month === month);

  currentPage = 1;
  renderOrders(filtered);
}

function renderOrders(orders) {
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
      <td><strong style="color:var(--saffron)">#${o.orderId}</strong></td>
      <td style="white-space:nowrap;font-size:.82rem"><i class="bi bi-calendar3" style="color:var(--saffron);margin-right:4px"></i>${orderDateDisplay}</td>
      <td>
        <div class="customer-cell">
          <div class="customer-avatar">${initials}</div>
          <span class="customer-name">${escapeHtml(o.customerName)}</span>
        </div>
      </td>
      <td>${itemsList}</td>
      <td>${statusBadge}</td>
      <td>${payBadge}</td>
      <td class="amount-cell" style="text-align:right">$${o.totalAmount.toFixed(2)}</td>
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

  document.getElementById('detailTitle').innerHTML = `<i class="bi bi-receipt"></i> Order #${o.orderId}`;

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
  document.getElementById('fMonth').value = monthNames[now.getMonth()];
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
  document.getElementById('fMonth').value = order.month || '';
  const ordParts = (order.orderDate || '').split('/');
  document.getElementById('fOrderDate').value = ordParts.length === 3 ? `${ordParts[2]}-${ordParts[1]}-${ordParts[0]}` : '';
  document.getElementById('fCustomer').value = order.customerName || '';
  document.getElementById('fStatus').value = order.orderStatus || 'Pending';
  document.getElementById('fPayment').value = order.paymentStatus || 'No';
  // Convert DD/MM/YYYY to YYYY-MM-DD for date input
  const delParts = (order.deliveryDate || '').split('/');
  document.getElementById('fDeliveryDate').value = delParts.length === 3 ? `${delParts[2]}-${delParts[1]}-${delParts[0]}` : '';
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
}

function removeItemRow(btn) {
  const container = document.getElementById('itemsContainer');
  if (container.children.length <= 1) return;
  btn.closest('.item-row').remove();
  updateOrderTotal();
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
    month: document.getElementById('fMonth').value,
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

  try {
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
  try {
    const res = await fetch(`/api/orders/${deleteTargetId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed');
    bootstrap.Modal.getInstance(document.getElementById('deleteModal')).hide();
    showToast('Order deleted successfully.', 'success');
    deleteTargetId = null;
    await loadOrders();
  } catch (err) {
    showToast('Error deleting order.', 'danger');
  }
}

// ── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.className = `toast custom-toast align-items-center text-bg-${type}`;
  document.getElementById('toastMsg').textContent = msg;
  bootstrap.Toast.getOrCreateInstance(toast).show();
}
