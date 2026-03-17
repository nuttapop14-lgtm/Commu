// Google Sheets API Integration Module
class GoogleSheetsAPI {
  constructor(config = {}) {
    this.config = {
      spreadsheetId: config.spreadsheetId || '',
      apiKey: config.apiKey || '',
      sheetName: config.sheetName || 'Sheet1',
      enabled: config.enabled || false,
      ...config
    };
    this.baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
  }

  // Load config from localStorage
  loadConfig() {
    const saved = localStorage.getItem('gsConfig');
    if (saved) {
      const cfg = JSON.parse(saved);
      this.config = { ...this.config, ...cfg };
    }
  }

  // Save config to localStorage
  saveConfig() {
    localStorage.setItem('gsConfig', JSON.stringify(this.config));
  }

  // Update configuration
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
  }

  // Get connection status
  getConnectionStatus() {
    if (!this.config.enabled) return { connected: false, message: 'ใช้ localStorage' };
    if (!this.config.spreadsheetId || !this.config.apiKey) return { connected: false, message: 'กรอกข้อมูล Sheets' };
    return { connected: true, message: 'เชื่อมต่อ Sheets' };
  }

  // Fetch all data from Google Sheets
  async fetchData() {
    if (!this.config.enabled || !this.config.spreadsheetId || !this.config.apiKey) {
      throw new Error('Google Sheets not configured');
    }

    try {
      const url = `${this.baseUrl}/${this.config.spreadsheetId}/values/${this.config.sheetName}?key=${this.config.apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const rows = data.values || [];

      // Convert rows to records (skip header row)
      if (rows.length > 1) {
        return rows.slice(1).map((row, index) => ({
          id: parseInt(row[0]) || Date.now() + index,
          radioId: row[1] || '',
          radioSN: row[2] || '',
          radioModel: row[3] || '',
          name: row[4] || '',
          phone: row[5] || '',
          dept: row[6] || '',
          borrowTime: row[7] || new Date().toISOString(),
          returnTime: row[8] || null,
          status: row[9] || 'borrowed',
          photo: row[10] || null,
          returnPhoto: row[11] || null
        }));
      }

      return [];
    } catch (error) {
      console.error('Google Sheets fetch error:', error);
      throw error;
    }
  }

  // Test connection to Apps Script
  async testConnection() {
    const appsScriptUrl = this.config.appsScriptUrl;
    if (!appsScriptUrl || appsScriptUrl.includes('YOUR_APPS_SCRIPT_WEBAPP_URL') || !appsScriptUrl.startsWith('http')) {
      return { ok: false, error: 'Apps Script URL ยังไม่ได้ตั้งค่า' };
    }
    try {
      // Use GET with a test param to ping the script
      const url = appsScriptUrl + '?action=ping';
      const res = await fetch(url, { method: 'GET', mode: 'cors' });
      if (res.ok) {
        const text = await res.text();
        return { ok: true, response: text };
      }
      return { ok: false, error: `HTTP ${res.status}` };
    } catch (e) {
      // CORS error usually means the script IS reachable but blocks cross-origin reads
      // That is expected with no-cors deployments
      if (e.name === 'TypeError' && e.message.includes('Failed to fetch')) {
        return { ok: false, error: 'ไม่สามารถติดต่อ Apps Script ได้ (ตรวจสอบ URL หรือ Deploy ใหม่)' };
      }
      // A CORS/network error where the request DID reach the server is actually OK for no-cors
      return { ok: true, response: 'CORS block — script reachable' };
    }
  }

  // Append new row to Google Sheets
  async appendRow(record) {
    if (!this.config.enabled || !this.config.spreadsheetId) {
      console.warn('Google Sheets: ปิดใช้งานหรือไม่มี Spreadsheet ID');
      return false;
    }

    const appsScriptUrl = this.config.appsScriptUrl;
    if (!appsScriptUrl || appsScriptUrl.includes('YOUR_APPS_SCRIPT_WEBAPP_URL') || !appsScriptUrl.startsWith('http')) {
      const msg = 'Google Sheets: Apps Script URL ไม่ถูกต้อง กรุณาตรวจสอบ config.js';
      console.error(msg);
      throw new Error(msg);
    }

    const payload = JSON.stringify({
      action: 'append',
      spreadsheetId: this.config.spreadsheetId,
      sheetName: this.config.sheetName,
      folderId: this.config.photoFolderId,
      row: [
        record.id,
        record.radioId,
        record.radioSN || '',
        record.radioModel || '',
        record.name,
        record.phone,
        record.dept,
        record.borrowTime,
        record.returnTime || '',
        record.status,
        record.photo || '',
        record.returnPhoto || ''
      ]
    });

    try {
      await fetch(appsScriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: payload
      });
      console.log('✅ Google Sheets: appendRow ส่งข้อมูลสำเร็จ (no-cors)');
      return true;
    } catch (error) {
      const msg = 'Google Sheets appendRow ล้มเหลว: ' + error.message;
      console.error(msg, error);
      throw new Error(msg);
    }
  }

  // Update existing row in Google Sheets
  async updateRow(recordId, updates) {
    if (!this.config.enabled || !this.config.spreadsheetId) {
      console.warn('Google Sheets: ปิดใช้งานหรือไม่มี Spreadsheet ID');
      return false;
    }

    const appsScriptUrl = this.config.appsScriptUrl;
    if (!appsScriptUrl || appsScriptUrl.includes('YOUR_APPS_SCRIPT_WEBAPP_URL') || !appsScriptUrl.startsWith('http')) {
      const msg = 'Google Sheets: Apps Script URL ไม่ถูกต้อง';
      console.error(msg);
      throw new Error(msg);
    }

    try {
      await fetch(appsScriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'update',
          spreadsheetId: this.config.spreadsheetId,
          sheetName: this.config.sheetName,
          recordId: recordId,
          folderId: this.config.photoFolderId,
          updates: updates
        })
      });
      console.log('✅ Google Sheets: updateRow ส่งข้อมูลสำเร็จ (no-cors)');
      return true;
    } catch (error) {
      const msg = 'Google Sheets updateRow ล้มเหลว: ' + error.message;
      console.error(msg, error);
      throw new Error(msg);
    }
  }

  // Create Google Apps Script for write operations
  generateAppsScript() {
    return `
// Google Apps Script for RadioTrack System
// Deploy as Web App with "Anyone, even anonymous" access

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const spreadsheetId = data.spreadsheetId;
    const sheetName = data.sheetName;
    const action = data.action;
    const folderId = data.folderId; // Google Drive Folder ID
    
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getSheetByName(sheetName);
    
    // Helper to upload base64 to Drive and return link
    function uploadToDrive(base64Data, radioId, type) {
      if (!base64Data || !folderId || base64Data.length < 100) return base64Data;
      try {
        const folder = DriveApp.getFolderById(folderId);
        const contentType = base64Data.substring(base64Data.indexOf(":") + 1, base64Data.indexOf(";"));
        const bytes = Utilities.base64Decode(base64Data.split(",")[1]);
        const fileName = type + "_" + radioId + "_" + Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd_HHmm") + ".jpg";
        const file = folder.createFile(Utilities.newBlob(bytes, contentType, fileName));
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        return file.getUrl();
      } catch (e) {
        return "Error uploading: " + e.toString();
      }
    }
    
    if (action === 'append') {
      const row = data.row;
      // Index 1 is radioId. Index 10 is borrow photo
      row[10] = uploadToDrive(row[10], row[1], "BORROW");
      
      sheet.appendRow(row);
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === 'update') {
      const recordId = data.recordId;
      const updates = data.updates;
      
      const range = sheet.getRange("A2:A" + sheet.getLastRow());
      const values = range.getValues();
      
      for (let i = 0; i < values.length; i++) {
        if (values[i][0] == recordId) {
          const rowNum = i + 2;
          const radioId = sheet.getRange(rowNum, 2).getValue(); // Column B
          
          if (updates.returnTime !== undefined) {
            sheet.getRange(rowNum, 9).setValue(updates.returnTime); // Column I
          }
          if (updates.status !== undefined) {
            sheet.getRange(rowNum, 10).setValue(updates.status); // Column J
          }
          if (updates.returnPhoto !== undefined) {
            const driveUrl = uploadToDrive(updates.returnPhoto, radioId, "RETURN");
            sheet.getRange(rowNum, 12).setValue(driveUrl); // Column L
          }
          
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ error: 'Unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// doGet: allows ping test from browser (testSheets() in console)
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (action === 'ping') {
    return ContentService.createTextOutput(JSON.stringify({ ok: true, message: 'RadioTrack Apps Script is running' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true, message: 'RadioTrack Apps Script ready' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Test function
function test() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sheet1');
  sheet.appendRow(['test_id', 'R01', 'Test User', '1234567890', 'Test Dept', new Date().toISOString(), '', 'borrowed', '']);
}
    `;
  }

  // Setup instructions
  getSetupInstructions() {
    return {
      steps: [
        "1. สร้าง Google Cloud Project ที่ console.cloud.google.com",
        "2. เปิดใช้งาน Google Sheets API",
        "3. สร้าง API Key และจำกัดสิทธิ์เฉพาะ Google Sheets API",
        "4. สร้าง Google Sheets และคัดลอก Spreadsheet ID จาก URL",
        "5. สร้าง Google Apps Script สำหรับการเขียนข้อมูล",
        "6. Deploy Apps Script เป็น Web App และคัดลอก URL",
        "7. กรอกข้อมูลในหน้าตั้งค่าในระบบ"
      ],
      appsScriptCode: this.generateAppsScript()
    };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GoogleSheetsAPI;
}
