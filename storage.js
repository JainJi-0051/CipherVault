// storage.js - IndexedDB & Backup Logic

export const dbProvider = {
    dbName: 'CipherVaultDB',

    async open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('vault'))
                    db.createObjectStore('vault', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('config'))
                    db.createObjectStore('config', { keyPath: 'key' });
            };
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async save(storeName, data) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).put(data);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
            tx.onabort = (e) => reject(e.target.error);
        });
    },

    async get(storeName, key) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const req = db.transaction(storeName).objectStore(storeName).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e.target.error);
        });
    },

    async getAll(storeName) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e.target.error);
        });
    },

    async delete(storeName, id) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const req = tx.objectStore(storeName).delete(id);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e.target.error);
        });
    },

    // ── Binary helpers ────────────────────────────────────────────────────────
    // JSON cannot store ArrayBuffer/Uint8Array — we encode as Base64 for export
    // and decode back to binary on import.

    _toBase64(buffer) {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        let binary = '';
        for (const b of bytes) binary += String.fromCharCode(b);
        return btoa(binary);
    },

    _fromBase64(b64) {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    },

    // ── Export ────────────────────────────────────────────────────────────────
    async exportVault() {
        const saltRec = await this.get('config', 'salt');
        if (!saltRec) throw new Error('No vault salt found. Is the vault initialised?');

        const credentials = await this.getAll('vault');

        const backupData = {
            salt: this._toBase64(saltRec.value),
            data: credentials.map(record => ({
                id: record.id,
                data: this._toBase64(record.data), // ArrayBuffer → Base64
                iv: this._toBase64(record.iv),   // Uint8Array  → Base64
            }))
        };

        const blob = new Blob([JSON.stringify(backupData)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const now = new Date();
        const date = now.toISOString().slice(0, 10); // "2026-03-12"
        const time = now.toTimeString().slice(0, 8).replace(/:/g, '-'); // "10-13-45"
        a.download = `vault-backup-${date}_${time}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    // ── Import ────────────────────────────────────────────────────────────────
    async importVault(jsonData) {
        let backup;
        try {
            backup = JSON.parse(jsonData);
        } catch {
            throw new Error('Invalid JSON file. Please select a valid vault backup.');
        }

        if (!backup || !Array.isArray(backup.data) || !backup.salt) {
            throw new Error('Invalid vault backup format. Missing required fields.');
        }
        for (const item of backup.data) {
            if (!item.id || !item.data || !item.iv) {
                throw new Error('Backup contains one or more malformed credential entries.');
            }
        }

        // Restore salt
        const saltArray = this._fromBase64(backup.salt);
        await this.save('config', { key: 'salt', value: saltArray });

        // Restore credentials — convert Base64 back to binary typed arrays
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('vault', 'readwrite');
            const store = tx.objectStore('vault');
            for (const item of backup.data) {
                store.put({
                    id: item.id,
                    data: this._fromBase64(item.data).buffer, // Base64 → ArrayBuffer
                    iv: this._fromBase64(item.iv),          // Base64 → Uint8Array
                });
            }
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }
};