// ==========================================
// 全域變數與初始化
// ==========================================
let businessCards = [];
let editingId = null;
let compressedPhotoData = "";
let compressedPhotoBlob = null;
let previewObjectUrl = "";
let originalPhotoData = ""; // 新增這行：用來記錄未裁切的原始高畫質圖片
let cropper = null; // 新增 Cropper 全域變數
// 目前在名片庫套用的分類篩選；null 代表顯示全部
let activeCategoryFilter = null;
let cropRotation = 0;

function openCropperModal() {
    const modal = document.getElementById('cropperModal');

    modal.style.display = 'flex';
    document.documentElement.classList.add('cropper-open');
    document.body.classList.add('cropper-open');

    // 避免先前旋轉造成頁面保留水平偏移
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
}

function closeCropperModal() {
    const modal = document.getElementById('cropperModal');

    modal.style.display = 'none';
    document.documentElement.classList.remove('cropper-open');
    document.body.classList.remove('cropper-open');

    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
}

function createCropper(imageElement) {
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }

    cropRotation = 0;

    cropper = new Cropper(imageElement, {
        viewMode: 1,

        /* 預設裁切框盡量放大 */
        autoCropArea: 1,

        background: false,
        responsive: true,
        restore: false,
        checkOrientation: true,

        dragMode: 'move',
        movable: true,
        zoomable: true,
        zoomOnTouch: true,
        zoomOnWheel: true,

        rotatable: true,
        cropBoxMovable: true,
        cropBoxResizable: true,

        toggleDragModeOnDblclick: false
    });
}


// ==========================================
// IndexedDB 與圖片 URL 管理
// ==========================================
function revokePreviewObjectUrl() {
    if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = "";
    }
}

function releaseCardPhotoUrls() {
    businessCards.forEach(card => {
        if (card.photoUrl) URL.revokeObjectURL(card.photoUrl);
    });
}

async function loadCardsFromDatabase() {
    releaseCardPhotoUrls();

    const storedCards = await CardDB.getAllCards();
    businessCards = storedCards
        .map(card => ({
            ...card,
            photoUrl: card.photoBlob
                ? URL.createObjectURL(card.photoBlob)
                : ""
        }))
        .sort((a, b) => (b.id || 0) - (a.id || 0));
}

function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.78) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('圖片壓縮失敗。'));
            }
        }, type, quality);
    });
}

function showPhotoPreviewFromBlob(blob) {
    const preview = document.getElementById('photoPreview');
    revokePreviewObjectUrl();

    if (!blob) {
        preview.removeAttribute('src');
        preview.style.display = 'none';
        return;
    }

    previewObjectUrl = URL.createObjectURL(blob);
    preview.src = previewObjectUrl;
    preview.style.display = 'block';
}

// 取得自訂分類，若無則提供預設值
let categories = JSON.parse(localStorage.getItem('categories')) || ['未分類', 'VIP客戶', '一般客戶', '供應商'];

const form = document.getElementById('cardForm');
const cardList = document.getElementById('card-list');
const recentCardsContainer = document.getElementById('recent-cards-container');
const searchInput = document.getElementById('searchInput');
const categoryStatsContainer =
    document.getElementById('category-stats-container');

const activeFilterBar =
    document.getElementById('active-filter-bar');

const activeFilterText =
    document.getElementById('active-filter-text');

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

    // 新增這段
    if (tabId === 'list') {
        renderCards();
    }

    if (tabId === 'add' && !editingId) prepareAddCard();
}

function updateHomeCount() {
    const countSpan = document.getElementById('total-cards-count');

    if (countSpan) {
        countSpan.innerText = businessCards.length;
    }

    // 同時更新首頁標籤人數
    renderCategoryStats();
}

// 空白分類統一當作「未分類」
function getCardCategory(card) {
    const category = String(card.category || '').trim();
    return category || '未分類';
}

// 渲染首頁各標籤的人數
function renderCategoryStats() {
    if (!categoryStatsContainer) return;

    categoryStatsContainer.innerHTML = '';

    categories.forEach(category => {
        const categoryName = String(category);

        const count = businessCards.filter(card =>
            getCardCategory(card) === categoryName
        ).length;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'category-stat-card';

        const countElement = document.createElement('span');
        countElement.className = 'category-stat-count';
        countElement.textContent = `${count} 人`;

        const nameElement = document.createElement('span');
        nameElement.className = 'category-stat-name';
        nameElement.textContent = categoryName;
        nameElement.title = categoryName;

        button.appendChild(countElement);
        button.appendChild(nameElement);

        button.addEventListener('click', () => {
            filterByCategory(categoryName);
        });

        categoryStatsContainer.appendChild(button);
    });
}

// 顯示全部名片
function showAllCards() {
    activeCategoryFilter = null;

    if (searchInput) {
        searchInput.value = '';
    }

    switchTab('list');
}

// 從首頁點擊某個標籤
function filterByCategory(category) {
    activeCategoryFilter = category;

    // 避免舊搜尋文字影響分類結果
    if (searchInput) {
        searchInput.value = '';
    }

    switchTab('list');
}

// 清除分類，但保留目前搜尋文字
function clearCategoryFilter() {
    activeCategoryFilter = null;
    renderCards();
}

// 顯示目前使用中的分類
function updateActiveFilterUI(resultCount) {
    if (!activeFilterBar || !activeFilterText) return;

    if (activeCategoryFilter) {
        activeFilterBar.style.display = 'flex';
        activeFilterText.textContent =
            `標籤：${activeCategoryFilter}（目前 ${resultCount} 人）`;
    } else {
        activeFilterBar.style.display = 'none';
        activeFilterText.textContent = '';
    }
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
        const imgSrc = card.photoUrl || defaultImg;

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
        originalPhotoData = e.target.result;

        const imageToCrop = document.getElementById('imageToCrop');

        imageToCrop.onload = function () {
            openCropperModal();
            createCropper(imageToCrop);
        };

        imageToCrop.src = e.target.result;
    };
    reader.readAsDataURL(file);
});

function rotateCrop() {
    if (!cropper) return;

    cropRotation = (cropRotation + 90) % 360;
    cropper.rotateTo(cropRotation);

    requestAnimationFrame(() => {
        document.documentElement.scrollLeft = 0;
        document.body.scrollLeft = 0;

        const workspace = document.querySelector('.cropper-workspace');
        if (workspace) {
            workspace.scrollLeft = 0;
        }
    });
}

function cancelCrop() {
    closeCropperModal();

    document.getElementById('photoInput').value = '';

    if (cropper) {
        cropper.destroy();
        cropper = null;
    }

    cropRotation = 0;
}

async function confirmCrop() {
    if (!cropper) return;

    try {
        const canvas = cropper.getCroppedCanvas({
            maxWidth: 1200,
            maxHeight: 1200,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
            fillColor: '#ffffff'
        });

        if (!canvas) throw new Error('無法取得裁切圖片。');

        compressedPhotoBlob = await canvasToBlob(canvas, 'image/jpeg', 0.78);
        compressedPhotoData = "";

        closeCropperModal();
        cropper.destroy();
        cropper = null;
        cropRotation = 0;

        showPhotoPreviewFromBlob(compressedPhotoBlob);

        const reeditHint = document.getElementById('reeditHint');
        if (reeditHint) reeditHint.style.display = 'block';

        document.getElementById('aiImageBtn').style.display = 'flex';
    } catch (error) {
        console.error('裁切圖片失敗：', error);
        alert('❌ 圖片裁切失敗，請重新選取圖片。');
    }
}

// 新增這個函數：點擊預覽圖時重新打開裁切器
function reopenCropper() {
    if (!originalPhotoData) return;

    const imageToCrop = document.getElementById('imageToCrop');

    imageToCrop.onload = function () {
        openCropperModal();
        createCropper(imageToCrop);
    };

    imageToCrop.src = originalPhotoData;
}

// ==========================================
// 表單狀態管理 (新增 vs 編輯)
// ==========================================
function prepareAddCard() {
    editingId = null;
    form.reset();

    document.getElementById('category').value = '未分類';
    document.getElementById('company').value = '';
    document.getElementById('name').value = '';
    document.getElementById('title').value = '';
    document.getElementById('email').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('mobile').value = '';
    document.getElementById('address').value = '';
    document.getElementById('notes').value = '';

    revokePreviewObjectUrl();
    const preview = document.getElementById('photoPreview');
    preview.removeAttribute('src');
    preview.style.display = 'none';

    const reeditHint = document.getElementById('reeditHint');
    if (reeditHint) reeditHint.style.display = 'none';

    originalPhotoData = "";
    compressedPhotoData = "";
    compressedPhotoBlob = null;

    document.getElementById('photoInput').value = "";
    document.getElementById('submitBtn').innerHTML = '<span class="material-symbols-outlined">save</span> 儲存名片';
    document.getElementById('aiImageBtn').style.display = 'none';
}

async function editCard(id) {
    try {
        // 直接從 IndexedDB 取得完整資料，避免只依賴畫面上的暫存物件。
        const card = await CardDB.getCard(id);
        if (!card) {
            alert('⚠️ 找不到這張名片，請重新整理後再試。');
            return;
        }

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

        // 編輯時保留原本的 Blob；沒有重新選圖也不會把照片清掉。
        compressedPhotoBlob = card.photoBlob instanceof Blob
            ? card.photoBlob
            : null;
        compressedPhotoData = '';
        originalPhotoData = compressedPhotoBlob
            ? await CardDB.blobToDataUrl(compressedPhotoBlob)
            : '';

        const reeditHint = document.getElementById('reeditHint');

        if (compressedPhotoBlob) {
            // 使用獨立的預覽 URL，不共用列表中的 photoUrl。
            showPhotoPreviewFromBlob(compressedPhotoBlob);
            if (reeditHint) reeditHint.style.display = 'block';
            document.getElementById('aiImageBtn').style.display = 'flex';
        } else {
            showPhotoPreviewFromBlob(null);
            if (reeditHint) reeditHint.style.display = 'none';
            document.getElementById('aiImageBtn').style.display = 'none';
        }

        document.getElementById('submitBtn').innerHTML =
            '<span class="material-symbols-outlined">update</span> 更新名片';
        switchTab('add');
    } catch (error) {
        console.error('讀取名片失敗：', error);
        alert('❌ 無法讀取這張名片，請重新整理後再試。');
    }
}

// ==========================================
// ⭐ 新增：查看名片詳細資料
// ==========================================
function viewCardDetails(id) {
    const card = businessCards.find(c => c.id === id);
    if (!card) return;

    // 處理沒有照片時的預設圖
    const defaultImg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjZWVlIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIvPjwvc3ZnPg==';
    const imgSrc = card.photoUrl || defaultImg;

    // 準備詳細資料的 HTML
    const content = `
        <img src="${imgSrc}" style="width: 100%; max-width: 400px; height: auto; border-radius: 16px; margin: 0 auto 20px; box-shadow: 0 8px 24px rgba(74, 67, 106, 0.15); display: block; border: 1px solid #E2E8F0;">
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
form.addEventListener('submit', async function (event) {
    event.preventDefault();

    const submitBtn = document.getElementById('submitBtn');
    const currentEditingId = editingId;
    const wasEditing = currentEditingId !== null;
    const now = Date.now();

    submitBtn.disabled = true;
    submitBtn.innerHTML =
        '<span class="material-symbols-outlined">hourglass_empty</span> 儲存中...';

    try {
        // 更新時直接讀取資料庫裡的舊資料，確保原照片一定能被保留。
        const existingCard = wasEditing
            ? await CardDB.getCard(currentEditingId)
            : null;

        if (wasEditing && !existingCard) {
            throw new Error('找不到要更新的名片。');
        }

        const preservedPhotoBlob = compressedPhotoBlob instanceof Blob
            ? compressedPhotoBlob
            : (existingCard?.photoBlob instanceof Blob
                ? existingCard.photoBlob
                : null);

        const cardData = {
            id: wasEditing ? currentEditingId : now,
            category: document.getElementById('category').value,
            company: document.getElementById('company').value.trim(),
            name: document.getElementById('name').value.trim(),
            title: document.getElementById('title').value.trim(),
            phone: document.getElementById('phone').value.trim(),
            mobile: document.getElementById('mobile').value.trim(),
            email: document.getElementById('email').value.trim(),
            address: document.getElementById('address').value.trim(),
            notes: document.getElementById('notes').value.trim(),
            photoBlob: preservedPhotoBlob,
            createdAt: existingCard?.createdAt || now,
            updatedAt: now
        };

        await CardDB.putCard(cardData);
        await loadCardsFromDatabase();

        const successMessage = wasEditing
            ? '✅ 更新成功！'
            : '✅ 儲存成功！';

        prepareAddCard();
        switchTab('home');
        alert(successMessage);
    } catch (error) {
        console.error('IndexedDB 儲存失敗：', error);
        alert('❌ 名片儲存失敗，原有資料不會被覆蓋。請重新整理後再試。');

        // 儲存失敗時保留編輯狀態與按鈕文字。
        editingId = currentEditingId;
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = editingId !== null
            ? '<span class="material-symbols-outlined">update</span> 更新名片'
            : '<span class="material-symbols-outlined">save</span> 儲存名片';
    }
});

async function deleteCard(id, event) {
    if (event) event.stopPropagation();
    if (!confirm('確定刪除這張名片？')) return;

    try {
        await CardDB.deleteCard(id);
        await loadCardsFromDatabase();
        renderCards();
        renderRecentCards();
        updateHomeCount();
    } catch (error) {
        console.error('刪除名片失敗：', error);
        alert('❌ 刪除失敗，請稍後再試。');
    }
}

function renderCards() {
    if (!cardList || !searchInput) return;

    cardList.innerHTML = '';

    // 支援輸入多個關鍵字，例如：供應商 王小姐
    const keywords = searchInput.value
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

    const sortSelect = document.getElementById('sortSelect');
    const sortType = sortSelect ? sortSelect.value : 'newest';

    let filteredCards = businessCards.filter(card => {
        const cardCategory = getCardCategory(card);

        // 先檢查首頁點擊的分類篩選
        if (
            activeCategoryFilter &&
            cardCategory !== activeCategoryFilter
        ) {
            return false;
        }

        // 可以搜尋所有主要欄位，包括標籤分類
        const searchableText = [
            cardCategory,
            card.name,
            card.company,
            card.title,
            card.phone,
            card.mobile,
            card.email,
            card.address,
            card.notes
        ]
            .map(value => String(value || '').toLowerCase())
            .join(' ');

        // 多個關鍵字必須全部符合
        return keywords.every(keyword =>
            searchableText.includes(keyword)
        );
    });

    if (sortType === 'oldest') {
        filteredCards.sort((a, b) => a.id - b.id);
    } else if (sortType === 'category') {
        filteredCards.sort((a, b) =>
            getCardCategory(a).localeCompare(
                getCardCategory(b),
                'zh-TW'
            )
        );
    } else {
        filteredCards.sort((a, b) => b.id - a.id);
    }

    updateActiveFilterUI(filteredCards.length);

    if (filteredCards.length === 0) {
        cardList.innerHTML = `
            <div class="form-card"
                 style="text-align:center; color:#888; padding:30px 20px;">
                <span class="material-symbols-outlined"
                      style="font-size:42px; color:#CBD5E0;">
                    search_off
                </span>
                <p style="margin:10px 0 0;">
                    找不到符合條件的名片
                </p>
            </div>
        `;
        return;
    }

    filteredCards.forEach(card => {
        const photoHtml = card.photoUrl
            ? `<img src="${card.photoUrl}"
                    style="width:70px;
                           height:70px;
                           object-fit:cover;
                           border-radius:12px;
                           margin-right:15px;">`
            : '';

        const phoneHtml = card.phone
            ? `<a href="tel:${card.phone}"
                  style="color:var(--accent-color);
                         text-decoration:none;
                         margin-right:15px;"
                  onclick="event.stopPropagation()">
                    <span class="material-symbols-outlined"
                          style="font-size:16px;
                                 vertical-align:text-bottom;">
                        call
                    </span>
                    ${card.phone}
               </a>`
            : '';

        const mobileHtml = card.mobile
            ? `<a href="tel:${card.mobile}"
                  style="color:var(--accent-color);
                         text-decoration:none;
                         margin-right:15px;"
                  onclick="event.stopPropagation()">
                    <span class="material-symbols-outlined"
                          style="font-size:16px;
                                 vertical-align:text-bottom;">
                        smartphone
                    </span>
                    ${card.mobile}
               </a>`
            : '';

        const emailHtml = card.email
            ? `<a href="mailto:${card.email}"
                  style="color:var(--accent-color);
                         text-decoration:none;"
                  onclick="event.stopPropagation()">
                    <span class="material-symbols-outlined"
                          style="font-size:16px;
                                 vertical-align:text-bottom;">
                        mail
                    </span>
                    Email
               </a>`
            : '';

        const contactHtml =
            phoneHtml || mobileHtml || emailHtml
                ? `<div style="margin-top:8px;
                               font-size:0.9rem;
                               font-weight:bold;
                               display:flex;
                               flex-wrap:wrap;
                               gap:8px;">
                       ${phoneHtml}
                       ${mobileHtml}
                       ${emailHtml}
                   </div>`
                : '';

        const cardElement = document.createElement('div');

        cardElement.className = 'form-card';
        cardElement.style.display = 'flex';
        cardElement.style.alignItems = 'center';
        cardElement.style.cursor = 'pointer';

        cardElement.onclick = () =>
            viewCardDetails(card.id);

        cardElement.innerHTML = `
            ${photoHtml}

            <div style="flex:1; min-width:0;">
                <span class="badge">
                    ${getCardCategory(card)}
                </span>

                <h3 style="margin:5px 0 2px 0;
                           color:var(--primary-color);">
                    ${card.name || '未命名'}
                </h3>

                <p style="margin:0;
                          font-size:0.85rem;
                          color:#888;">
                    ${card.company || '未填寫公司'}
                </p>

                ${contactHtml}
            </div>

            <button onclick="deleteCard(${card.id}, event)"
                    style="background:transparent;
                           border:none;
                           color:#FF6B6B;
                           cursor:pointer;
                           padding:10px;">
                <span class="material-symbols-outlined">
                    delete
                </span>
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
    if (!compressedPhotoBlob) return alert('⚠️ 找不到名片影像，請重新上傳或拍攝！');
    const btn = document.getElementById('aiImageBtn');
    btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> 讀取中...';

    // 定義要依序嘗試的模型清單 (優先順序：由上到下)
    const modelsToTry = [
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite'
    ];

    const imageDataUrl = compressedPhotoData || await CardDB.blobToDataUrl(compressedPhotoBlob);
    const base64Image = imageDataUrl.split(',')[1];
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
    renderCategoryStats();
}

// 4. 刪除分類
async function deleteCategory(cat) {
    if (cat === '未分類') return;

    const confirmed = confirm(
        `確定要刪除「${cat}」分類嗎？\n` +
        '(原本屬於此分類的名片，將會自動被歸為「未分類」)'
    );

    if (!confirmed) return;

    try {
        categories = categories.filter(category => category !== cat);

        businessCards.forEach(card => {
            if (getCardCategory(card) === cat) {
                card.category = '未分類';
                card.updatedAt = Date.now();
            }
        });

        if (activeCategoryFilter === cat) {
            activeCategoryFilter = null;
        }

        localStorage.setItem('categories', JSON.stringify(categories));
        await CardDB.putCards(businessCards);
        await loadCardsFromDatabase();

        renderCategoryOptions();
        renderCategoryTags();
        renderCategoryStats();
        renderCards();
    } catch (error) {
        console.error('刪除分類失敗：', error);
        alert('❌ 分類刪除失敗，請稍後再試。');
    }
}

// ==========================================
// ⭐ 新增：資料備份與還原 (匯出/匯入 JSON)
// ==========================================
async function exportData() {
    if (businessCards.length === 0) {
        return alert('⚠️ 目前沒有名片資料可以備份喔！');
    }

    try {
        const cardsForExport = await Promise.all(
            businessCards.map(async card => {
                const { photoBlob, photoUrl, ...textData } = card;

                return {
                    ...textData,
                    photo: photoBlob
                        ? await CardDB.blobToDataUrl(photoBlob)
                        : ''
                };
            })
        );

        const backup = {
            version: 2,
            exportedAt: new Date().toISOString(),
            categories,
            cards: cardsForExport
        };

        const dataStr = JSON.stringify(backup);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);

        anchor.href = url;
        anchor.download = `名片備份_${date}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('匯出備份失敗：', error);
        alert('❌ 備份匯出失敗。');
    }
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async function (e) {
        try {
            const parsed = JSON.parse(e.target.result);
            const importedCards = Array.isArray(parsed)
                ? parsed
                : parsed.cards;
            const importedCategories = Array.isArray(parsed.categories)
                ? parsed.categories
                : [];

            if (!Array.isArray(importedCards)) {
                throw new Error('備份檔案沒有 cards 陣列。');
            }

            const shouldMerge = businessCards.length > 0
                ? confirm(
                    '要將匯入的資料與現有名片「合併」嗎？\n' +
                    '按「確定」合併；按「取消」會清空現有資料後覆蓋。'
                )
                : true;

            const existingIds = new Set(
                shouldMerge ? businessCards.map(card => card.id) : []
            );
            const normalizedCards = [];

            for (const importedCard of importedCards) {
                const card = { ...importedCard };
                const id = Number(card.id) || Date.now() + normalizedCards.length;

                if (shouldMerge && existingIds.has(id)) continue;

                const photoBlob = card.photo
                    ? CardDB.dataUrlToBlob(card.photo)
                    : null;

                delete card.photo;
                delete card.photoUrl;

                normalizedCards.push({
                    ...card,
                    id,
                    category: card.category || '未分類',
                    photoBlob,
                    createdAt: card.createdAt || id,
                    updatedAt: Date.now()
                });
                existingIds.add(id);
            }

            if (!shouldMerge) {
                await CardDB.clearCards();
            }

            await CardDB.putCards(normalizedCards);

            importedCategories.forEach(category => {
                if (category && !categories.includes(category)) {
                    categories.push(category);
                }
            });

            normalizedCards.forEach(card => {
                if (card.category && !categories.includes(card.category)) {
                    categories.push(card.category);
                }
            });

            localStorage.setItem('categories', JSON.stringify(categories));
            await loadCardsFromDatabase();

            renderCards();
            updateHomeCount();
            renderRecentCards();
            renderCategoryOptions();
            renderCategoryTags();

            alert(`✅ 已還原 ${normalizedCards.length} 張名片！`);
        } catch (error) {
            console.error('還原備份失敗：', error);
            alert('❌ 檔案格式不正確，還原失敗！');
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
async function initializeApp() {
    try {
        await CardDB.openDatabase();

        // 新架構不再使用 localStorage 儲存名片。
        localStorage.removeItem('cards');

        // 嘗試降低瀏覽器自動清除資料的可能性。
        await CardDB.requestPersistentStorage();
        await loadCardsFromDatabase();

        renderCategoryOptions();
        renderCategoryTags();
        renderCards();
        renderRecentCards();
        updateHomeCount();
    } catch (error) {
        console.error('APP 初始化失敗：', error);
        alert('❌ 無法開啟名片資料庫，請確認瀏覽器允許網站儲存資料。');
    }
}

window.addEventListener('beforeunload', () => {
    releaseCardPhotoUrls();
    revokePreviewObjectUrl();
});

initializeApp();
