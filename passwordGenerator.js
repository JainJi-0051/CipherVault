// passwordGenerator.js

/**
 * Generates a cryptographically secure random password.
 * Fix: uses rejection sampling to eliminate modulo bias.
 */
export function generateSecurePassword(length = 16) {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
    // Largest multiple of charset.length that fits in a byte (0–255)
    // Values at or above this threshold are discarded to avoid bias
    const max = 256 - (256 % charset.length);
    const result = [];

    while (result.length < length) {
        // Request extra bytes so we rarely need a second loop iteration
        const values = crypto.getRandomValues(new Uint8Array(length * 2));
        for (const v of values) {
            if (result.length >= length) break;
            // Reject values that would introduce bias
            if (v < max) result.push(charset[v % charset.length]);
        }
    }

    return result.join('');
}

/**
 * Checks password strength based on both length and character variety.
 * Fix: original version only checked length, so e.g. "aaaaaaaaaaaaaa" was "Strong".
 */
export function checkStrength(pwd) {
    if (!pwd || pwd.length < 8) return 'Weak';

    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasDigit = /[0-9]/.test(pwd);
    const hasSymbol = /[^A-Za-z0-9]/.test(pwd);
    const variety = [hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean).length;

    if (pwd.length >= 14 && variety >= 3) return 'Strong';
    if (pwd.length >= 10 && variety >= 2) return 'Moderate';
    return 'Weak';
}