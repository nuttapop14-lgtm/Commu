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

  // Append new row to Google Sheets
  async appendRow(record) {
    if (!this.config.enabled || !this.config.spreadsheetId || !this.config.apiKey) {
      return false;
    }

    try {
      const appsScriptUrl = this.config.appsScriptUrl;
      if (!appsScriptUrl || appsScriptUrl.includes('YOUR_APPS_SCRIPT_WEBAPP_URL') || !appsScriptUrl.startsWith('http')) {
        console.warn('Google Sheets: Apps Script URL not configured for write operations.');
        return false;
      }

      const response = await fetch(appsScriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'append',
          spreadsheetId: this.config.spreadsheetId,
          sheetName: this.config.sheetName,
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
        })
      });

      // Since we're using no-cors, we'll assume success if no error is thrown
      return true;
    } catch (error) {
      console.error('Google Sheets append error:', error);
      return false;
    }
  }

  // Update existing row in Google Sheets
  async updateRow(recordId, updates) {
    if (!this.config.enabled || !this.config.spreadsheetId || !this.config.apiKey) {
      return false;
    }

    try {
      const appsScriptUrl = this.config.appsScriptUrl || 'YOUR_APPS_SCRIPT_WEBAPP_URL';

      const response = await fetch(appsScriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update',
          spreadsheetId: this.config.spreadsheetId,
          sheetName: this.config.sheetName,
          recordId: recordId,
          updates: updates
        })
      });

      return true;
    } catch (error) {
      console.error('Google Sheets update error:', error);
      return false;
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
    
    const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
    
    if (action === 'append') {
      const row = data.row;
      sheet.appendRow(row);
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === 'update') {
      const recordId = data.recordId;
      const updates = data.updates;
      
      // Find row by record ID (column A)
      const range = sheet.getRange("A2:A" + sheet.getLastRow());
      const values = range.getValues();
      
      for (let i = 0; i < values.length; i++) {
        if (values[i][0] == recordId) {
          const rowNum = i + 2; // +2 because rows are 1-indexed and we skip header
          
          // Update specific columns
          if (updates.status !== undefined) {
            sheet.getRange(rowNum, 8).setValue(updates.status); // Column H
          }
          if (updates.returnTime !== undefined) {
            sheet.getRange(rowNum, 7).setValue(updates.returnTime); // Column G
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
