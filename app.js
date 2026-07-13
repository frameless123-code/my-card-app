// ==========================================
// 全域變數與初始化
// ==========================================
let businessCards = JSON.parse(localStorage.getItem('cards')) || [];
let editingId = null;
let compressedPhotoData = "";
let originalPhotoData = ""; // 新增這行：用來記錄未裁切的原始高畫質圖片
let cropper = null; // 新增 Cropper 全域變數

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
            <div class="swipe-card" onclick="editCard(${card.id})">
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
    document.getElementById('photoPreview').style.display = 'none';

    // 新增這兩行：清空重裁提示與舊資料
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
        email: document.getElementById('email').value,
        address: document.getElementById('address').value,
        notes: document.getElementById('notes').value,
        photo: compressedPhotoData
    };

    if (editingId) {
        const index = businessCards.findIndex(card => card.id === editingId);
        if (index !== -1) {
            if (!compressedPhotoData) cardData.photo = businessCards[index].photo;
            businessCards[index] = { ...businessCards[index], ...cardData };
        }
        alert('✅ 更新成功！');
    } else {
        cardData.id = Date.now();
        businessCards.unshift(cardData);
        alert('✅ 儲存成功！');
    }

    try { localStorage.setItem('cards', JSON.stringify(businessCards)); } catch (e) { alert("⚠️ 空間不足！"); }
    renderCards();
    switchTab('home'); // 儲存完回到首頁看結果
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

    const filteredCards = businessCards.filter(card => {
        return (card.name && card.name.toLowerCase().includes(searchTerm)) ||
            (card.company && card.company.toLowerCase().includes(searchTerm));
    });

    filteredCards.forEach(card => {
        const photoHtml = card.photo ? `<img src="${card.photo}" style="width:70px; height:70px; object-fit:cover; border-radius:12px; margin-right:15px;">` : '';
        const cardElement = document.createElement('div');
        cardElement.className = 'form-card';
        cardElement.style.display = 'flex';
        cardElement.style.alignItems = 'center';
        cardElement.style.cursor = 'pointer';
        cardElement.onclick = () => editCard(card.id); // 點擊整張卡片可編輯

        cardElement.innerHTML = `
            ${photoHtml}
            <div style="flex:1;">
                <span class="badge">${card.category || '未分類'}</span>
                <h3 style="margin:5px 0 2px 0; color:var(--primary-color);">${card.name}</h3>
                <p style="margin:0; font-size:0.85rem; color:#888;">${card.company}</p>
            </div>
            <button onclick="deleteCard(${card.id}, event)" style="background:transparent; border:none; color:#FF6B6B; cursor:pointer;">
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

async function recognizeCardWithAI() {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) return alert('⚠️ 請先到「設定」輸入 API Key！');
    const btn = document.getElementById('aiImageBtn');
    btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> 讀取中...';

    try {
        const base64Image = compressedPhotoData.split(',')[1];
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: "提取聯絡資訊為 JSON：name, company, title, email, phone, address。找不到留空。" }, { inline_data: { mime_type: "image/jpeg", data: base64Image } }] }] })
        });
        const data = await res.json();
        fillFormWithAI(data.candidates[0].content.parts[0].text);
    } catch (e) { alert('❌ 失敗，請重試或改用純文字。'); }
    finally { btn.innerHTML = '<span class="material-symbols-outlined">auto_awesome</span> AI 自動讀圖填寫'; }
}

async function parseTextWithAI() {
    const apiKey = localStorage.getItem('gemini_api_key');
    const rawText = document.getElementById('rawTextInput').value.trim();
    if (!apiKey || !rawText) return alert('⚠️ 請確認已輸入 API Key 並貼上文字！');
    const btn = document.getElementById('aiTextBtn');
    btn.innerText = '整理中...';

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: "提取以下名片文字為 JSON：name, company, title, email, phone, address。找不到留空。\n" + rawText }] }] })
        });
        const data = await res.json();
        fillFormWithAI(data.candidates[0].content.parts[0].text);
        document.getElementById('rawTextInput').value = "";
    } catch (e) { alert('❌ 失敗：' + e.message); }
    finally { btn.innerText = '智慧文字解析'; }
}

function fillFormWithAI(aiText) {
    try {
        const cardData = JSON.parse(aiText.replace(/```json/g, '').replace(/```/g, '').trim());
        if (cardData.company) document.getElementById('company').value = cardData.company;
        if (cardData.name) document.getElementById('name').value = cardData.name;
        if (cardData.title) document.getElementById('title').value = cardData.title;
        if (cardData.email) document.getElementById('email').value = cardData.email;
        if (cardData.phone) document.getElementById('phone').value = cardData.phone;
        if (cardData.address) document.getElementById('address').value = cardData.address;
    } catch (e) { console.error("JSON 轉換失敗"); }
}

// 啟動載入
renderCards();
renderRecentCards();
updateHomeCount();