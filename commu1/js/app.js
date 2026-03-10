// Radio Borrow System - Main Application
class RadioBorrowSystem {
  constructor() {
    this.TOTAL = 84;
    this.records = [];
    this.borrowed = new Set();
    this.selectedRadios = new Set(); // Changed from single selectedRadio
    this.photoDataUrl = null;
    this.camStream = null;
    this.qrScanner = null;
    this.qrActive = false;
    this.isLoading = false;
    this.currentUser = null;
    this.pendingReturnId = null;
    this.returnPhotoDataUrl = null;
    this.returnCamStream = null;
    this.facingMode = 'user'; // Default to front camera

    // Initialize Google Sheets API
    const config = typeof GS_CONFIG !== 'undefined' ? GS_CONFIG : {};
    this.sheetsAPI = new GoogleSheetsAPI(config);
    if (typeof GS_CONFIG === 'undefined') {
      this.sheetsAPI.loadConfig();
    }

    // Authorized emails
    this.AUTHORIZED_EMAILS = [
      'nuttapop14@gmail.com',
      // Add more authorized emails here
    ];

    this.init();
  }

  // Initialize application
  async init() {
    // Check saved session
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      this.currentUser = JSON.parse(savedUser);
      this.showApp();
    }

    // Load from localStorage first (as cache)
    this.loadLocalData();

    // Render UI
    this.renderRadioGrid();
    this.renderTable();
    this.renderReturnList();
    this.updateStats();
    this.startClock();
    this.initUserDatalist();
    this.initRadioDatalist();

    // Sync with Google Sheets if enabled
    if (this.sheetsAPI.config.enabled) {
      try {
        await this.syncFromSheets();
        this.showToast('🔄 ซิงค์ข้อมูลกับ Google Sheets สำเร็จ', 'success');
      } catch (error) {
        this.showToast('❌ โหลดข้อมูลจาก Sheets ไม่สำเร็จ', 'error');
      }
    }
  }

  // Load data from localStorage
  loadLocalData() {
    const cached = JSON.parse(localStorage.getItem('radioRecords') || '[]');
    if (cached.length > 0) {
      this.records = cached;
      this.borrowed = new Set(this.records.filter(r => r.status === 'borrowed').map(r => r.radioId));
    }
  }

  // Save data to localStorage
  saveLocalData() {
    localStorage.setItem('radioRecords', JSON.stringify(this.records));
  }

  // Sync from Google Sheets
  async syncFromSheets() {
    try {
      const records = await this.sheetsAPI.fetchData();
      this.records = records;
      this.borrowed = new Set(records.filter(r => r.status === 'borrowed').map(r => r.radioId));
      this.saveLocalData();
    } catch (error) {
      throw error;
    }
  }

  // Start clock
  startClock() {
    const el = document.getElementById('clock');
    if (el) {
      setInterval(() => {
        el.textContent = new Date().toLocaleTimeString('th-TH');
      }, 1000);
    }
  }

  // =================== AUTH FUNCTIONS ===================
  handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();

    if (!this.AUTHORIZED_EMAILS.includes(email)) {
      document.getElementById('login-error').classList.add('show');
      return false;
    }

    this.currentUser = { email, loginTime: new Date().toISOString() };
    localStorage.setItem('currentUser', JSON.stringify(this.currentUser));

    document.getElementById('login-error').classList.remove('show');
    this.showApp();
    this.showToast(`✅ ยินดีต้อนรับ ${email}`, 'success');

    return false;
  }

  showApp() {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('user-info').style.display = 'flex';
    document.getElementById('user-email').textContent = this.currentUser.email;
    document.getElementById('user-avatar').textContent = this.currentUser.email.charAt(0).toUpperCase();
  }

  handleLogout() {
    this.currentUser = null;
    localStorage.removeItem('currentUser');
    document.getElementById('login-page').classList.remove('hidden');
    document.getElementById('user-info').style.display = 'none';
    document.getElementById('login-email').value = '';
    this.showToast('👋 ออกจากระบบเรียบร้อย', 'info');
  }

  // =================== TABS ===================
  switchTab(tab) {
    document.querySelectorAll('.tab').forEach((t, i) =>
      t.classList.toggle('active', (i === 0 && tab === 'borrow') || (i === 1 && tab === 'return'))
    );
    document.getElementById('tab-borrow').style.display = tab === 'borrow' ? 'block' : 'none';
    document.getElementById('tab-return').style.display = tab === 'return' ? 'block' : 'none';
    if (tab === 'return') this.renderReturnList();
  }

  // =================== RADIO GRID ===================
  renderRadioGrid() {
    const grid = document.getElementById('radio-grid');
    if (!grid) return;

    grid.innerHTML = '';
    for (let i = 1; i <= this.TOTAL; i++) {
      const id = String(i);
      const radioInfo = typeof RADIOS_DB !== 'undefined' ? RADIOS_DB[id] : null;
      const isBorrowed = this.borrowed.has(id);
      const isSelected = this.selectedRadios.has(id);
      const btn = document.createElement('button');
      btn.className = 'radio-btn ' + (isBorrowed ? 'borrowed' : isSelected ? 'selected' : 'available');
      btn.textContent = String(i).padStart(2, '0');
      btn.title = radioInfo ? `SN: ${radioInfo.sn} (${radioInfo.model})` : `Radio ${id}`;
      if (!isBorrowed) btn.onclick = () => this.selectRadio(id);
      grid.appendChild(btn);
    }
  }

  handleQuantityChange(val) {
    const qty = parseInt(val) || 1;
    const container = document.getElementById('radio-inputs-container');
    const currentInputs = container.querySelectorAll('.radio-search-input');
    const currentQty = currentInputs.length;

    if (qty > currentQty) {
      for (let i = currentQty + 1; i <= qty; i++) {
        const group = document.createElement('div');
        group.className = 'form-group';
        group.innerHTML = `
          <label>ค้นหาหมายเลขวิทยุเครื่องที่ ${i}</label>
          <div class="radio-input-group">
            <input type="text" class="radio-search-input" placeholder="พิมพ์ค้นหาหมายเลข..." list="radio-datalist"
              style="font-family:'IBM Plex Mono',monospace; font-weight:700; color:var(--accent);"
              oninput="app.updateSelectedRadios()">
            <button class="clear-input-btn" onclick="this.previousElementSibling.value=''; app.updateSelectedRadios()">✕</button>
          </div>
        `;
        container.appendChild(group);
      }
    } else if (qty < currentQty) {
      for (let i = currentQty; i > qty; i--) {
        container.removeChild(container.lastElementChild);
      }
    }
    this.updateSelectedRadios();
  }

  updateSelectedRadios() {
    this.selectedRadios.clear();
    const inputs = document.querySelectorAll('.radio-search-input');
    const seen = new Set();

    inputs.forEach((input, index) => {
      const val = input.value.split('|')[0].trim();
      if (val) {
        if (seen.has(val)) {
          this.showToast(`⚠️ หมายเลข ${val} ถูกเลือกไปแล้วในช่องอื่น`, 'error');
          input.value = ''; // Clear duplicate
        } else if (this.borrowed.has(val)) {
          this.showToast(`⚠️ หมายเลข ${val} ถูกยืมไปแล้ว`, 'error');
          input.value = ''; // Clear borrowed
        } else {
          seen.add(val);
          this.selectedRadios.add(val);
        }
      }
    });

    // Update Preview Card... 
    // (existing logic remains)
    const previewCard = document.getElementById('radio-preview-card');
    if (previewCard) {
      if (this.selectedRadios.size > 0) {
        previewCard.style.display = 'block';
        const lastId = Array.from(this.selectedRadios).pop();
        const radioInfo = typeof RADIOS_DB !== 'undefined' ? RADIOS_DB[lastId] : null;

        document.getElementById('preview-radio-id').textContent = `เลือกแล้ว ${this.selectedRadios.size} เครื่อง`;
        document.getElementById('preview-radio-info').textContent = `รายการหมายเลข: ${Array.from(this.selectedRadios).join(', ')}`;

        const img = document.getElementById('preview-radio-img');
        const model = radioInfo ? radioInfo.model : '';
        img.src = this.getRadioImage(model);
      } else {
        previewCard.style.display = 'none';
      }
    }

    this.renderRadioGrid();
  }

  selectRadio(id) {
    // If already in the set, we might want to remove it from its input
    const inputs = document.querySelectorAll('.radio-search-input');
    let removed = false;

    for (let input of inputs) {
      if (input.value.split('|')[0].trim() === id) {
        input.value = '';
        removed = true;
        break;
      }
    }

    if (!removed) {
      // Try to find an empty input
      let filled = false;
      for (let input of inputs) {
        if (!input.value.trim()) {
          const radioInfo = typeof RADIOS_DB !== 'undefined' ? RADIOS_DB[id] : null;
          input.value = radioInfo ? `${id} | SN: ${radioInfo.sn} (${radioInfo.model})` : id;
          filled = true;
          break;
        }
      }

      // If no empty input, increase quantity and add
      if (!filled) {
        const currentQty = parseInt(document.getElementById('borrow-qty').value) || 0;
        const newQty = currentQty + 1;
        document.getElementById('borrow-qty').value = newQty;
        this.handleQuantityChange(newQty);

        // Fill the newly created last input
        const newInputs = document.querySelectorAll('.radio-search-input');
        const lastInput = newInputs[newInputs.length - 1];
        const radioInfo = typeof RADIOS_DB !== 'undefined' ? RADIOS_DB[id] : null;
        lastInput.value = radioInfo ? `${id} | SN: ${radioInfo.sn} (${radioInfo.model})` : id;
      }
    }

    this.updateSelectedRadios();
  }

  getRadioImage(model) {
    if (model.includes('PD408')) return 'images/radios/PD408.png';
    if (model.includes('PD788')) return 'images/radios/PD788G.png';
    if (model.includes('HP788')) return 'images/radios/HP788.png';
    return 'images/TACCOM46.PNG'; // Fallback
  }

  clearSelectedRadio() {
    this.selectedRadios.clear();
    const inputs = document.querySelectorAll('.radio-search-input');
    inputs.forEach(input => input.value = '');

    document.getElementById('borrow-qty').value = 1;
    this.handleQuantityChange(1);

    const previewCard = document.getElementById('radio-preview-card');
    if (previewCard) previewCard.style.display = 'none';

    this.renderRadioGrid();
  }

  // =================== QR SCANNER ===================
  startQR() {
    if (this.qrActive) return;
    this.qrActive = true;
    document.getElementById('qr-placeholder').style.display = 'none';
    document.getElementById('qr-reader').style.display = 'block';

    this.qrScanner = new Html5Qrcode("qr-reader");
    this.qrScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 200, height: 200 } },
      (text) => {
        this.qrScanner.stop();
        this.qrActive = false;
        document.getElementById('qr-reader').style.display = 'none';
        document.getElementById('qr-placeholder').style.display = 'block';

        const match = text.match(/R\d+/);
        const id = match ? match[0].toUpperCase() : text.toUpperCase();
        document.getElementById('qr-result').style.display = 'block';
        document.getElementById('qr-val').textContent = id;

        if (this.borrowed.has(id)) {
          this.showToast(`วิทยุ ${id} ถูกยืมไปแล้ว!`, 'error');
        } else {
          this.selectRadio(id);
        }
      },
      () => { }
    ).catch(() => {
      this.qrActive = false;
      this.showToast('ไม่สามารถเปิดกล้องได้', 'error');
      document.getElementById('qr-placeholder').style.display = 'block';
      document.getElementById('qr-reader').style.display = 'none';
    });
  }

  // =================== CAMERA ===================
  async startCamera() {
    if (this.photoDataUrl) return;
    if (this.camStream) return;
    try {
      const constraints = {
        video: {
          facingMode: this.facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.camStream = stream;
      const video = document.getElementById('cam-stream');
      video.srcObject = stream;
      video.style.display = 'block';
      document.getElementById('photo-placeholder').style.display = 'none';
      document.getElementById('btn-snap').style.display = 'inline-block';
      document.getElementById('cam-btns').style.display = 'flex';
    } catch (e) {
      this.showToast('ไม่สามารถเปิดกล้องได้ หรือไม่มีกล้องที่เลือก', 'error');
    }
  }

  async toggleCamera() {
    // Stop all current streams
    if (this.camStream) {
      this.camStream.getTracks().forEach(t => t.stop());
      this.camStream = null;
    }
    if (this.returnCamStream) {
      this.returnCamStream.getTracks().forEach(t => t.stop());
      this.returnCamStream = null;
    }

    // Toggle mode
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    this.showToast(`กำลังสลับเป็นกล้อง${this.facingMode === 'user' ? 'หน้า' : 'หลัง'}...`, 'info');

    // Re-start if it was previously active
    const isBorrowTab = document.getElementById('tab-borrow').style.display !== 'none';
    const isReturnModalOpen = document.getElementById('return-modal').classList.contains('show');

    if (isReturnModalOpen) {
      await this.startReturnCamera();
    } else if (isBorrowTab) {
      await this.startCamera();
    }
  }

  snapPhoto() {
    const video = document.getElementById('cam-stream');
    const canvas = document.getElementById('photo-canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    this.photoDataUrl = canvas.toDataURL('image/jpeg', 0.8);

    if (this.camStream) {
      this.camStream.getTracks().forEach(t => t.stop());
      this.camStream = null;
    }
    video.style.display = 'none';

    const prev = document.getElementById('photo-preview');
    prev.src = this.photoDataUrl;
    prev.style.display = 'block';
    document.getElementById('btn-snap').style.display = 'none';
    document.getElementById('btn-retake').style.display = 'inline-block';
    this.showToast('ถ่ายภาพสำเร็จ', 'success');
  }

  retakePhoto() {
    this.photoDataUrl = null;
    document.getElementById('photo-preview').style.display = 'none';
    document.getElementById('photo-preview').src = '';
    document.getElementById('photo-placeholder').style.display = 'block';
    document.getElementById('btn-retake').style.display = 'none';
    document.getElementById('cam-btns').style.display = 'none';
    this.startCamera();
  }

  async handlePhotoUpload(input) {
    if (input.files && input.files[0]) {
      let file = input.files[0];

      // Handle HEIC/HEIF conversion
      if (file.type === '' && (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif'))) {
        this.showToast('🔄 กำลังประมวลผลไฟล์ HEIC...', 'info');
        try {
          const blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.7 });
          file = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), { type: "image/jpeg" });
        } catch (e) {
          this.showToast('❌ แปลงไฟล์ HEIC ไม่สำเร็จ', 'error');
          return;
        }
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        this.photoDataUrl = e.target.result;
        const prev = document.getElementById('photo-preview');
        prev.src = this.photoDataUrl;
        prev.style.display = 'block';
        document.getElementById('photo-placeholder').style.display = 'none';
        document.getElementById('cam-stream').style.display = 'none';
        if (this.camStream) {
          this.camStream.getTracks().forEach(t => t.stop());
          this.camStream = null;
        }
        document.getElementById('cam-btns').style.display = 'none';
        this.showToast('อัปโหลดรูปภาพสำเร็จ', 'success');
      };
      reader.readAsDataURL(file);
    }
  }

  // =================== SUBMIT BORROW ===================
  async submitBorrow() {
    const name = document.getElementById('borrower-name').value.trim();
    const phone = document.getElementById('borrower-phone').value.trim();
    const dept = document.getElementById('borrower-dept').value.trim();

    if (this.selectedRadios.size === 0) {
      this.showToast('กรุณาเลือกหมายเลขวิทยุ (เลือกได้หลายเครื่อง)', 'error');
      return;
    }
    if (!name) {
      this.showToast('กรุณาใส่ชื่อผู้ยืม', 'error');
      return;
    }
    if (!phone) {
      this.showToast('กรุณาใส่เบอร์โทรศัพท์', 'error');
      return;
    }

    const selectedList = Array.from(this.selectedRadios);
    const syncResults = [];
    this.showLoading(true);

    for (const radioId of selectedList) {
      if (this.borrowed.has(radioId)) continue; // Skip if already borrowed

      const radioInfo = typeof RADIOS_DB !== 'undefined' ? RADIOS_DB[radioId] : null;

      const record = {
        id: Date.now() + Math.random(), // Unique ID even for batch
        radioId: radioId,
        radioSN: radioInfo ? radioInfo.sn : radioId,
        radioModel: radioInfo ? radioInfo.model : '—',
        name, phone, dept,
        borrowTime: new Date().toISOString(),
        returnTime: null,
        status: 'borrowed',
        photo: this.photoDataUrl
      };

      this.records.unshift(record);
      this.borrowed.add(radioId);
      this.saveLocalData();

      // Sync with Google Sheets
      if (this.sheetsAPI.config.enabled) {
        const synced = await this.sheetsAPI.appendRow(record);
        syncResults.push(synced);
      }
    }

    this.showLoading(false);
    this.showToast(`✅ บันทึกยืมวิทยุ ${selectedList.length} เครื่อง เรียบร้อยแล้ว`, 'success');

    this.updateStats();
    this.renderRadioGrid();
    this.renderTable();
    this.renderReturnList();
    this.resetForm();
  }

  resetForm() {
    this.clearSelectedRadio();
    this.photoDataUrl = null;
    document.getElementById('borrower-name').value = '';
    document.getElementById('borrower-phone').value = '';
    document.getElementById('borrower-dept').value = '';
    document.getElementById('borrow-qty').value = 1;
    this.handleQuantityChange(1);
    document.getElementById('qr-result').style.display = 'none';
    document.getElementById('photo-preview').style.display = 'none';
    document.getElementById('photo-preview').src = '';
    document.getElementById('photo-placeholder').style.display = 'block';
    document.getElementById('cam-btns').style.display = 'none';
    if (this.camStream) { this.camStream.getTracks().forEach(t => t.stop()); this.camStream = null; }
    document.getElementById('cam-stream').style.display = 'none';
  }

  initUserDatalist() {
    const list = document.getElementById('user-datalist');
    if (typeof USERS_DB !== 'undefined' && list) {
      USERS_DB.forEach(user => {
        if (user[0]) {
          const opt = document.createElement('option');
          opt.value = user[0];
          list.appendChild(opt);
        }
      });
    }
  }

  initRadioDatalist() {
    const list = document.getElementById('radio-datalist');
    if (list) {
      for (let i = 1; i <= this.TOTAL; i++) {
        const id = String(i);
        const radioInfo = typeof RADIOS_DB !== 'undefined' ? RADIOS_DB[id] : null;
        const opt = document.createElement('option');
        opt.value = radioInfo ? `${id} | SN: ${radioInfo.sn} (${radioInfo.model})` : id;
        list.appendChild(opt);
      }
    }
  }

  handleRadioSearch(val) {
    // If user selects from datalist or types exact match
    const idMatch = val.split(' | ')[0]; // Get "1" from "1 | SN: ..."
    const i = parseInt(idMatch);
    if (!isNaN(i) && i >= 1 && i <= this.TOTAL) {
      this.selectRadio(String(i));
    }
  }

  handleUserSelect(val) {
    if (typeof USERS_DB !== 'undefined') {
      const user = USERS_DB.find(u => u[0] === val);
      if (user) {
        if (user[1]) document.getElementById('borrower-phone').value = user[1];
        if (user[2]) document.getElementById('borrower-dept').value = user[2];
      }
    }
  }

  // =================== RETURN ===================
  // Open return modal with photo capture
  openReturnModal(id) {
    const rec = this.records.find(r => r.id === id);
    if (!rec) return;

    this.pendingReturnId = id;
    this.returnPhotoDataUrl = null;

    // Show return info
    document.getElementById('return-info').innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
        <span class="radio-tag">${rec.radioId}</span>
        <span style="font-weight:700;">${rec.name}</span>
      </div>
      <div style="font-size:13px;color:var(--muted);">
        📞 ${rec.phone} &nbsp;|&nbsp; 🕐 ยืมเมื่อ: ${this.formatTime(rec.borrowTime)}
      </div>
    `;

    // Reset photo area
    document.getElementById('return-photo-preview').style.display = 'none';
    document.getElementById('return-photo-preview').src = '';
    document.getElementById('return-photo-placeholder').style.display = 'block';
    document.getElementById('return-cam-stream').style.display = 'none';
    document.getElementById('return-btn-snap').style.display = 'none';
    document.getElementById('return-btn-retake').style.display = 'none';
    document.getElementById('return-cam-btns').style.display = 'none';

    // Show modal
    document.getElementById('return-modal').classList.add('show');
  }

  // Start return photo camera
  async startReturnCamera() {
    if (this.returnPhotoDataUrl) return;
    if (this.returnCamStream) return;

    try {
      const constraints = {
        video: {
          facingMode: this.facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.returnCamStream = stream;
      const video = document.getElementById('return-cam-stream');
      video.srcObject = stream;
      video.style.display = 'block';
      document.getElementById('return-photo-placeholder').style.display = 'none';
      document.getElementById('return-btn-snap').style.display = 'inline-block';
      document.getElementById('return-cam-btns').style.display = 'flex';
    } catch (e) {
      this.showToast('ไม่สามารถเปิดกล้องได้', 'error');
    }
  }

  // Snap return photo
  snapReturnPhoto() {
    const video = document.getElementById('return-cam-stream');
    const canvas = document.getElementById('return-photo-canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    this.returnPhotoDataUrl = canvas.toDataURL('image/jpeg', 0.8);

    if (this.returnCamStream) {
      this.returnCamStream.getTracks().forEach(t => t.stop());
      this.returnCamStream = null;
    }
    video.style.display = 'none';

    const prev = document.getElementById('return-photo-preview');
    prev.src = this.returnPhotoDataUrl;
    prev.style.display = 'block';
    document.getElementById('return-btn-snap').style.display = 'none';
    document.getElementById('return-btn-retake').style.display = 'inline-block';
    this.showToast('ถ่ายภาพสำเร็จ', 'success');
  }

  // Retake return photo
  retakeReturnPhoto() {
    this.returnPhotoDataUrl = null;
    document.getElementById('return-photo-preview').style.display = 'none';
    document.getElementById('return-photo-preview').src = '';
    document.getElementById('return-photo-placeholder').style.display = 'block';
    document.getElementById('return-btn-snap').style.display = 'none';
    document.getElementById('return-btn-retake').style.display = 'none';
    document.getElementById('return-cam-btns').style.display = 'flex'; // Keep buttons visible
    this.startReturnCamera();
  }

  async handleReturnPhotoUpload(input) {
    if (input.files && input.files[0]) {
      let file = input.files[0];

      // Handle HEIC/HEIF conversion
      if (file.type === '' && (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif'))) {
        this.showToast('🔄 กำลังประมวลผลไฟล์ HEIC...', 'info');
        try {
          const blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.7 });
          file = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), { type: "image/jpeg" });
        } catch (e) {
          this.showToast('❌ แปลงไฟล์ HEIC ไม่สำเร็จ', 'error');
          return;
        }
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        this.returnPhotoDataUrl = e.target.result;
        const prev = document.getElementById('return-photo-preview');
        prev.src = this.returnPhotoDataUrl;
        prev.style.display = 'block';
        document.getElementById('return-photo-placeholder').style.display = 'none';
        document.getElementById('return-cam-stream').style.display = 'none';

        if (this.returnCamStream) {
          this.returnCamStream.getTracks().forEach(t => t.stop());
          this.returnCamStream = null;
        }

        // Show button container and update toggle
        document.getElementById('return-cam-btns').style.display = 'flex';
        document.getElementById('return-btn-snap').style.display = 'none';
        document.getElementById('return-btn-retake').style.display = 'inline-block';
        this.showToast('อัปโหลดหลักฐานการคืนสำเร็จ', 'success');
      };
      reader.readAsDataURL(file);
    }
  }

  // Confirm return with photo
  async confirmReturn() {
    const id = this.pendingReturnId;
    if (!id) return;

    const rec = this.records.find(r => r.id === id);
    if (!rec) return;

    // Update record
    rec.status = 'returned';
    rec.returnTime = new Date().toISOString();
    rec.returnPhoto = this.returnPhotoDataUrl; // Save return photo
    this.borrowed.delete(rec.radioId);
    this.saveLocalData();

    // Close modal
    document.getElementById('return-modal').classList.remove('show');

    // Sync with Google Sheets
    if (this.sheetsAPI.config.enabled) {
      this.showLoading(true);
      const synced = await this.sheetsAPI.updateRow(id, {
        status: 'returned',
        returnTime: rec.returnTime,
        returnPhoto: rec.returnPhoto
      });
      this.showLoading(false);
      if (synced) {
        this.showToast(`📥 คืนวิทยุ ${rec.radioId} เรียบร้อย (synced)`, 'success');
      } else {
        this.showToast(`📥 คืนวิทยุ ${rec.radioId} เรียบร้อย (local only)`, 'info');
      }
    } else {
      this.showToast(`📥 คืนวิทยุ ${rec.radioId} เรียบร้อย`, 'success');
    }

    // Reset
    this.pendingReturnId = null;
    this.returnPhotoDataUrl = null;

    this.updateStats();
    this.renderRadioGrid();
    this.renderTable();
    this.renderReturnList();
  }

  // Legacy return function (for backward compatibility)
  async returnRadio(id) {
    this.openReturnModal(id);
  }

  renderReturnList() {
    const q = (document.getElementById('return-search').value || '').toLowerCase();
    const active = this.records.filter(r => r.status === 'borrowed' && (
      r.radioId.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.phone.includes(q)
    ));
    const el = document.getElementById('return-list');
    if (active.length === 0) {
      el.innerHTML = '<div style="text-align:center;color:var(--muted);padding:30px;font-size:13px;">ไม่มีรายการยืมที่ตรงเงื่อนไข</div>';
      return;
    }
    el.innerHTML = active.map(r => `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;">
            <span class="radio-tag">${r.radioId}</span>
            <span style="font-size:14px;font-weight:700;">${r.name}</span>
          </div>
          <div style="font-size:12px;color:var(--muted);">📞 ${r.phone} &nbsp; ⏰ ${this.formatTime(r.borrowTime)}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn-return" onclick="app.returnRadio(${r.id})">คืน</button>
          <button class="btn-print-row" onclick="app.printRecord(${r.id})">🖨</button>
        </div>
      </div>
    `).join('');
  }

  // =================== TABLE ===================
  renderTable() {
    const q = (document.getElementById('table-search').value || '').toLowerCase();
    const filtered = this.records.filter(r =>
      r.radioId.toLowerCase().includes(q) ||
      (r.radioSN && r.radioSN.toLowerCase().includes(q)) ||
      (r.radioModel && r.radioModel.toLowerCase().includes(q)) ||
      r.name.toLowerCase().includes(q) ||
      r.phone.includes(q) ||
      (r.dept || '').toLowerCase().includes(q)
    );
    const tbody = document.getElementById('records-body');
    const empty = document.getElementById('empty-state');
    if (filtered.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    tbody.innerHTML = filtered.map((r, i) => `
      <tr>
        <td class="time-mono">${i + 1}</td>
      <td><span class="radio-tag">#${r.radioId.padStart(2, '0')}</span></td>
      <td class="time-mono" style="font-size:11px;">
        <span style="font-weight:700; color: #334155;">${r.radioSN || '—'}</span><br>
        <span style="color: #64748b;">${r.radioModel || '—'}</span>
      </td>
      <td style="font-weight:700; color: var(--accent); white-space:nowrap;">${r.name}</td>
      <td class="time-mono" style="color: #334155;">${r.phone}</td>
      <td style="color: #475569; font-size:12px; font-weight:500;">${r.dept || '—'}</td>
      <td class="time-mono" style="font-size:12px; color: #475569;">${this.formatTime(r.borrowTime)}</td>
      <td class="time-mono" style="font-size:12px; color: #475569;">${r.returnTime ? this.formatTime(r.returnTime) : '—'}</td>
        <td>${this.renderPhotoCell(r.photo, 'viewPhoto', r.id)}</td>
        <td>${this.renderPhotoCell(r.returnPhoto, 'viewReturnPhoto', r.id)}</td>
        <td>${r.status === 'borrowed' ?
        '<span class="badge badge-yellow">⏳ ยืมอยู่</span>' :
        '<span class="badge badge-green">✓ คืนแล้ว</span>'}</td>
        <td>
          <div style="display:flex;gap:4px;">
            ${r.status === 'borrowed' ? `<button class="btn-return" onclick="app.returnRadio(${r.id})">คืน</button>` : ''}
            <button class="btn-print-row" onclick="app.printRecord(${r.id})">🖨️</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  // =================== STATS ===================
  updateStats() {
    const b = this.borrowed.size;
    const a = this.TOTAL - b;
    document.getElementById('sum-avail').textContent = a;
    document.getElementById('sum-borrowed').textContent = b;
    document.getElementById('hdr-avail').textContent = a;
    document.getElementById('hdr-borrowed').textContent = b;
    document.getElementById('hdr-remain').textContent = a;
  }

  printRecord(id) {
    const r = this.records.find(r => r.id == id);
    if (!r) return;

    // Save record to localStorage so the evidence form can read it
    localStorage.setItem('print_record', JSON.stringify(r));

    // Open the new evidence form tab
    window.open('evidence-form.html', '_blank');
  }

  // =================== PHOTO MODAL ===================
  viewPhoto(id) {
    const r = this.records.find(r => r.id == id);
    if (!r || !r.photo) return;
    document.getElementById('photo-modal-img').src = r.photo;
    document.getElementById('photo-modal').classList.add('show');
  }

  viewReturnPhoto(id) {
    const r = this.records.find(r => r.id == id);
    if (!r || !r.returnPhoto) return;
    document.getElementById('photo-modal-img').src = r.returnPhoto;
    document.getElementById('photo-modal').classList.add('show');
  }

  closeModal(id) {
    document.getElementById(id).classList.remove('show');
  }

  // =================== PHOTO HELPERS ===================
  renderPhotoCell(url, methodName, id) {
    if (!url) return '<div class="no-photo">—</div>';

    // Check if it's a Drive link or a direct image base64
    const isDrive = url.includes('drive.google.com');

    if (isDrive) {
      return `
            <div style="display:flex; flex-direction:column; gap:4px; align-items:center;">
                <img class="photo-thumb" src="${url}" 
                    onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" 
                    onclick="app.${methodName}('${id}')">
                <button class="btn-return" style="padding:2px 6px; font-size:9px;" 
                    onclick="window.open('${url}', '_blank')">🔗 เปิดรูป</button>
            </div>`;
    }

    return `<img class="photo-thumb" src="${url}" onclick="app.${methodName}('${id}')">`;
  }

  // =================== EXPORT CSV ===================
  exportCSV() {
    const headers = ['หมายเลขวิทยุ', 'ชื่อผู้ยืม', 'เบอร์', 'แผนก', 'วันเวลายืม', 'วันเวลาคืน', 'สถานะ'];
    const rows = this.records.map(r => [
      r.radioId, r.name, r.phone, r.dept || '',
      new Date(r.borrowTime).toLocaleString('th-TH'),
      r.returnTime ? new Date(r.returnTime).toLocaleString('th-TH') : '',
      r.status === 'borrowed' ? 'ยืมอยู่' : 'คืนแล้ว'
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `radio-records-${Date.now()}.csv`;
    a.click();
    this.showToast('📊 Export สำเร็จ', 'info');
  }

  // =================== UTILS ===================
  formatTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
      ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  }

  // Settings functions removed as per request for hardcoded config
  openSettings() { this.showToast('ตั้งค่าถูกล็อกไว้ในไฟล์ config.js', 'info'); }
  closeSettings() { }
  saveSettings() { }

  // =================== TOAST & LOADING ===================
  showToast(msg, type = 'info') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast show ${type}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.className = 'toast', 3000);
  }

  showLoading(show) {
    this.isLoading = show;
    document.body.style.cursor = show ? 'wait' : 'default';
  }
}

// Global functions for HTML event handlers
let app;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  app = new RadioBorrowSystem();

  // Make global functions available for HTML onclick handlers
  window.handleLogin = (e) => app.handleLogin(e);
  window.handleLogout = () => app.handleLogout();
  window.switchTab = (tab) => app.switchTab(tab);
  window.startQR = () => app.startQR();
  window.startCamera = () => app.startCamera();
  window.snapPhoto = () => app.snapPhoto();
  window.retakePhoto = () => app.retakePhoto();
  window.startReturnCamera = () => app.startReturnCamera();
  window.snapReturnPhoto = () => app.snapReturnPhoto();
  window.retakeReturnPhoto = () => app.retakeReturnPhoto();
  window.handleReturnPhotoUpload = (input) => app.handleReturnPhotoUpload(input);
  window.submitBorrow = () => app.submitBorrow();
  window.confirmReturn = () => app.confirmReturn();
  window.filterReturn = () => app.renderReturnList();
  window.renderTable = () => app.renderTable();
  window.exportCSV = () => app.exportCSV();
  window.openSettings = () => app.openSettings();
  window.closeModal = (id) => app.closeModal(id);
});

// Legacy window.onload for compatibility
window.onload = () => {
  if (!app) {
    app = new RadioBorrowSystem();
  }
};
