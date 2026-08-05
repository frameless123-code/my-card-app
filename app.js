// ==========================================
// 全域變數與初始化
// ==========================================
let businessCards = JSON.parse(localStorage.getItem('cards')) || [];
let editingId = null;
let compressedPhotoData = "";
let originalPhotoData = ""; // 新增這行：用來記錄未裁切的原始高畫質圖片
let cropper = null; // 新增 Cropper 全域變數
// 取得自訂分類，若無則提供預設值
let categories = JSON.parse(localStorage.getItem('categories')) || ['未分類', 'VIP客戶', '一般客戶', '供應商'];

const form = document.getElementById('cardForm');
const cardList = document.getElementById('card-list');
const recentCardsContainer = document.getElementById('recent-cards-container');
const searchInput = document.getElementById('searchInput');

// 初始化載入 API Key
const apiKeyInput = document.getElementById('apiKeyInput');
if (apiKeyInput) {
    apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
}

// ==========================================
// UI 切換與儀表板更新
// ==========================================
function switchTab(tabId) {
    document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
    document.getElementById('view-' + tabId).classList.add('active');

    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    const activeNav = document.getElementById('nav-' + tabId);
    if (activeNav) activeNav.classList.add('active');

    if (tabId === 'home') {
        updateHomeCount();
        renderRecentCards(); // 切換到首頁時刷新橫向捲軸
    }
    if (tabId === 'add' && !editingId) prepareAddCard();
}

function updateHomeCount() {
    const countSpan = document.getElementById('total-cards-count');
    if (countSpan) countSpan.innerText = businessCards.length;
}

// ==========================================
// ⭐ 新增：渲染首頁「橫向滑動」的最近名片
// ==========================================
function renderRecentCards() {
    if (!recentCardsContainer) return;
    recentCardsContainer.innerHTML = '';

    // 取出最新的 5 張名片
    const recentCards = businessCards.slice(0, 5);

    if (recentCards.length === 0) {
        recentCardsContainer.innerHTML = '<p style="color:#aaa; padding:20px 0;">還沒有名片，趕快去新增吧！</p>';
        return;
    }

    recentCards.forEach(card => {
        const defaultImg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjZWVlIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIvPjwvc3ZnPg==';
        const imgSrc = card.photo || defaultImg;

        const cardHtml = `
            <div class="swipe-card" onclick="viewCardDetails(${card.id})">
                <img src="${imgSrc}" alt="名片預覽">
                <div>
                    <h4>${card.name || '未命名'}</h4>
                    <p>${card.company || '無公司資訊'}</p>
                </div>
            </div>
        `;
        recentCardsContainer.insertAdjacentHTML('beforeend', cardHtml);
    });
}

// ==========================================
// ⭐ 新增：Cropper.js 影像裁切流程
// ==========================================
document.getElementById('photoInput').addEventListener('change', function (event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        originalPhotoData = e.target.result; // 新增這行：把原始照片存起來備用
        // 1. 將選取的圖片載入到裁切器的 img 標籤中
        const imageToCrop = document.getElementById('imageToCrop');
        imageToCrop.src = e.target.result;

        // 2. 顯示全螢幕裁切彈窗
        document.getElementById('cropperModal').style.display = 'flex';

        // 3. 初始化 Cropper.js (若已有實例則先銷毀)
        if (cropper) cropper.destroy();
        cropper = new Cropper(imageToCrop, {
            viewMode: 1,
            autoCropArea: 0.9, // 預設框選 90% 區域
            background: false,
        });
    };
    reader.readAsDataURL(file);
});

function rotateCrop() {
    if (cropper) cropper.rotate(90);
}

function cancelCrop() {
    document.getElementById('cropperModal').style.display = 'none';
    document.getElementById('photoInput').value = ""; // 清除選取
    if (cropper) cropper.destroy();
}

function confirmCrop() {
    if (!cropper) return;

    // 取得裁切後的 Canvas 並壓縮 (設定最大寬度 800px 節省 AI 頻寬)
    const canvas = cropper.getCroppedCanvas({ maxWidth: 800 });
    compressedPhotoData = canvas.toDataURL('image/jpeg', 0.7);

    // 關閉彈窗與銷毀 cropper
    document.getElementById('cropperModal').style.display = 'none';
    cropper.destroy();
    cropper = null;

    // 將裁切好的圖片顯示在表單中
    const preview = document.getElementById('photoPreview');
    preview.src = compressedPhotoData;
    preview.style.display = 'block';

    // 新增這兩行：裁切完顯示提示文字
    const reeditHint = document.getElementById('reeditHint');
    if (reeditHint) reeditHint.style.display = 'block';

    // 顯示 AI 辨識按鈕
    document.getElementById('aiImageBtn').style.display = 'flex';
}

// 新增這個函數：點擊預覽圖時重新打開裁切器
function reopenCropper() {
    if (!originalPhotoData) return;
    const imageToCrop = document.getElementById('imageToCrop');
    imageToCrop.src = originalPhotoData;
    document.getElementById('cropperModal').style.display = 'flex';
    if (cropper) cropper.destroy();
    cropper = new Cropper(imageToCrop, {
        viewMode: 1,
        autoCropArea: 0.9,
        background: false,
    });
}

// ==========================================
// 表單狀態管理 (新增 vs 編輯)
// ==========================================
function prepareAddCard() {
    editingId = null;
    form.reset();

    // ⭐ 修改重點：手動清空每一個欄位的值，確保沒有上次修改的殘留
    document.getElementById('category').value = '未分類';
    document.getElementById('company').value = '';
    document.getElementById('name').value = '';
    document.getElementById('title').value = '';
    document.getElementById('email').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('mobile').value = '';
    document.getElementById('address').value = '';
    document.getElementById('notes').value = '';

    document.getElementById('photoPreview').style.display = 'none';

    const reeditHint = document.getElementById('reeditHint');
    if (reeditHint) reeditHint.style.display = 'none';
    originalPhotoData = "";

    document.getElementById('photoInput').value = "";
    compressedPhotoData = "";

    document.getElementById('submitBtn').innerHTML = '<span class="material-symbols-outlined">save</span> 儲存名片';
    document.getElementById('aiImageBtn').style.display = 'none';
}

function editCard(id) {
    const card = businessCards.find(c => c.id === id);
    if (!card) return;

    editingId = id;
    document.getElementById('category').value = card.category || '未分類';
    document.getElementById('company').value = card.company || '';
    document.getElementById('name').value = card.name || '';
    document.getElementById('title').value = card.title || '';
    document.getElementById('email').value = card.email || '';
    document.getElementById('phone').value = card.phone || '';
    document.getElementById('mobile').value = card.mobile || '';
    document.getElementById('address').value = card.address || '';
    document.getElementById('notes').value = card.notes || '';

    compressedPhotoData = "";
    originalPhotoData = card.photo || ""; // 新增這行：讓舊照片也能重新編輯
    const preview = document.getElementById('photoPreview');
    const reeditHint = document.getElementById('reeditHint'); // 新增這行

    if (card.photo) {
        preview.src = card.photo;
        preview.style.display = 'block';
        if (reeditHint) reeditHint.style.display = 'block'; // 新增這行
        document.getElementById('aiImageBtn').style.display = 'flex';
    } else {
        preview.style.display = 'none';
        if (reeditHint) reeditHint.style.display = 'none'; // 新增這行
        document.getElementById('aiImageBtn').style.display = 'none';
    }

    document.getElementById('submitBtn').innerHTML = '<span class="material-symbols-outlined">update</span> 更新名片';
    switchTab('add');
}

// ==========================================
// ⭐ 新增：查看名片詳細資料
// ==========================================
function viewCardDetails(id) {
    const card = businessCards.find(c => c.id === id);
    if (!card) return;

    // 處理沒有照片時的預設圖
    const defaultImg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjZWVlIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIvPjwvc3ZnPg==';
    const imgSrc = card.photo || defaultImg;

    // 準備詳細資料的 HTML
    const content = `
        <img src="${imgSrc}" style="width: 140px; height: 140px; object-fit: cover; border-radius: 50%; margin: 0 auto 15px; box-shadow: 0 6px 16px rgba(0,0,0,0.1); border: 4px solid var(--secondary-color);">
        <br>
        <span class="badge" style="display:inline-block; margin-bottom: 10px; font-size: 0.9rem;">${card.category || '未分類'}</span>
        <h2 style="margin: 0 0 5px 0; color: var(--primary-color); font-size: 1.8rem;">${card.name || '未命名'}</h2>
        <p style="margin: 0 0 5px 0; color: var(--accent-color); font-weight: bold; font-size: 1.1rem;">${card.title || '未填寫職位'}</p>
        <p style="margin: 0 0 25px 0; color: #888; font-size: 1rem;">${card.company || '未填寫公司'}</p>

        <div style="text-align: left; background: var(--secondary-color); padding: 20px; border-radius: 16px; margin-bottom: 20px;">
            ${card.mobile ? `<p style="margin: 8px 0; display:flex; align-items:center; gap:10px;"><span class="material-symbols-outlined" style="color:var(--primary-color);">smartphone</span> <a href="tel:${card.mobile}" style="color:var(--text-color); text-decoration:none; font-weight:bold; font-size:1.1rem;">${card.mobile}</a></p>` : ''}
            ${card.phone ? `<p style="margin: 8px 0; display:flex; align-items:center; gap:10px;"><span class="material-symbols-outlined" style="color:var(--primary-color);">call</span> <a href="tel:${card.phone}" style="color:var(--text-color); text-decoration:none; font-weight:bold; font-size:1.1rem;">${card.phone}</a></p>` : ''}
            ${card.email ? `<p style="margin: 8px 0; display:flex; align-items:center; gap:10px;"><span class="material-symbols-outlined" style="color:var(--primary-color);">mail</span> <a href="mailto:${card.email}" style="color:var(--text-color); text-decoration:none; font-size:1rem;">${card.email}</a></p>` : ''}
            ${card.address ? `<p style="margin: 8px 0; display:flex; align-items:start; gap:10px;"><span class="material-symbols-outlined" style="color:var(--primary-color);">location_on</span> <span style="font-size:1rem; line-height:1.4;">${card.address}</span></p>` : ''}
            ${card.notes ? `<div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #d1d9e6;"><strong style="color:var(--primary-color); display:flex; align-items:center; gap:5px;"><span class="material-symbols-outlined" style="font-size:18px;">edit_note</span> 備註事項</strong><p style="color:#666; font-size:0.95rem; line-height:1.5; margin:8px 0 0 0;">${card.notes.replace(/\n/g, '<br>')}</p></div>` : ''}
        </div>
    `;

    document.getElementById('detailContent').innerHTML = content;

    // 設定右上角「修改」按鈕的點擊事件
    document.getElementById('detailEditBtn').onclick = () => editCard(id);

    // 切換到詳細資料畫面
    switchTab('detail');
}

// ==========================================
// 儲存、刪除與列表渲染
// ==========================================
form.addEventListener('submit', function (event) {
    event.preventDefault();
    const cardData = {
        category: document.getElementById('category').value,
        company: document.getElementById('company').value,
        name: document.getElementById('name').value,
        title: document.getElementById('title').value,
        phone: document.getElementById('phone').value,
        mobile: document.getElementById('mobile').value,
        email: document.getElementById('email').value,
        address: document.getElementById('address').value,
        notes: document.getElementById('notes').value,
        photo: compressedPhotoData
    };

    let successMessage = ""; // 準備成功訊息

    if (editingId) {
        const index = businessCards.findIndex(card => card.id === editingId);
        if (index !== -1) {
            if (!compressedPhotoData) cardData.photo = businessCards[index].photo;
            businessCards[index] = { ...businessCards[index], ...cardData };
        }
        successMessage = '✅ 更新成功！';
    } else {
        cardData.id = Date.now();
        businessCards.unshift(cardData);
        successMessage = '✅ 儲存成功！';
    }

    try { localStorage.setItem('cards', JSON.stringify(businessCards)); } catch (e) { alert("⚠️ 空間不足！"); }
    renderCards();

    // ⭐ 修改重點：先清空表單與切換頁面，最後再跳提示
    prepareAddCard();
    switchTab('home');

    // 使用 setTimeout 讓 UI 有時間完成跳轉渲染，避免畫面卡死
    setTimeout(() => {
        alert(successMessage);
    }, 100);
});

function deleteCard(id, event) {
    if (event) event.stopPropagation(); // 防止點擊刪除時觸發卡片編輯
    if (confirm("確定刪除這張名片？")) {
        businessCards = businessCards.filter(card => card.id !== id);
        localStorage.setItem('cards', JSON.stringify(businessCards));
        renderCards();
        if (document.getElementById('view-home').classList.contains('active')) {
            renderRecentCards();
            updateHomeCount();
        }
    }
}

function renderCards() {
    cardList.innerHTML = '';
    const searchTerm = searchInput.value.toLowerCase();

    // 取得排序條件 (若找不到選單則預設 newest)
    const sortSelect = document.getElementById('sortSelect');
    const sortType = sortSelect ? sortSelect.value : 'newest';

    let filteredCards = businessCards.filter(card => {
        return (card.name && card.name.toLowerCase().includes(searchTerm)) ||
            (card.company && card.company.toLowerCase().includes(searchTerm));
    });

    // 執行排序邏輯
    if (sortType === 'oldest') {
        filteredCards.sort((a, b) => a.id - b.id);
    } else if (sortType === 'category') {
        filteredCards.sort((a, b) => (a.category || '').localeCompare(b.category || ''));
    } else {
        filteredCards.sort((a, b) => b.id - a.id); // 預設 newest
    }

    filteredCards.forEach(card => {
        const photoHtml = card.photo ? `<img src="${card.photo}" style="width:70px; height:70px; object-fit:cover; border-radius:12px; margin-right:15px;">` : '';

        // ⭐ 新增：一鍵撥號與信箱 (Click-to-Action) 加上 event.stopPropagation() 防止觸發卡片編輯
        const phoneHtml = card.phone ? `<a href="tel:${card.phone}" style="color:var(--accent-color); text-decoration:none; margin-right:15px;" onclick="event.stopPropagation()"><span class="material-symbols-outlined" style="font-size:16px; vertical-align:text-bottom;">call</span> ${card.phone}</a>` : '';
        const mobileHtml = card.mobile ? `<a href="tel:${card.mobile}" style="color:var(--accent-color); text-decoration:none; margin-right:15px;" onclick="event.stopPropagation()"><span class="material-symbols-outlined" style="font-size:16px; vertical-align:text-bottom;">smartphone</span> ${card.mobile}</a>` : '';
        const emailHtml = card.email ? `<a href="mailto:${card.email}" style="color:var(--accent-color); text-decoration:none;" onclick="event.stopPropagation()"><span class="material-symbols-outlined" style="font-size:16px; vertical-align:text-bottom;">mail</span> Email</a>` : '';
        const contactHtml = (phoneHtml || mobileHtml || emailHtml) ? `<div style="margin-top:8px; font-size:0.9rem; font-weight:bold; display:flex; flex-wrap:wrap; gap:8px;">${phoneHtml}${mobileHtml}${emailHtml}</div>` : '';

        const cardElement = document.createElement('div');
        cardElement.className = 'form-card';
        cardElement.style.display = 'flex';
        cardElement.style.alignItems = 'center';
        cardElement.style.cursor = 'pointer';
        cardElement.onclick = () => viewCardDetails(card.id);

        cardElement.innerHTML = `
            ${photoHtml}
            <div style="flex:1;">
                <span class="badge">${card.category || '未分類'}</span>
                <h3 style="margin:5px 0 2px 0; color:var(--primary-color);">${card.name}</h3>
                <p style="margin:0; font-size:0.85rem; color:#888;">${card.company}</p>
                ${contactHtml}
            </div>
            <button onclick="deleteCard(${card.id}, event)" style="background:transparent; border:none; color:#FF6B6B; cursor:pointer; padding: 10px;">
                <span class="material-symbols-outlined">delete</span>
            </button>
        `;
        cardList.appendChild(cardElement);
    });
}
searchInput.addEventListener('input', renderCards);

// ==========================================
// AI 與設定邏輯
// ==========================================
function saveSettings() {
    const key = apiKeyInput.value.trim();
    if (key) {
        localStorage.setItem('gemini_api_key', key);
        alert('✅ API Key 已儲存！');
        switchTab('home');
    }
}

// ==========================================
// AI 影像辨識 (支援多模型備援機制)
// ==========================================
async function recognizeCardWithAI() {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) return alert('⚠️ 請先到「設定」輸入 API Key！');
    const btn = document.getElementById('aiImageBtn');
    btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> 讀取中...';

    // 定義要依序嘗試的模型清單 (優先順序：由上到下)
    const modelsToTry = [
        'gemini-3.5-flash-lite',      
        'gemini-3.1-flash-lite'  
    ];

    const base64Image = compressedPhotoData.split(',')[1];
    const payload = {
        contents: [{
            parts: [
                { text: "提取聯絡資訊為 JSON：name, company, title, email, phone (公司電話/市話), mobile (行動電話/手機), address。找不到留空。" },
                { inline_data: { mime_type: "image/jpeg", data: base64Image } }
            ]
        }]
    };

    let successData = null;

    for (const model of modelsToTry) {
        try {
            console.log(`📸 正在嘗試圖片辨識模型: ${model}...`);
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            // 如果狀態碼不是 2xx (例如 429 Too Many Requests 或 500)，拋出錯誤進到 catch
            if (!res.ok) throw new Error(`HTTP 錯誤: ${res.status}`);

            successData = await res.json();
            break; // ⭐ 如果成功執行到這裡，就跳出迴圈，不再嘗試下一個模型

        } catch (e) {
            console.warn(`⚠️ 模型 ${model} 失敗，準備嘗試下一個...`, e.message);
        }
    }

    // 判斷是否所有模型都失敗
    if (successData && successData.candidates) {
        fillFormWithAI(successData.candidates[0].content.parts[0].text);
    } else {
        alert('❌ 所有 AI 模型皆無回應，請稍後重試或改用文字解析。');
    }

    btn.innerHTML = '<span class="material-symbols-outlined">auto_awesome</span> AI 自動讀圖填寫';
}

// ==========================================
// AI 文字辨識 (支援多模型備援機制)
// ==========================================
async function parseTextWithAI() {
    const apiKey = localStorage.getItem('gemini_api_key');
    const rawText = document.getElementById('rawTextInput').value.trim();
    if (!apiKey || !rawText) return alert('⚠️ 請確認已輸入 API Key 並貼上文字！');
    const btn = document.getElementById('aiTextBtn');
    btn.innerText = '整理中...';

    const modelsToTry = [
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite'  
    ];

    const payload = {
        contents: [{
            parts: [{ text: "提取以下名片文字為 JSON：name, company, title, email, phone (公司電話/市話), mobile (行動電話/手機), address。找不到留空。\n" + rawText }]
        }]
    };

    let successData = null;

    for (const model of modelsToTry) {
        try {
            console.log(`📝 正在嘗試文字解析模型: ${model}...`);
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error(`HTTP 錯誤: ${res.status}`);

            successData = await res.json();
            break; // ⭐ 成功則中斷迴圈

        } catch (e) {
            console.warn(`⚠️ 模型 ${model} 失敗，準備嘗試下一個...`, e.message);
        }
    }

    if (successData && successData.candidates) {
        fillFormWithAI(successData.candidates[0].content.parts[0].text);
        document.getElementById('rawTextInput').value = ""; // 成功後清空輸入框
    } else {
        alert('❌ 所有 AI 模型皆無回應，請確認網路連線或 API Key 額度。');
    }

    btn.innerText = '智慧文字解析';
}

function fillFormWithAI(aiText) {
    try {
        const cardData = JSON.parse(aiText.replace(/```json/g, '').replace(/```/g, '').trim());
        if (cardData.company) document.getElementById('company').value = cardData.company;
        if (cardData.name) document.getElementById('name').value = cardData.name;
        if (cardData.title) document.getElementById('title').value = cardData.title;
        if (cardData.email) document.getElementById('email').value = cardData.email;
        if (cardData.phone) document.getElementById('phone').value = cardData.phone;
        if (cardData.mobile) document.getElementById('mobile').value = cardData.mobile;
        if (cardData.address) document.getElementById('address').value = cardData.address;
    } catch (e) { console.error("JSON 轉換失敗"); }
}

// ==========================================
// 自訂分類管理邏輯
// ==========================================

// 1. 渲染新增/編輯表單中的下拉選單
function renderCategoryOptions() {
    const select = document.getElementById('category');
    if (!select) return;
    select.innerHTML = '';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        select.appendChild(option);
    });
}

// 2. 渲染設定頁面中的標籤列表
function renderCategoryTags() {
    const list = document.getElementById('category-list');
    if (!list) return;
    list.innerHTML = '';
    categories.forEach(cat => {
        const tag = document.createElement('div');
        tag.style.cssText = 'background: #E2E8F0; color: var(--text-color); padding: 6px 14px; border-radius: 20px; font-size: 0.85rem; font-weight: bold; display: flex; align-items: center; gap: 6px;';

        // 「未分類」為系統預設，不提供刪除按鈕
        tag.innerHTML = `
            ${cat}
            ${cat !== '未分類' ? `<span class="material-symbols-outlined" style="font-size: 16px; cursor: pointer; color: #FF6B6B;" onclick="deleteCategory('${cat}')">close</span>` : ''}
        `;
        list.appendChild(tag);
    });
}

// 3. 新增分類
function addCategory() {
    const input = document.getElementById('newCategoryInput');
    const newCat = input.value.trim();

    if (!newCat) return;
    if (categories.includes(newCat)) return alert('⚠️ 此分類已經存在囉！');

    categories.push(newCat);
    localStorage.setItem('categories', JSON.stringify(categories));
    input.value = ''; // 清空輸入框

    renderCategoryOptions();
    renderCategoryTags();
}

// 4. 刪除分類
function deleteCategory(cat) {
    if (cat === '未分類') return;

    if (confirm(`確定要刪除「${cat}」分類嗎？\n(原本屬於此分類的名片，將會自動被歸為「未分類」)`)) {
        // 從陣列移除並存檔
        categories = categories.filter(c => c !== cat);
        localStorage.setItem('categories', JSON.stringify(categories));

        // 將現有被刪除分類的名片，洗回「未分類」
        let modified = false;
        businessCards.forEach(card => {
            if (card.category === cat) {
                card.category = '未分類';
                modified = true;
            }
        });

        // 如果有名片被修改到，就重新存檔並刷新列表
        if (modified) {
            localStorage.setItem('cards', JSON.stringify(businessCards));
            renderCards();
        }

        renderCategoryOptions();
        renderCategoryTags();
    }
}

// ==========================================
// ⭐ 新增：資料備份與還原 (匯出/匯入 JSON)
// ==========================================
function exportData() {
    if (businessCards.length === 0) {
        return alert('⚠️ 目前沒有名片資料可以備份喔！');
    }

    // 將陣列轉為 JSON 字串，並建立 Blob 檔案物件
    const dataStr = JSON.stringify(businessCards);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // 建立隱藏的下載連結並自動點擊
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().slice(0, 10); // 取得當前日期
    a.download = `名片備份_${date}.json`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const importedCards = JSON.parse(e.target.result);

            // 簡單防呆：確認匯入的是不是陣列格式
            if (!Array.isArray(importedCards)) throw new Error("檔案格式錯誤");

            // 如果原本已經有名片，詢問要合併還是覆蓋
            if (businessCards.length > 0) {
                const confirmMerge = confirm("要將匯入的資料與現有的名片「合併」嗎？\n(按「確定」合併，按「取消」則清空現有資料並完全覆蓋)");
                if (confirmMerge) {
                    const existingIds = new Set(businessCards.map(c => c.id));
                    importedCards.forEach(card => {
                        if (!existingIds.has(card.id)) businessCards.push(card);
                    });
                } else {
                    businessCards = importedCards;
                }
            } else {
                businessCards = importedCards;
            }

            // ⭐ 新增：自動掃描並建立缺失的分類標籤
            importedCards.forEach(card => {
                if (card.category && !categories.includes(card.category)) {
                    categories.push(card.category);
                }
            });

            // 儲存所有更新到 localStorage
            localStorage.setItem('cards', JSON.stringify(businessCards));
            localStorage.setItem('categories', JSON.stringify(categories)); // 儲存更新後的分類

            // 重新渲染畫面上的所有元素
            renderCards();
            updateHomeCount();
            renderCategoryOptions(); // 刷新表單下拉選單
            renderCategoryTags();    // 刷新設定頁面標籤列表

            if (document.getElementById('view-home').classList.contains('active')) renderRecentCards();

            alert('✅ 備份資料與分類標籤還原成功！');
        } catch (error) {
            alert('❌ 檔案格式不正確，還原失敗！');
            console.error(error);
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

// ==========================================
// 匯出為 CSV 格式 (Excel 可讀)
// ==========================================
function exportCSV() {
    if (businessCards.length === 0) {
        return alert('⚠️ 目前沒有名片資料可以匯出喔！');
    }

    // 加入 BOM 以解決 Excel 打開 CSV 時的中文亂碼問題
    let csvContent = "\uFEFF";
    csvContent += "分類,姓名,公司,職位,公司電話,行動電話,Email,地址,備註\n";

    businessCards.forEach(card => {
        // 處理內容，避免使用者輸入的逗號或換行符號破壞 CSV 格式
        const row = [
            card.category || '',
            card.name || '',
            card.company || '',
            card.title || '',
            card.phone || '',
            card.mobile || '',
            card.email || '',
            card.address || '',
            card.notes || ''
        ].map(field => `"${String(field).replace(/"/g, '""')}"`); // 雙引號跳脫處理

        csvContent += row.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `聯絡人清單_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 啟動載入

renderCategoryOptions(); // 加入這行
renderCategoryTags();    // 加入這行

renderCards();
renderRecentCards();
updateHomeCount();