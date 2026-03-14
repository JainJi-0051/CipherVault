// ui.js - DOM Manipulation
import { filterCredentials } from './search.js';
import { checkStrength, generateSecurePassword } from './passwordGenerator.js';

const list = document.getElementById('credential-list');
const searchInput = document.getElementById('search-input');

let localVault = [];
let activeId = null;
let activeCategory = 'All';
let passwordRevealed = false;

// ─── Category icons ───────────────────────────────────────────────────────────
const CATEGORY_ICONS = {
    General: '📋', Social: '💬', Work: '💼', Personal: '👤', Banking: '🏦'
};

// ─── Render ───────────────────────────────────────────────────────────────────
export function renderVault(credentials, autoSelectId = null) {
    localVault = credentials;
    updateSecurityBanner(credentials);

    // Always set activeId FIRST before rendering the list
    if (autoSelectId) activeId = autoSelectId;

    applyFilters();

    // Open detail panel for the active credential
    const activeCred = credentials.find(c => c.id === activeId);
    if (activeCred) {
        showDetail(activeCred);
    } else {
        hideDetail();
    }
}

export function clearVault() {
    localVault = [];
    activeId = null;
    list.innerHTML = '';
    hideDetail();
}

function applyFilters() {
    let filtered = activeCategory === 'All'
        ? localVault
        : localVault.filter(c => c.category === activeCategory);

    const q = searchInput.value;
    if (q.trim().length >= 3) filtered = filterCredentials(filtered, q);

    displayList(filtered);
}

function displayList(credentials) {
    list.innerHTML = '';
    const now = Date.now();
    const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1000;

    if (credentials.length === 0) {
        list.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-muted)">No credentials found.</div>`;
        return;
    }

    credentials.forEach(cred => {
        const isExpired = (now - cred.lastUpdatedDate) > ninetyDaysInMs;
        const initial = (cred.serviceName || '?')[0].toUpperCase();

        const item = document.createElement('div');
        item.className = `cred-item${isExpired ? ' expired' : ''}${cred.id === activeId ? ' active' : ''}`;
        item.setAttribute('role', 'listitem');

        const avatar = document.createElement('div');
        avatar.className = 'cred-avatar';
        avatar.textContent = initial;

        const info = document.createElement('div');
        info.className = 'cred-info';

        const name = document.createElement('div');
        name.className = 'cred-name';
        name.textContent = cred.serviceName;

        const user = document.createElement('div');
        user.className = 'cred-user';
        user.textContent = maskUsername(cred.username);

        info.append(name, user);

        const meta = document.createElement('div');
        meta.className = 'cred-meta';

        const catBadge = document.createElement('span');
        catBadge.className = `cred-category cat-${cred.category}`;
        catBadge.textContent = cred.category;

        // Duplicate button beside category badge
        const dupBtn = document.createElement('button');
        dupBtn.className = 'dup-btn';
        dupBtn.textContent = '⧉ Duplicate';
        dupBtn.title = 'Duplicate this credential';
        dupBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // prevent triggering item click
            window.duplicateEntry(cred.id);
        });

        meta.appendChild(catBadge);
        meta.appendChild(dupBtn);

        if (isExpired) {
            const expBadge = document.createElement('span');
            expBadge.className = 'expired-badge';
            expBadge.textContent = '⚠ Expired';
            meta.appendChild(expBadge);
        }

        item.append(avatar, info, meta);
        item.addEventListener('click', () => {
            activeId = cred.id;
            // Update active class without full re-render
            document.querySelectorAll('.cred-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            showDetail(cred);
        });

        list.appendChild(item);
    });
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────
function showDetail(cred) {
    passwordRevealed = false;
    document.getElementById('detail-empty').classList.add('hidden');

    const content = document.getElementById('detail-content');
    content.classList.remove('hidden');

    // Force re-animation
    content.style.animation = 'none';
    content.offsetHeight;
    content.style.animation = '';

    document.getElementById('detail-avatar').textContent =
        CATEGORY_ICONS[cred.category] || (cred.serviceName || '?')[0].toUpperCase();

    document.getElementById('detail-service').textContent = cred.serviceName;
    document.getElementById('detail-username').textContent = cred.username;

    const catBadge = document.getElementById('detail-category');
    catBadge.textContent = cred.category;
    catBadge.className = `detail-category-badge cat-${cred.category}`;

    const pwdEl = document.getElementById('detail-password');
    pwdEl.textContent = '••••••••••••';
    pwdEl.classList.add('pwd-hidden');

    const notesWrap = document.getElementById('detail-notes-wrap');
    const notesEl = document.getElementById('detail-notes');
    if (cred.notes && cred.notes.trim()) {
        notesEl.textContent = cred.notes;
        notesWrap.classList.remove('hidden');
    } else {
        notesWrap.classList.add('hidden');
    }

    document.getElementById('detail-updated').textContent =
        new Date(cred.lastUpdatedDate).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

    // Wire up buttons (replace to remove old listeners)
    replaceBtn('copy-user-btn', () => copyToClipboard(cred.username, 'Username'));
    replaceBtn('copy-pass-btn', () => copyToClipboard(cred.password, 'Password'));
    replaceBtn('reveal-pass-btn', () => {
        passwordRevealed = !passwordRevealed;
        pwdEl.textContent = passwordRevealed ? cred.password : '••••••••••••';
        pwdEl.classList.toggle('pwd-hidden', !passwordRevealed);
        document.getElementById('reveal-pass-btn').textContent =
            passwordRevealed ? 'Hide' : 'Reveal';
    });
    replaceBtn('detail-edit-btn', () => showEditModal(cred));
    replaceBtn('detail-delete-btn', () => window.deleteEntry(cred.id));

    // ── Change Category ───────────────────────────────────────────────────
    const catPanel = document.getElementById('change-cat-panel');
    const catSelect = document.getElementById('change-cat-select');
    catPanel.classList.add('hidden');
    catSelect.value = cred.category;

    replaceBtn('change-cat-btn', () => {
        catPanel.classList.toggle('hidden');
        catSelect.value = cred.category;
    });

    replaceBtn('cancel-cat-btn', () => catPanel.classList.add('hidden'));

    replaceBtn('save-cat-btn', () => {
        const newCat = catSelect.value;
        if (newCat !== cred.category) {
            window.updateCategory(cred.id, newCat);
        }
        catPanel.classList.add('hidden');
    });
}

function hideDetail() {
    document.getElementById('detail-empty').classList.remove('hidden');
    document.getElementById('detail-content').classList.add('hidden');
}

function replaceBtn(id, handler) {
    const old = document.getElementById(id);
    const btn = old.cloneNode(true);
    old.parentNode.replaceChild(btn, old);
    btn.addEventListener('click', handler);
}

// ─── Security Banner ──────────────────────────────────────────────────────────
function updateSecurityBanner(credentials) {
    const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1000;
    const expired = credentials.filter(c => (Date.now() - c.lastUpdatedDate) > ninetyDaysInMs);
    const banner = document.getElementById('security-banner');
    const text = document.getElementById('security-banner-text');

    if (expired.length > 0) {
        text.textContent = `⚠ ${expired.length} password(s) haven't been updated in 90+ days.`;
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }
}

// ─── Category Filter ──────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item[data-category]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-item[data-category]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeCategory = btn.dataset.category;
        applyFilters();
    });
});

// ─── Search ───────────────────────────────────────────────────────────────────
searchInput.addEventListener('input', () => applyFilters());

// ─── Helpers ──────────────────────────────────────────────────────────────────
function maskUsername(user) {
    return user && user.length > 3 ? user.substring(0, 3) + '***' : '***';
}

function copyToClipboard(text, label = 'Text') {
    navigator.clipboard.writeText(text).then(() => {
        showToast(`${label} copied!`);
    }).catch(() => {
        showToast('Clipboard unavailable.', true);
    });
}
window.copyToClipboard = copyToClipboard;

// ─── Toast Notification ───────────────────────────────────────────────────────
export function showToast(msg, isError = false) {
    const existing = document.getElementById('vault-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'vault-toast';
    toast.textContent = msg;
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        background: isError ? 'var(--danger)' : 'var(--primary)',
        color: 'white',
        padding: '0.6rem 1.2rem',
        borderRadius: '8px',
        fontSize: '0.875rem',
        fontWeight: '600',
        zIndex: '9999',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        animation: 'slideUp 0.2s ease',
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export function showModal(title = "Add Credential") {
    // Clear edit state and reset form for a fresh add
    document.getElementById('cred-form').removeAttribute('data-edit-id');
    document.getElementById('cred-form').reset();
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-overlay').classList.remove('hidden');
}

function showEditModal(cred) {
    const form = document.getElementById('cred-form');

    // Mark the form as editing this specific credential id
    form.setAttribute('data-edit-id', cred.id);

    // Pre-fill all fields with existing values
    document.getElementById('f-service').value = cred.serviceName;
    document.getElementById('f-user').value = cred.username;
    document.getElementById('f-pass').value = cred.password;
    document.getElementById('f-category').value = cred.category;
    document.getElementById('f-notes').value = cred.notes || '';

    // Trigger strength bar update for pre-filled password
    document.getElementById('f-pass').dispatchEvent(new Event('input'));

    document.getElementById('modal-title').innerText = 'Edit Credential';
    document.getElementById('modal-overlay').classList.remove('hidden');
}

document.getElementById('close-modal').onclick = () => {
    const form = document.getElementById('cred-form');
    form.reset();
    form.removeAttribute('data-edit-id');
    document.getElementById('modal-overlay').classList.add('hidden');
};

// ─── Password Strength (form) ─────────────────────────────────────────────────
document.getElementById('f-pass').addEventListener('input', (e) => {
    updateStrengthUI(e.target.value, 'form-strength-fill', 'form-strength-label');
});

// ─── Password Strength (auth) ─────────────────────────────────────────────────
document.getElementById('master-pwd-input').addEventListener('input', (e) => {
    const wrap = document.getElementById('auth-strength');
    if (e.target.value.length > 0) {
        wrap.classList.remove('hidden');
        updateStrengthUI(e.target.value, 'auth-strength-fill', 'auth-strength-label');
    } else {
        wrap.classList.add('hidden');
    }
});

function updateStrengthUI(pwd, fillId, labelId) {
    const result = checkStrength(pwd);
    const fill = document.getElementById(fillId);
    const label = document.getElementById(labelId);
    const map = { Weak: ['weak', '#ef4444'], Moderate: ['moderate', '#f59e0b'], Strong: ['strong', '#10b981'] };
    const [cls, color] = map[result] || ['weak', '#ef4444'];
    fill.className = `strength-fill ${cls}`;
    label.textContent = result;
    label.style.color = color;
}

// ─── Show/hide password toggles ───────────────────────────────────────────────
function setEyeIcon(btn, inputEl) {
    btn.textContent = inputEl.type === 'password' ? '🙈' : '👁';
}

document.getElementById('pwd-toggle-btn').addEventListener('click', () => {
    const inp = document.getElementById('master-pwd-input');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    setEyeIcon(document.getElementById('pwd-toggle-btn'), inp);
});

document.getElementById('form-pwd-toggle').addEventListener('click', () => {
    const inp = document.getElementById('f-pass');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    setEyeIcon(document.getElementById('form-pwd-toggle'), inp);
});

// 🎲 Inline generate button — fills the password field in hidden mode
document.getElementById('form-gen-btn').addEventListener('click', () => {
    const len = parseInt(document.getElementById('gen-length').value, 10) || 16;
    const pwd = generateSecurePassword(len);
    const inp = document.getElementById('f-pass');
    const eyeBtn = document.getElementById('form-pwd-toggle');
    inp.type = 'password'; // keep hidden after generating
    inp.value = pwd;
    setEyeIcon(eyeBtn, inp);   // sync eye icon to closed
    inp.dispatchEvent(new Event('input')); // trigger strength bar
    showToast('Password generated! Click 👁 to reveal.');
});

// ─── Password Generator Panel ─────────────────────────────────────────────────
document.getElementById('gen-panel-btn').addEventListener('click', () => {
    document.getElementById('gen-overlay').classList.remove('hidden');
});

document.getElementById('gen-close-btn').addEventListener('click', () => {
    document.getElementById('gen-overlay').classList.add('hidden');
});

document.getElementById('gen-length').addEventListener('input', (e) => {
    document.getElementById('gen-length-label').textContent = e.target.value;
});

document.getElementById('gen-output').addEventListener('input', (e) => {
    if (e.target.value) {
        updateStrengthUI(e.target.value, 'gen-strength-fill', 'gen-strength-label');
    }
});

document.getElementById('gen-copy-btn').addEventListener('click', () => {
    const val = document.getElementById('gen-output').value;
    if (val) copyToClipboard(val, 'Password');
});

// ─── Digital Clock ────────────────────────────────────────────────────────────
const clockEl = document.getElementById('brand-clock');

function tickClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    clockEl.textContent = `${h}:${m}:${s}.${ms}`;
}

tickClock();
setInterval(tickClock, 50); // update every 50ms for smooth milliseconds

// ─── Theme Toggle ─────────────────────────────────────────────────────────────
document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('vault-theme', newTheme);
});

const savedTheme = localStorage.getItem('vault-theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);