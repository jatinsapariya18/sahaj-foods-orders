// ============================================================
// GOOGLE APPS SCRIPT - Paste this into your Google Sheet
// ============================================================
// Steps:
//   1. Open your Google Sheet
//   2. Go to Extensions > Apps Script
//   3. Delete any existing code
//   4. Paste ALL of this code
//   5. Click Deploy > New deployment
//   6. Type: Web app
//   7. Execute as: Me
//   8. Who has access: Anyone
//   9. Click Deploy
//  10. Copy the Web App URL
//  11. Paste it into config.json in your project
// ============================================================

const SHEET_NAME = 'Orders';
const HEADERS = [
  'Month', 'Order Id', 'Order Date', 'Customer Name', 'Item Name',
  'Quantity', 'Unit Price', 'Order Status', 'Payment Status',
  'Item total Amount', 'Total Order Amount', 'Delivery Date', 'Delivery Location',
  'Referred By', 'Payment Mode'
];

function ensureHeaders(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) {
    // No headers at all — write them
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    return;
  }
  const existing = sheet.getRange(1, 1, 1, Math.max(lastCol, HEADERS.length)).getValues()[0];
  let changed = false;
  for (let i = 0; i < HEADERS.length; i++) {
    if (!existing[i] || String(existing[i]).trim() === '') {
      existing[i] = HEADERS[i];
      changed = true;
    }
  }
  if (changed) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([existing]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
}

function doGet(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    ensureHeaders(sheet);
    const lastRow = sheet.getLastRow();

    if (lastRow < 1) {
      return jsonResponse({ data: [] });
    }

    const data = sheet.getRange(1, 1, lastRow, 14).getValues();

    // Convert Date objects to DD/MM/YYYY strings
    for (let i = 0; i < data.length; i++) {
      for (let j = 0; j < data[i].length; j++) {
        if (data[i][j] instanceof Date) {
          data[i][j] = Utilities.formatDate(
            data[i][j],
            Session.getScriptTimeZone(),
            'dd/MM/yyyy'
          );
        }
      }
    }

    return jsonResponse({ data: data });
  } catch (err) {
    return jsonResponse({ error: err.toString() });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    ensureHeaders(sheet);

    if (payload.action === 'write') {
      const lastRow = sheet.getLastRow();

      // Clear everything below the header row
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, 14).clearContent();
      }

      // Write the new rows
      if (payload.rows && payload.rows.length > 0) {
        sheet.getRange(2, 1, payload.rows.length, 14).setValues(payload.rows);
      }

      SpreadsheetApp.flush();
      return jsonResponse({ success: true, rowsWritten: payload.rows ? payload.rows.length : 0 });
    }

    return jsonResponse({ error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.toString() });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
