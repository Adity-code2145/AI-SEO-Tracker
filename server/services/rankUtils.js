export function normalizeKeyword(value) {
    let keyword = value.trim();
    const matchingQuotes = { "\"": "\"", "'": "'", "“": "”", "‘": "’" };
    if (matchingQuotes[keyword[0]] === keyword.at(-1)) {
        keyword = keyword.slice(1, -1);
    }
    return keyword.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeDomain(value) {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(candidate).hostname.toLowerCase().replace(/^www\./, "");
}

export function domainMatches(targetDomain, resultDomain) {
    return resultDomain === targetDomain || resultDomain.endsWith(`.${targetDomain}`);
}
