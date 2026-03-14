// crypto.js - Security Logic

export class CryptoEngine {
    constructor() {
        this.algo = { name: 'AES-GCM', length: 256 };
        this.iterations = 600000;
    }

    // Derive a CryptoKey from the Master Password
    async deriveKey(password, salt) {
        // Input validation (Issue: no validation previously)
        if (!password || typeof password !== 'string' || password.length === 0) {
            throw new Error('Invalid password supplied to deriveKey.');
        }
        if (!(salt instanceof Uint8Array) || salt.length < 16) {
            throw new Error('Invalid or too-short salt supplied to deriveKey.');
        }

        const enc = new TextEncoder();
        const baseKey = await crypto.subtle.importKey(
            'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            // Fix: SHA-512 instead of SHA-256 for stronger brute-force resistance
            { name: 'PBKDF2', salt, iterations: this.iterations, hash: 'SHA-512' },
            baseKey, this.algo, false, ['encrypt', 'decrypt']
        );
    }

    async encrypt(data, key) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(JSON.stringify(data));
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv }, key, encoded
        );
        return { ciphertext, iv };
    }

    async decrypt(ciphertext, key, iv) {
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv }, key, ciphertext
        );
        return JSON.parse(new TextDecoder().decode(decrypted));
    }

    // Fix: increased salt to 32 bytes (256-bit) for stronger uniqueness
    generateSalt() {
        return crypto.getRandomValues(new Uint8Array(32));
    }
}