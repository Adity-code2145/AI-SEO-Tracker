import dns from "node:dns/promises";
import net from "node:net";
import ipaddr from "ipaddr.js";

const RESTRICTED_HOSTNAMES = new Set([
    "localhost",
    "metadata.google.internal",
    "instance-data",
]);

const RESTRICTED_TLDS = [
    ".local",
    ".internal",
    ".lan",
    ".invalid",
    ".test",
    ".example",
    ".localhost",
];

export function validateAndNormalizeUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") {
        throw new Error("URL is required");
    }

    const trimmed = rawUrl.trim();
    if (!trimmed) {
        throw new Error("URL cannot be empty");
    }

    let candidate = trimmed;
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(trimmed)) {
        candidate = `https://${trimmed}`;
    }

    let parsed;
    try {
        parsed = new URL(candidate);
    } catch {
        throw new Error("Invalid URL format");
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Only HTTP and HTTPS URLs are supported");
    }

    if (!parsed.hostname) {
        throw new Error("URL must include a valid hostname");
    }

    if (parsed.username || parsed.password) {
        throw new Error("URLs with user credentials are not allowed");
    }

    const hostnameLower = parsed.hostname.toLowerCase();

    if (
        RESTRICTED_HOSTNAMES.has(hostnameLower) ||
        RESTRICTED_TLDS.some((tld) => hostnameLower.endsWith(tld))
    ) {
        throw new Error(`Access to restricted hostname "${parsed.hostname}" is forbidden`);
    }

    return parsed;
}

export function isIpSafe(ipString) {
    try {
        let addr = ipaddr.parse(ipString);

        if (addr.kind() === "ipv6" && addr.isIPv4MappedAddress()) {
            addr = addr.toIPv4Address();
        }

        const range = addr.range();
        return range === "unicast";
    } catch {
        return false;
    }
}

export async function validateHostSafe(hostname, dnsLookupImpl = dns.lookup) {
    const cleanHost = hostname.toLowerCase();

    if (RESTRICTED_HOSTNAMES.has(cleanHost) || RESTRICTED_TLDS.some((tld) => cleanHost.endsWith(tld))) {
        throw new Error(`Access to private host "${hostname}" is forbidden`);
    }

    if (net.isIP(cleanHost)) {
        if (!isIpSafe(cleanHost)) {
            throw new Error(`Access to private or restricted IP "${cleanHost}" is forbidden`);
        }
        return [cleanHost];
    }

    let records;
    try {
        records = await dnsLookupImpl(cleanHost, { all: true });
    } catch (err) {
        throw new Error(`Unable to resolve host "${hostname}": ${err.message}`);
    }

    if (!records || records.length === 0) {
        throw new Error(`No DNS records found for host "${hostname}"`);
    }

    for (const record of records) {
        const ip = typeof record === "string" ? record : record.address;
        if (!isIpSafe(ip)) {
            throw new Error(`Host "${hostname}" resolved to restricted IP address "${ip}"`);
        }
    }

    return records.map((r) => (typeof r === "string" ? r : r.address));
}

export async function safeFetchHtml(targetUrl, options = {}) {
    const maxRedirects = options.maxRedirects ?? 5;
    const timeoutMs = options.timeoutMs ?? 15000;
    const maxByteLength = options.maxByteLength ?? 5 * 1024 * 1024; // 5MB
    const fetchImpl = options.fetchImpl || fetch;
    const dnsLookupImpl = options.dnsLookupImpl || dns.lookup;

    let currentUrl = validateAndNormalizeUrl(targetUrl).toString();
    const startTime = Date.now();

    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
        const parsedUrl = new URL(currentUrl);

        // SSRF Check on the host
        await validateHostSafe(parsedUrl.hostname, dnsLookupImpl);

        let response;
        try {
            response = await fetchImpl(currentUrl, {
                method: "GET",
                redirect: "manual",
                signal: AbortSignal.timeout(timeoutMs),
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Cache-Control": "no-cache",
                    "Pragma": "no-cache",
                    "Sec-Fetch-Dest": "document",
                    "Sec-Fetch-Mode": "navigate",
                    "Sec-Fetch-Site": "none",
                    "Upgrade-Insecure-Requests": "1",
                },
            });
        } catch (fetchError) {
            if (fetchError.name === "TimeoutError" || fetchError.name === "AbortError") {
                throw new Error(`Request timed out after ${timeoutMs / 1000} seconds`);
            }
            throw new Error(`Failed to connect to ${parsedUrl.hostname}: ${fetchError.message}`);
        }

        // Handle redirects
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            if (redirectCount >= maxRedirects) {
                throw new Error(`Too many redirects (exceeded limit of ${maxRedirects})`);
            }
            const location = response.headers.get("location");
            if (!location) {
                throw new Error(`Received redirect status ${response.status} with no Location header`);
            }
            const nextUrl = new URL(location, currentUrl);
            currentUrl = validateAndNormalizeUrl(nextUrl.toString()).toString();
            continue;
        }

        if (response.status === 403) {
            throw new Error(
                `${parsedUrl.hostname} blocked the request (403 Forbidden). This site may require JavaScript or actively blocks automated crawlers. Try a different URL.`
            );
        }

        if (response.status === 401) {
            throw new Error(`${parsedUrl.hostname} requires authentication (401). Cannot analyze private/login-required pages.`);
        }

        if (response.status === 429) {
            throw new Error(`${parsedUrl.hostname} is rate-limiting requests (429 Too Many Requests). Please wait and try again.`);
        }

        if (response.status >= 400) {
            throw new Error(`${parsedUrl.hostname} returned HTTP ${response.status}. The page may not exist or is unavailable.`);
        }

        const contentType = (response.headers.get("content-type") || "").toLowerCase();
        if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml") && !contentType.includes("text/plain")) {
            throw new Error(`Target returned unsupported content type "${contentType}". Expected HTML.`);
        }

        const contentLengthHeader = response.headers.get("content-length");
        if (contentLengthHeader && parseInt(contentLengthHeader, 10) > maxByteLength) {
            throw new Error(`Page size exceeds maximum allowed limit (${Math.round(maxByteLength / (1024 * 1024))}MB)`);
        }

        const html = await response.text();
        const loadTime = Date.now() - startTime;
        const pageSize = Buffer.byteLength(html, "utf8");

        if (pageSize > maxByteLength) {
            throw new Error(`Page size (${Math.round(pageSize / 1024)}KB) exceeds limit of ${Math.round(maxByteLength / 1024)}KB`);
        }

        return {
            html,
            finalUrl: currentUrl,
            statusCode: response.status,
            loadTime,
            pageSize,
        };
    }

    throw new Error(`Too many redirects`);
}
