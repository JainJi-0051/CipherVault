// search.js - Live Filtering Logic

/**
 * Filters the decrypted credentials array based on a query string.
 * @param {Array}  credentials - Array of decrypted credential objects.
 * @param {string} query       - The user's search input.
 * @returns {Array}            - The filtered results.
 */
export function filterCredentials(credentials, query) {
    // Sanitise: trim whitespace, lowercase for case-insensitive matching
    const searchTerm = query.toLowerCase().trim();

    // Search starts at 3 characters to avoid flooding results on single keystrokes
    if (searchTerm.length < 3) {
        return credentials;
    }

    return credentials.filter(cred => {
        // Guard against undefined fields to avoid runtime errors on malformed records
        const matchService = (cred.serviceName ?? '').toLowerCase().includes(searchTerm);
        const matchUser = (cred.username ?? '').toLowerCase().includes(searchTerm);
        const matchCategory = (cred.category ?? '').toLowerCase().includes(searchTerm);

        return matchService || matchUser || matchCategory;
    });
}