import { chromium } from "playwright-core";
import Browserbase from "@browserbasehq/sdk";
import { domainMatches, normalizeDomain, normalizeKeyword } from "./rankUtils.js";

const RESULTS_PER_PAGE = 10;
const MAX_PAGES = 5;

export function buildRankResult(keyword, targetDomain, results, country, language) {
    const cleanTarget = normalizeDomain(targetDomain);
    const found = results.find((result) => domainMatches(cleanTarget, result.domain));

    return {
        keyword: normalizeKeyword(keyword),
        targetDomain: cleanTarget,
        position: found?.position ?? null,
        page: found ? Math.ceil(found.position / RESULTS_PER_PAGE) : null,
        title: found?.title || "",
        snippet: found?.snippet || "",
        competitors: results.filter((result) => !domainMatches(cleanTarget, result.domain)).slice(0, 10),
        totalResultsScanned: results.length,
        maxResults: MAX_PAGES * RESULTS_PER_PAGE,
        country,
        language,
    };
}

export function mapGoogleOrganicResults(items, startPosition = 0) {
    return items.flatMap((item, index) => {
        if (typeof item.url !== "string" || !/^https?:\/\//i.test(item.url)) return [];

        let domain;
        try {
            domain = normalizeDomain(item.url);
        } catch {
            return [];
        }

        if (domain.includes("google.")) return [];
        return [{
            position: startPosition + index + 1,
            url: item.url,
            domain,
            title: typeof item.title === "string" ? item.title : "",
            snippet: typeof item.snippet === "string" ? item.snippet : "",
        }];
    });
}

async function extractGoogleOrganicResults(page) {
    return page.evaluate(() => {
        const root = document.querySelector("#rso") || document;
        return Array.from(root.querySelectorAll("h3")).flatMap((heading) => {
            const anchor = heading.closest("a");
            if (!anchor) return [];

            let resultCard = anchor.parentElement;
            for (let depth = 0; depth < 5 && resultCard; depth += 1, resultCard = resultCard.parentElement) {
                if (resultCard.matches(".MjjYud, [data-sokoban-container]")) break;
            }
            if (/^\s*sponsored\b/i.test(resultCard?.innerText || "")) return [];

            let snippet = "";
            let parent = anchor.parentElement;
            for (let depth = 0; depth < 6 && parent; depth += 1, parent = parent.parentElement) {
                const text = parent.innerText || "";
                if (text.length > heading.innerText.length + 50) {
                    snippet = (text.split("\n").find(
                        (line) => line.length > 30 && !line.includes(heading.innerText.substring(0, 20)),
                    ) || "").trim().substring(0, 300);
                    if (snippet) break;
                }
            }

            return [{
                url: anchor.href,
                title: heading.innerText.trim(),
                snippet,
            }];
        });
    });
}

async function resolveGoogleRedirect(url, fetchImpl) {
    const parsedUrl = new URL(url);
    if (!parsedUrl.hostname.includes("google.")) return parsedUrl.href;

    const directUrl =
        parsedUrl.searchParams.get("q") ||
        parsedUrl.searchParams.get("url") ||
        parsedUrl.searchParams.get("adurl");
    if (directUrl && /^https?:\/\//i.test(directUrl)) {
        return new URL(directUrl).href;
    }

    const response = await fetchImpl(parsedUrl.href, {
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
    });
    const location = response.headers.get("location");
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) {
        throw new Error(`Google result redirect could not be resolved (HTTP ${response.status})`);
    }

    const destination = new URL(location, parsedUrl);
    if (!["http:", "https:"].includes(destination.protocol) || destination.hostname.includes("google.")) {
        throw new Error("Google returned an invalid result destination");
    }
    return destination.href;
}

async function acceptGoogleConsent(page) {
    const buttons = [
        page.locator("button#L2AGLB").first(),
        page.getByRole("button", { name: /^Accept all$/i }).first(),
        page.getByRole("button", { name: /^I agree$/i }).first(),
    ];

    for (const button of buttons) {
        if (await button.count()) {
            await button.click({ timeout: 5000 });
            await page.waitForTimeout(500);
            return;
        }
    }
}

export async function rankTracker(keyword, targetDomain, dependencies = {}) {
    let browser;
    try {
        const environment = dependencies.environment || process.env;
        const apiKey = environment.BROWSERBASE_API_KEY;
        if (!apiKey) {
            throw new Error("BROWSERBASE_API_KEY is not configured. Add it to server/.env.");
        }

        const normalizedKeyword = normalizeKeyword(keyword);
        const cleanTarget = normalizeDomain(targetDomain);
        const country = (environment.GOOGLE_SEARCH_COUNTRY || "in").toLowerCase();
        const language = (environment.GOOGLE_SEARCH_LANGUAGE || "en").toLowerCase();
        const browserbase = (dependencies.createBrowserbase || ((key) => new Browserbase({ apiKey: key })))(apiKey);
        const session = await browserbase.sessions.create({
            browserSettings: { blockAds: true },
        });
        const browserClient = dependencies.chromium || chromium;
        browser = await browserClient.connectOverCDP(session.connectUrl);

        const context = browser.contexts()[0];
        if (!context) throw new Error("Browserbase session did not provide a browser context");
        const page = context.pages()[0] ?? await context.newPage();
        page.setDefaultNavigationTimeout(45000);

        const allResults = [];
        let found = null;
        const fetchImpl = dependencies.fetchImpl || fetch;

        for (let googlePage = 0; googlePage < MAX_PAGES; googlePage += 1) {
            const searchUrl = new URL("https://www.google.com/search");
            searchUrl.searchParams.set("q", normalizedKeyword);
            searchUrl.searchParams.set("start", String(googlePage * RESULTS_PER_PAGE));
            searchUrl.searchParams.set("num", String(RESULTS_PER_PAGE));
            searchUrl.searchParams.set("hl", language);
            searchUrl.searchParams.set("gl", country);
            searchUrl.searchParams.set("pws", "0");

            await page.goto(searchUrl.href, { waitUntil: "domcontentloaded" });
            await acceptGoogleConsent(page);

            if (/\/sorry(?:\/|$)/i.test(new URL(page.url()).pathname)) {
                throw new Error("Google blocked this Browserbase search. Wait before refreshing or use a different browser session.");
            }

            let extractedResults = [];
            for (let retry = 0; retry < 2; retry += 1) {
                try {
                    await page.waitForSelector("#rso h3, h3", {
                        state: "attached",
                        timeout: 20000,
                    });
                    extractedResults = await (dependencies.extractResults || extractGoogleOrganicResults)(page, googlePage);
                    if (extractedResults.length > 0) break;
                } catch (error) {
                    if (retry === 1) {
                        const title = await page.title();
                        throw new Error(`Google returned no readable results (page title: "${title}").`, { cause: error });
                    }
                }
                await page.waitForTimeout(1500);
                await page.reload({ waitUntil: "domcontentloaded" });
            }

            if (extractedResults.length === 0) {
                throw new Error("Google loaded, but no organic results could be extracted.");
            }

            const resolvedResults = await Promise.all(extractedResults.map(async (result) => {
                try {
                    return { ...result, url: await resolveGoogleRedirect(result.url, fetchImpl) };
                } catch (error) {
                    console.warn(`Unable to resolve a Google result link: ${error.message}`);
                    return null;
                }
            }));
            const pageResults = mapGoogleOrganicResults(
                resolvedResults.filter((result) => result !== null),
                allResults.length,
            );

            for (const result of pageResults) {
                allResults.push(result);
                if (!found && domainMatches(cleanTarget, result.domain)) {
                    found = result;
                }
            }

            if (resolvedResults.every((result) => result === null)) {
                throw new Error("Google results were found, but their destination links could not be resolved.");
            }
            if (found) break;
            await page.waitForTimeout(1000);
        }

        return {
            success: true,
            data: buildRankResult(normalizedKeyword, cleanTarget, allResults, country, language),
        };
    } catch (error) {
        console.error("Rank check error:", error.message);
        return { success: false, error: error.message };
    } finally {
        if (browser) {
            await browser.close().catch((error) => {
                console.error("Failed to close Browserbase browser:", error.message);
            });
        }
    }
}
