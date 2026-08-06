// ==========================================
// IndexedDB 資料存取層
// ==========================================
(function () {
    'use strict';

    const DB_NAME = 'BusinessCardAppDB';
    const DB_VERSION = 1;
    const CARD_STORE = 'cards';

    let databasePromise = null;

    function openDatabase() {
        if (databasePromise) return databasePromise;

        databasePromise = new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) {
                reject(new Error('此瀏覽器不支援 IndexedDB。'));
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = event => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains(CARD_STORE)) {
                    const store = db.createObjectStore(CARD_STORE, {
                        keyPath: 'id'
                    });

                    store.createIndex('category', 'category', { unique: false });
                    store.createIndex('name', 'name', { unique: false });
                    store.createIndex('company', 'company', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
            };

            request.onsuccess = () => {
                const db = request.result;

                db.onversionchange = () => {
                    db.close();
                    databasePromise = null;
                };

                resolve(db);
            };

            request.onerror = () => {
                databasePromise = null;
                reject(request.error || new Error('IndexedDB 開啟失敗。'));
            };

            request.onblocked = () => {
                console.warn('IndexedDB 升級被其他分頁阻擋，請關閉舊分頁後重試。');
            };
        });

        return databasePromise;
    }

    function transactionDone(transaction) {
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(
                transaction.error || new Error('IndexedDB transaction 失敗。')
            );
            transaction.onabort = () => reject(
                transaction.error || new Error('IndexedDB transaction 已中止。')
            );
        });
    }

    function requestResult(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(
                request.error || new Error('IndexedDB request 失敗。')
            );
        });
    }

    function prepareCardForStorage(card) {
        const storedCard = { ...card };

        // Object URL 只能在目前頁面使用，不能寫進資料庫。
        delete storedCard.photoUrl;
        delete storedCard.photo;

        if (storedCard.photoBlob && !(storedCard.photoBlob instanceof Blob)) {
            throw new TypeError('photoBlob 必須是 Blob。');
        }

        return storedCard;
    }

    async function getAllCards() {
        const db = await openDatabase();
        const transaction = db.transaction(CARD_STORE, 'readonly');
        const store = transaction.objectStore(CARD_STORE);
        const done = transactionDone(transaction);
        const cards = await requestResult(store.getAll());
        await done;
        return cards;
    }

    async function getCard(id) {
        const db = await openDatabase();
        const transaction = db.transaction(CARD_STORE, 'readonly');
        const store = transaction.objectStore(CARD_STORE);
        const done = transactionDone(transaction);
        const card = await requestResult(store.get(id));
        await done;
        return card;
    }

    async function putCard(card) {
        const db = await openDatabase();
        const transaction = db.transaction(CARD_STORE, 'readwrite');
        const store = transaction.objectStore(CARD_STORE);
        const done = transactionDone(transaction);
        const storedCard = prepareCardForStorage(card);

        await requestResult(store.put(storedCard));
        await done;
        return storedCard;
    }

    async function putCards(cards) {
        const db = await openDatabase();
        const transaction = db.transaction(CARD_STORE, 'readwrite');
        const store = transaction.objectStore(CARD_STORE);
        const done = transactionDone(transaction);

        for (const card of cards) {
            store.put(prepareCardForStorage(card));
        }

        await done;
    }

    async function deleteCard(id) {
        const db = await openDatabase();
        const transaction = db.transaction(CARD_STORE, 'readwrite');
        const store = transaction.objectStore(CARD_STORE);
        const done = transactionDone(transaction);

        store.delete(id);
        await done;
    }

    async function clearCards() {
        const db = await openDatabase();
        const transaction = db.transaction(CARD_STORE, 'readwrite');
        const store = transaction.objectStore(CARD_STORE);
        const done = transactionDone(transaction);

        store.clear();
        await done;
    }

    function dataUrlToBlob(dataUrl) {
        if (!dataUrl || typeof dataUrl !== 'string') return null;

        const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
        if (!match) throw new Error('圖片 Data URL 格式錯誤。');

        const mimeType = match[1] || 'application/octet-stream';
        const isBase64 = Boolean(match[2]);
        const data = match[3];
        const binaryString = isBase64
            ? atob(data)
            : decodeURIComponent(data);
        const bytes = new Uint8Array(binaryString.length);

        for (let index = 0; index < binaryString.length; index += 1) {
            bytes[index] = binaryString.charCodeAt(index);
        }

        return new Blob([bytes], { type: mimeType });
    }

    function blobToDataUrl(blob) {
        if (!blob) return Promise.resolve('');

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(
                reader.error || new Error('Blob 轉 Data URL 失敗。')
            );
            reader.readAsDataURL(blob);
        });
    }

    async function requestPersistentStorage() {
        if (!navigator.storage?.persist) return false;

        try {
            return await navigator.storage.persist();
        } catch (error) {
            console.warn('無法要求持久化儲存：', error);
            return false;
        }
    }

    async function getStorageEstimate() {
        if (!navigator.storage?.estimate) {
            return { usage: null, quota: null };
        }

        try {
            return await navigator.storage.estimate();
        } catch (error) {
            console.warn('無法取得儲存容量：', error);
            return { usage: null, quota: null };
        }
    }

    window.CardDB = Object.freeze({
        openDatabase,
        getAllCards,
        getCard,
        putCard,
        putCards,
        deleteCard,
        clearCards,
        dataUrlToBlob,
        blobToDataUrl,
        requestPersistentStorage,
        getStorageEstimate
    });
})();
