import test from "node:test";
import assert from "node:assert/strict";
import {
    validateAndNormalizeUrl,
    isIpSafe,
    validateHostSafe,
    safeFetchHtml,
} from "../services/ssrfGuard.js";

test("validateAndNormalizeUrl handles valid and missing protocols", () => {
    assert.equal(validateAndNormalizeUrl("example.com").href, "https://example.com/");
    assert.equal(validateAndNormalizeUrl("http://mywebsite.org/path").href, "http://mywebsite.org/path");
    assert.equal(validateAndNormalizeUrl("https://sub.domain.co.uk/").href, "https://sub.domain.co.uk/");
});

test("validateAndNormalizeUrl rejects empty, invalid, and unsupported protocols", () => {
    assert.throws(() => validateAndNormalizeUrl(""), /URL cannot be empty|URL is required/);
    assert.throws(() => validateAndNormalizeUrl("ftp://files.example.com"), /Only HTTP and HTTPS/);
    assert.throws(() => validateAndNormalizeUrl("javascript:alert(1)"), /Only HTTP and HTTPS/);
    assert.throws(() => validateAndNormalizeUrl("file:///etc/passwd"), /Only HTTP and HTTPS/);
    assert.throws(() => validateAndNormalizeUrl("https://admin:pass@example.com"), /credentials are not allowed/);
});

test("validateAndNormalizeUrl blocks private hostnames and local domains", () => {
    assert.throws(() => validateAndNormalizeUrl("http://localhost"), /restricted hostname/);
    assert.throws(() => validateAndNormalizeUrl("http://metadata.google.internal"), /restricted hostname/);
    assert.throws(() => validateAndNormalizeUrl("http://app.local"), /restricted hostname/);
    assert.throws(() => validateAndNormalizeUrl("http://server.lan"), /restricted hostname/);
});

test("isIpSafe correctly detects public unicast vs private/loopback/link-local IPs", () => {
    assert.equal(isIpSafe("127.0.0.1"), false);
    assert.equal(isIpSafe("10.0.0.1"), false);
    assert.equal(isIpSafe("192.168.1.50"), false);
    assert.equal(isIpSafe("172.16.0.1"), false);
    assert.equal(isIpSafe("169.254.169.254"), false);
    assert.equal(isIpSafe("::1"), false);
    assert.equal(isIpSafe("fc00::1"), false);
    assert.equal(isIpSafe("93.184.216.34"), true); // example.com
    assert.equal(isIpSafe("8.8.8.8"), true);
});

test("validateHostSafe rejects hosts that resolve to restricted IPs", async () => {
    const mockDnsLookup = async () => [{ address: "192.168.1.1" }];
    await assert.rejects(
        () => validateHostSafe("malicious-internal.com", mockDnsLookup),
        /resolved to restricted IP address/
    );
});

test("validateHostSafe permits hosts that resolve to public unicast IPs", async () => {
    const mockDnsLookup = async () => [{ address: "93.184.216.34" }];
    const ips = await validateHostSafe("example.com", mockDnsLookup);
    assert.deepEqual(ips, ["93.184.216.34"]);
});

test("safeFetchHtml re-validates redirect destinations against SSRF", async () => {
    const fakeDns = async (host) => {
        if (host === "redirector.com") return [{ address: "93.184.216.34" }];
        if (host === "127.0.0.1") return [{ address: "127.0.0.1" }];
        return [{ address: "93.184.216.34" }];
    };

    const fakeFetch = async (url) => {
        if (url === "https://redirector.com/") {
            return {
                status: 302,
                headers: new Headers({ Location: "http://127.0.0.1:8080/admin" }),
            };
        }
        return {
            status: 200,
            headers: new Headers({ "content-type": "text/html" }),
            text: async () => "<html><body>Secret</body></html>",
        };
    };

    await assert.rejects(
        () => safeFetchHtml("https://redirector.com/", {
            dnsLookupImpl: fakeDns,
            fetchImpl: fakeFetch,
        }),
        /private or restricted IP/
    );
});

test("safeFetchHtml rejects oversized payloads and non-HTML content", async () => {
    const fakeDns = async () => [{ address: "93.184.216.34" }];

    const binaryFetch = async () => ({
        status: 200,
        headers: new Headers({ "content-type": "application/pdf" }),
        text: async () => "%PDF-1.4",
    });

    await assert.rejects(
        () => safeFetchHtml("https://example.com/doc.pdf", {
            dnsLookupImpl: fakeDns,
            fetchImpl: binaryFetch,
        }),
        /unsupported content type/
    );

    const oversizedFetch = async () => ({
        status: 200,
        headers: new Headers({ "content-type": "text/html", "content-length": "10485760" }),
        text: async () => "x",
    });

    await assert.rejects(
        () => safeFetchHtml("https://example.com/big", {
            dnsLookupImpl: fakeDns,
            fetchImpl: oversizedFetch,
            maxByteLength: 1024,
        }),
        /exceeds maximum allowed limit/
    );
});
