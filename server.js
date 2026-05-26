const express = require('express');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Config ──────────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, 'config.json');
const EXCEL_PATH = path.join(__dirname, 'data', 'Sahaj Foods Orders Sheet.xlsx');

let APPS_SCRIPT_URL = '';
let allowInsecureAppsScript = false;
try {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  APPS_SCRIPT_URL = config.appsScriptUrl || '';
  allowInsecureAppsScript = !!config.allowInsecureAppsScript;
} catch (e) { /* no config file */ }

const useGoogleSheets = !!APPS_SCRIPT_URL;
console.log(useGoogleSheets
  ? `Mode: Google Sheets (via Apps Script)`
  : `Mode: Local Excel (set appsScriptUrl in config.json to switch to Google Sheets)`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ═══════════════════════════════════════════════════════════════════════════
// GOOGLE SHEETS DATA LAYER (via Apps Script)
// ═══════════════════════════════════════════════════════════════════════════

async function callAppsScript(method = 'GET', payload = null) {
  const doFetch = async () => {
    if (method === 'GET') {
      const response = await fetch(APPS_SCRIPT_URL, { redirect: 'follow' });
      return response.json();
    }
    // POST to Apps Script - redirect:follow works for POST
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('Apps Script response:', text.substring(0, 500));
      throw new Error('Invalid response from Apps Script');
    }
  };

  try {
    return await doFetch();
  } catch (err) {
    // If TLS/self-signed cert error and user allowed insecure fallback, retry with relaxed TLS
    const causeCode = err && err.cause && err.cause.code;
    if (allowInsecureAppsScript && (causeCode === 'SELF_SIGNED_CERT_IN_CHAIN' || causeCode === 'DEPTH_ZERO_SELF_SIGNED_CERT')) {
      return new Promise((resolve, reject) => {
        const maxRedirects = 5;
        const doRequest = (currentUrl, redirectCount) => {
          if (redirectCount > maxRedirects) return reject(new Error('Too many redirects'));
          try {
            const u = new URL(currentUrl);
            const isPost = method !== 'GET' && redirectCount === 0; // only send body on first request
            const data = isPost ? JSON.stringify(payload) : null;
            const options = {
              hostname: u.hostname,
              port: u.port || (u.protocol === 'https:' ? 443 : 80),
              path: u.pathname + u.search,
              method: isPost ? 'POST' : 'GET',
              headers: isPost ? { 'Content-Type': 'text/plain;charset=utf-8', 'Content-Length': Buffer.byteLength(data) } : {},
              agent: new https.Agent({ rejectUnauthorized: false })
            };

            const req = https.request(options, res => {
              // Follow redirects (3xx)
              if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                // follow Location header
                const loc = res.headers.location;
                // If location is relative, resolve against currentUrl
                const nextUrl = loc.startsWith('http') ? loc : new URL(loc, currentUrl).toString();
                return doRequest(nextUrl, redirectCount + 1);
              }

              let body = '';
              res.setEncoding('utf8');
              res.on('data', chunk => body += chunk);
              res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (e) { console.error('Apps Script response:', body.substring(0, 500)); reject(new Error('Invalid response from Apps Script')); }
              });
            });

            req.on('error', e => reject(e));
            if (isPost && data) req.write(data);
            req.end();
          } catch (e) { reject(e); }
        };
        doRequest(APPS_SCRIPT_URL, 0);
      });
    }
    throw err;
  }
}

function parseRowsToOrders(rows) {
  const orders = [];
  let currentOrder = null;
  let currentMonth = '';
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const monthVal = row[0];
    const orderId = row[1];
    const orderDate = row[2];
    const customerName = row[3];
    const itemName = row[4];
    const quantity = row[5];
    const unitPrice = row[6];
    const orderStatus = row[7];
    const paymentStatus = row[8];
    const deliveryDate = row[11];
    const deliveryLocation = row[12];
    const referredBy = row[13];
    const paymentMode = row[14];
    const applyHst = row[15];

    if (monthVal && !orderId && !itemName) {
      currentMonth = String(monthVal).trim();
      continue;
    }
    if (monthVal && orderId) {
      currentMonth = String(monthVal).trim();
    }

    const cleanItem = itemName ? String(itemName).replace(/\n/g, '').trim() : '';
    if (!cleanItem) continue;

    const toISODate = (d) => {
      if (!d) return '';
      if (d instanceof Date) return d.toISOString().slice(0, 10);
      const s = String(d).trim();
      // already ISO-like
      const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
      // dd/mm/yyyy -> convert
      const dm = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (dm) return `${dm[3]}-${dm[2]}-${dm[1]}`;
      // try to parse generic date string
      const ts = Date.parse(s);
      if (!isNaN(ts)) return new Date(ts).toISOString().slice(0, 10);
      return s;
    };

    const qty = Number(quantity) || 0;
    const price = Number(unitPrice) || 0;
    const itemTotal = Math.round(qty * price * 100) / 100;

    if (orderId && currentOrder && Number(orderId) === currentOrder.orderId) {
      currentOrder.items.push({ itemName: cleanItem, quantity: qty, unitPrice: price, itemTotal });
    } else if (orderId) {
      currentOrder = {
        orderId: Number(orderId),
        month: currentMonth,
        orderDate: toISODate(orderDate),
        customerName: customerName ? String(customerName).trim() : '',
        orderStatus: orderStatus ? String(orderStatus).trim() : '',
        paymentStatus: paymentStatus ? String(paymentStatus).trim() : '',
        applyHst: String(applyHst || '').trim().toLowerCase() === 'yes' ? 'Yes' : 'No',
        paymentMode: paymentMode ? String(paymentMode).trim() : '',
        deliveryDate: toISODate(deliveryDate),
        deliveryLocation: deliveryLocation ? String(deliveryLocation).trim() : '',
        referredBy: referredBy ? String(referredBy).trim() : '',
        items: [],
        totalAmount: 0
      };
      currentOrder.items.push({ itemName: cleanItem, quantity: qty, unitPrice: price, itemTotal });
      orders.push(currentOrder);
    } else if (currentOrder) {
      currentOrder.items.push({ itemName: cleanItem, quantity: qty, unitPrice: price, itemTotal });
    }
  }

  orders.forEach(o => {
    o.totalAmount = Math.round(o.items.reduce((sum, i) => sum + i.itemTotal, 0) * 100) / 100;
  });
  return orders;
}

function ordersToRows(orders) {
  const rows = [];
  const monthGroups = {};
  orders.forEach(o => {
    const m = o.month || 'Other';
    if (!monthGroups[m]) monthGroups[m] = [];
    monthGroups[m].push(o);
  });

  const formatDateOut = (d) => {
    if (!d) return '';
    if (d instanceof Date) return d.toISOString().slice(0,10);
    const s = String(d).trim();
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    const dm = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dm) return `${dm[3]}-${dm[2]}-${dm[1]}`;
    const ts = Date.parse(s);
    if (!isNaN(ts)) return new Date(ts).toISOString().slice(0,10);
    return s;
  };

  for (const [month, monthOrders] of Object.entries(monthGroups)) {
    rows.push([month, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    monthOrders.forEach(order => {
      order.items.forEach((item, idx) => {
        const itemTotal = Math.round(item.quantity * item.unitPrice * 100) / 100;
        if (idx === 0) {
          rows.push([
            '', order.orderId, formatDateOut(order.orderDate), order.customerName,
            item.itemName, item.quantity, item.unitPrice,
            order.orderStatus, order.paymentStatus,
            itemTotal, order.totalAmount, order.deliveryDate, order.deliveryLocation,
            order.referredBy, order.paymentMode || '', order.applyHst || 'No'
          ]);
        } else {
          rows.push([
            '', order.orderId, '', '', item.itemName, item.quantity, item.unitPrice,
            '', '', itemTotal, '', '', '', '', '', ''
          ]);
        }
      });
    });
  }
  return rows;
}

async function readOrdersFromSheets() {
  const result = await callAppsScript('GET');
  if (result.error) throw new Error(result.error);
  return parseRowsToOrders(result.data || []);
}

async function writeOrdersToSheets(orders) {
  const rows = ordersToRows(orders);
  const result = await callAppsScript('POST', { action: 'write', rows });
  if (result.error) throw new Error(result.error);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXCEL DATA LAYER (local fallback)
// ═══════════════════════════════════════════════════════════════════════════

async function readOrdersFromExcel() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_PATH);
  const ws = workbook.getWorksheet('Orders');

  const orders = [];
  let currentOrder = null;
  let currentMonth = '';

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const monthVal = row.getCell(1).value;
    const orderId = row.getCell(2).value;
    const orderDate = row.getCell(3).value;
    const customerName = row.getCell(4).value;
    const itemName = row.getCell(5).value;
    const quantity = row.getCell(6).value;
    const unitPrice = row.getCell(7).value;
    const orderStatus = row.getCell(8).value;
    const paymentStatus = row.getCell(9).value;
    const deliveryDate = row.getCell(12).value;
    const deliveryLocation = row.getCell(13).value;
    const referredBy = row.getCell(14).value;
    const paymentMode = row.getCell(15).value;
    const applyHst = row.getCell(16).value;

    if (monthVal && !orderId && !itemName) { currentMonth = String(monthVal).trim(); return; }
    if (monthVal && orderId) { currentMonth = String(monthVal).trim(); }

    const cleanItem = itemName ? String(itemName).replace(/\n/g, '').trim() : '';
    if (!cleanItem) return;

    const toISODate = (d) => {
      if (!d) return '';
      if (d instanceof Date) return d.toISOString().slice(0, 10);
      const s = String(d).trim();
      const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
      const dm = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (dm) return `${dm[3]}-${dm[2]}-${dm[1]}`;
      const ts = Date.parse(s);
      if (!isNaN(ts)) return new Date(ts).toISOString().slice(0, 10);
      return s;
    };

    const qty = Number(quantity) || 0;
    const price = Number(unitPrice) || 0;
    const itemTotal = Math.round(qty * price * 100) / 100;

    if (orderId && currentOrder && Number(orderId) === currentOrder.orderId) {
      currentOrder.items.push({ itemName: cleanItem, quantity: qty, unitPrice: price, itemTotal });
    } else if (orderId) {
      currentOrder = {
        orderId: Number(orderId), month: currentMonth,
        orderDate: toISODate(orderDate),
        customerName: customerName ? String(customerName).trim() : '',
        orderStatus: orderStatus ? String(orderStatus).trim() : '',
        paymentStatus: paymentStatus ? String(paymentStatus).trim() : '',
        applyHst: String(applyHst || '').trim().toLowerCase() === 'yes' ? 'Yes' : 'No',
        paymentMode: paymentMode ? String(paymentMode).trim() : '',
        deliveryDate: toISODate(deliveryDate),
        deliveryLocation: deliveryLocation ? String(deliveryLocation).trim() : '',
        referredBy: referredBy ? String(referredBy).trim() : '',
        items: [], totalAmount: 0
      };
      currentOrder.items.push({ itemName: cleanItem, quantity: qty, unitPrice: price, itemTotal });
      orders.push(currentOrder);
    } else if (currentOrder) {
      currentOrder.items.push({ itemName: cleanItem, quantity: qty, unitPrice: price, itemTotal });
    }
  });

  orders.forEach(o => {
    o.totalAmount = Math.round(o.items.reduce((sum, i) => sum + i.itemTotal, 0) * 100) / 100;
  });
  return orders;
}

async function writeOrdersToExcel(orders) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Orders');

  const headers = [
    'Month', 'Order Id', 'Order Date', 'Customer Name', 'Item Name',
    'Quantity', 'Unit Price', 'Order Status', 'Payment Status',
    'Item total Amount ', 'Total Order Amount', 'Delivery Date', 'Delivery Location',
    'Referred By', 'Payment Mode', 'Apply HST'
  ];
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center' };
  });
  ws.columns = [
    { width: 10 }, { width: 10 }, { width: 14 }, { width: 22 }, { width: 18 },
    { width: 10 }, { width: 12 }, { width: 14 }, { width: 14 },
    { width: 16 }, { width: 18 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 12 }, { width: 10 }
  ];

  const monthGroups = {};
  orders.forEach(o => {
    const m = o.month || 'Other';
    if (!monthGroups[m]) monthGroups[m] = [];
    monthGroups[m].push(o);
  });

  for (const [month, monthOrders] of Object.entries(monthGroups)) {
    const monthRow = ws.addRow([month]);
    monthRow.font = { bold: true, size: 12 };
    monthOrders.forEach(order => {
      order.items.forEach((item, idx) => {
        const itemTotal = Math.round(item.quantity * item.unitPrice * 100) / 100;
        if (idx === 0) {
          const fmt = (d) => {
            if (!d) return '';
            if (d instanceof Date) return d.toISOString().slice(0,10);
            const s = String(d).trim();
            const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
            const dm = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (dm) return `${dm[3]}-${dm[2]}-${dm[1]}`;
            const ts = Date.parse(s);
            if (!isNaN(ts)) return new Date(ts).toISOString().slice(0,10);
            return s;
          };
          ws.addRow([null, order.orderId, fmt(order.orderDate), order.customerName,
            item.itemName, item.quantity, item.unitPrice, order.orderStatus,
            order.paymentStatus, itemTotal, order.totalAmount,
            fmt(order.deliveryDate), order.deliveryLocation, order.referredBy, order.paymentMode || '', order.applyHst || 'No']);
        } else {
          ws.addRow([null, order.orderId, null, null, item.itemName, item.quantity,
            item.unitPrice, null, null, itemTotal, null, null, null, null, null, null]);
        }
      });
    });
  }
  await workbook.xlsx.writeFile(EXCEL_PATH);
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED DATA ACCESS
// ═══════════════════════════════════════════════════════════════════════════

async function readOrders() {
  return useGoogleSheets ? readOrdersFromSheets() : readOrdersFromExcel();
}

async function writeOrders(orders) {
  return useGoogleSheets ? writeOrdersToSheets(orders) : writeOrdersToExcel(orders);
}

function getNextOrderId(orders) {
  if (orders.length === 0) return 1;
  return Math.max(...orders.map(o => o.orderId)) + 1;
}

function getCurrentMonthName() {
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return monthNames[new Date().getMonth()];
}

// ═══════════════════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/orders', async (req, res) => {
  try {
    const orders = await readOrders();
    res.json(orders);
  } catch (err) {
    console.error('Error reading orders:', err);
    res.status(500).json({ error: 'Failed to read orders' });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const orders = await readOrders();
    const order = orders.find(o => o.orderId === Number(req.params.id));
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read order' });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const orders = await readOrders();
    const newOrder = req.body;
    newOrder.orderId = getNextOrderId(orders);
    // Default month to current month when not provided by client
    if (!newOrder.month || !String(newOrder.month).trim()) {
      newOrder.month = getCurrentMonthName();
    }
    newOrder.items = (newOrder.items || []).map(item => ({
      itemName: String(item.itemName || '').trim(),
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      itemTotal: Math.round((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) * 100) / 100
    }));
    newOrder.applyHst = String(newOrder.applyHst || 'No').trim() === 'Yes' ? 'Yes' : 'No';
    newOrder.totalAmount = Math.round(newOrder.items.reduce((s, i) => s + i.itemTotal, 0) * 100) / 100;
    orders.push(newOrder);
    await writeOrders(orders);
    res.status(201).json(newOrder);
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: err.message || 'Failed to create order' });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    const orders = await readOrders();
    const idx = orders.findIndex(o => o.orderId === Number(req.params.id));
    if (idx === -1) return res.status(404).json({ error: 'Order not found' });
    const updated = req.body;
    updated.orderId = Number(req.params.id);
    // Preserve existing month if client did not send one
    if (!updated.month || !String(updated.month).trim()) {
      updated.month = orders[idx].month || getCurrentMonthName();
    }
    updated.items = (updated.items || []).map(item => ({
      itemName: String(item.itemName || '').trim(),
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      itemTotal: Math.round((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) * 100) / 100
    }));
    updated.applyHst = String(updated.applyHst || 'No').trim() === 'Yes' ? 'Yes' : 'No';
    updated.totalAmount = Math.round(updated.items.reduce((s, i) => s + i.itemTotal, 0) * 100) / 100;
    orders[idx] = updated;
    await writeOrders(orders);
    res.json(updated);
  } catch (err) {
    console.error('Error updating order:', err);
    res.status(500).json({ error: err.message || 'Failed to update order' });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    const orders = await readOrders();
    const idx = orders.findIndex(o => o.orderId === Number(req.params.id));
    if (idx === -1) return res.status(404).json({ error: 'Order not found' });
    orders.splice(idx, 1);
    await writeOrders(orders);
    res.json({ message: 'Order deleted' });
  } catch (err) {
    console.error('Error deleting order:', err);
    res.status(500).json({ error: err.message || 'Failed to delete order' });
  }
});

app.get('/api/items', async (req, res) => {
  try {
    const orders = await readOrders();
    const itemMap = {};
    orders.forEach(o => {
      o.items.forEach(i => { itemMap[i.itemName] = i.unitPrice; });
    });
    res.json(Object.entries(itemMap).map(([name, price]) => ({ name, price })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to read items' });
  }
});

// ── Status endpoint ─────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({ mode: useGoogleSheets ? 'google-sheets' : 'excel', configured: useGoogleSheets });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sahaj Foods Order Tracker running at http://localhost:${PORT}`);
});
