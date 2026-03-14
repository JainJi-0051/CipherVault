// app.js - Main Controller
import { CryptoEngine } from './crypto.js';
import { dbProvider } from './storage.js';
import { renderVault, clearVault, showModal, showToast } from './ui.js';
import { generateSecurePassword } from './passwordGenerator.js';

const cryptoTool = new CryptoEngine();
let sessionKey = null;

// ─── Auto-lock on inactivity ──────────────────────────────────────────────────
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
let lockTimer = null;

function resetLockTimer() {
    clearTimeout(lockTimer);
    lockTimer = setTimeout(lockVault, LOCK_TIMEOUT_MS);
}

function lockVault() {
    sessionKey = null;
    clearTimeout(lockTimer);
    clearVault();
    const pwdInput = document.getElementById('master-pwd-input');
    pwdInput.value = '';
    pwdInput.type = 'password';
    const eyeBtn = document.getElementById('pwd-toggle-btn');
    if (eyeBtn) eyeBtn.textContent = '🙈';
    document.getElementById('main-content').classList.add('hidden');
    document.getElementById('auth-overlay').classList.remove('hidden');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
    const authTitle = document.getElementById('auth-title');
    const unlockBtn = document.getElementById('unlock-btn');
    const pwdInput = document.getElementById('master-pwd-input');

    // Set initial title on page load
    try {
        const initialSalt = await dbProvider.get('config', 'salt');
        if (authTitle) {
            authTitle.innerText = !initialSalt ? 'Setup Your Vault' : 'Unlock Your Vault';
        }
    } catch {
        if (authTitle) authTitle.innerText = 'Setup Your Vault';
    }

    // ── Unlock / Setup ──────────────────────────────────────────────────────
    unlockBtn.addEventListener('click', async () => {
        const pwd = pwdInput.value;

        if (!pwd || pwd.length < 12) {
            alert("Master password must be at least 12 characters.");
            return;
        }

        let saltRecord;
        try {
            saltRecord = await dbProvider.get('config', 'salt');
        } catch {
            alert("Could not read vault configuration. Please refresh the page.");
            return;
        }

        const isFirstTime = !saltRecord;
        if (authTitle) {
            authTitle.innerText = isFirstTime ? 'Setup Your Vault' : 'Unlock Your Vault';
        }

        let salt;
        if (isFirstTime) {
            salt = cryptoTool.generateSalt();
            await dbProvider.save('config', { key: 'salt', value: salt });
        } else {
            salt = saltRecord.value;
        }

        try {
            sessionKey = await cryptoTool.deriveKey(pwd, salt);
            document.getElementById('auth-overlay').classList.add('hidden');
            document.getElementById('main-content').classList.remove('hidden');
            resetLockTimer();
            document.addEventListener('mousemove', resetLockTimer);
            document.addEventListener('keydown', resetLockTimer);
            loadVault();
        } catch {
            sessionKey = null;
            pwdInput.value = '';
            pwdInput.focus();
            alert("Incorrect Master Password. Please try again.");
        }
    });

    // ── Add Credential ──────────────────────────────────────────────────────
    document.getElementById('add-cred-btn').onclick = () => showModal("Add New Credential");

    // ── Lock Button ─────────────────────────────────────────────────────────
    document.getElementById('lock-btn').addEventListener('click', lockVault);

    // ── Credential Form Submit (handles both Add and Edit) ───────────────────
    document.getElementById('cred-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = document.getElementById('cred-form');
        const editId = form.getAttribute('data-edit-id');

        const serviceName = document.getElementById('f-service').value;
        const username = document.getElementById('f-user').value;
        const password = document.getElementById('f-pass').value;
        const category = document.getElementById('f-category').value;
        const notes = document.getElementById('f-notes').value;

        try {
            if (editId) {
                // Edit: decrypt → update → re-encrypt
                const record = await dbProvider.get('vault', editId);
                const decrypted = await cryptoTool.decrypt(record.data, sessionKey, record.iv);
                const updated = {
                    ...decrypted,
                    serviceName, username, password, category, notes,
                    lastUpdatedDate: Date.now()
                };
                const { ciphertext, iv } = await cryptoTool.encrypt(updated, sessionKey);
                await dbProvider.save('vault', { id: editId, data: ciphertext, iv });
                showToast('Credential updated!');
                document.getElementById('modal-overlay').classList.add('hidden');
                form.reset();
                form.removeAttribute('data-edit-id');
                loadVault(editId); // re-open the same credential after edit
            } else {
                // Add: brand new entry
                const newEntry = {
                    id: crypto.randomUUID(),
                    serviceName, username, password, category, notes,
                    createdDate: Date.now(),
                    lastUpdatedDate: Date.now()
                };
                const { ciphertext, iv } = await cryptoTool.encrypt(newEntry, sessionKey);
                await dbProvider.save('vault', { id: newEntry.id, data: ciphertext, iv });
                showToast('Credential saved!');
                document.getElementById('modal-overlay').classList.add('hidden');
                form.reset();
                loadVault(newEntry.id); // auto-open the new credential
            }
        } catch {
            alert("Failed to save. Is the vault unlocked?");
        }
    });

    // ── Delete Entry ─────────────────────────────────────────────────────────
    window.deleteEntry = async (id) => {
        if (confirm("Are you sure you want to delete this credential?")) {
            await dbProvider.delete('vault', id);
            loadVault();
        }
    };

    // ── Update Category ───────────────────────────────────────────────────────
    window.updateCategory = async (id, newCategory) => {
        try {
            const record = await dbProvider.get('vault', id);
            const decrypted = await cryptoTool.decrypt(record.data, sessionKey, record.iv);
            decrypted.category = newCategory;
            decrypted.lastUpdatedDate = Date.now();
            const { ciphertext, iv } = await cryptoTool.encrypt(decrypted, sessionKey);
            await dbProvider.save('vault', { id, data: ciphertext, iv });
            showToast(`Moved to ${newCategory}`);
            loadVault(id); // keep the same credential open after category change
        } catch (err) {
            alert("Failed to update category: " + err.message);
        }
    };

    // ── Duplicate Entry ───────────────────────────────────────────────────────
    window.duplicateEntry = async (id) => {
        try {
            const record = await dbProvider.get('vault', id);
            const decrypted = await cryptoTool.decrypt(record.data, sessionKey, record.iv);
            const duplicate = {
                ...decrypted,
                id: crypto.randomUUID(),
                serviceName: decrypted.serviceName + ' (Copy)',
                createdDate: Date.now(),
                lastUpdatedDate: Date.now()
            };
            const { ciphertext, iv } = await cryptoTool.encrypt(duplicate, sessionKey);
            await dbProvider.save('vault', { id: duplicate.id, data: ciphertext, iv });
            showToast('Credential duplicated! Opening for edit...');
            await loadVault(duplicate.id); // auto-open the duplicate
        } catch (err) {
            alert("Failed to duplicate: " + err.message);
        }
    };

    // ── Export ───────────────────────────────────────────────────────────────
    document.getElementById('export-btn').onclick = async () => {
        try {
            await dbProvider.exportVault();
        } catch (err) {
            alert("Export failed: " + err.message);
        }
    };

    // ── Import ───────────────────────────────────────────────────────────────
    document.getElementById('import-trigger-btn').onclick = () => {
        document.getElementById('import-input').click();
    };

    document.getElementById('import-input').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!confirm("Importing will REPLACE your current vault. This cannot be undone. Continue?")) {
            e.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                await dbProvider.importVault(event.target.result);
                alert("Vault imported successfully! Please re-enter your Master Password to unlock.");
                lockVault();
            } catch (err) {
                alert("Error importing vault: " + err.message);
            }
        };
        reader.readAsText(file);
    };

    // ── Password Generator ───────────────────────────────────────────────────
    document.getElementById('generate-btn').addEventListener('click', () => {
        const len = parseInt(document.getElementById('gen-length').value, 10);
        const pwd = generateSecurePassword(len);
        document.getElementById('gen-output').value = pwd;
        document.getElementById('gen-output').dispatchEvent(new Event('input'));
    });
}

// ─── Load & Decrypt Vault ─────────────────────────────────────────────────────
async function loadVault(autoSelectId = null) {
    if (!sessionKey) return;

    try {
        const records = await dbProvider.getAll('vault');
        const all = [];
        let errors = 0;

        for (const record of records) {
            try {
                const decrypted = await cryptoTool.decrypt(record.data, sessionKey, record.iv);
                all.push({ ...decrypted, id: record.id });
            } catch {
                errors++;
            }
        }

        if (errors > 0) {
            alert(`Warning: ${errors} record(s) could not be decrypted.`);
        }

        renderVault(all, autoSelectId);
    } catch (err) {
        alert("Could not load vault data: " + err.message);
    }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);