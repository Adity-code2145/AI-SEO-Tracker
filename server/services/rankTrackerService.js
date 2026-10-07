import { chromium } from "playwright-core";
import Browserbase from "@browserbasehq/sdk";
import { domainMatches, normalizeDomain, normalizeKeyword } from "./rankUtils.js";

const RESULTS_PER_PAGE = 10;
const MAX_PAGES = 5;

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

async function extractOrganicResults(page) {
    return page.evaluate(() => {
        const root = document.querySelector("#rso") || document;
        return Array.from(root.querySelectorAll("h3"))
            .map((heading) => {
                const anchor = heading.closest("a");
                if (!anchor) return null;

                let resultCard = anchor.parentElement;
                for (let depth = 0; depth < 5 && resultCard; depth += 1, resultCard = resultCard.parentElement) {
                    if (resultCard.matches(".MjjYud, [data-sokoban-container]")) break;
                }
                const cardText = resultCard?.innerText || "";
                if (/^\s*sponsored\b/i.test(cardText)) return null;

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

                return {
                    href: anchor.href,
                    title: heading.innerText.trim(),
                    snippet,
                };
            })
            .filter((result) => result !== null);
    });
}

async function resolveResultUrl(href) {
    const resultUrl = new URL(href);
    if (!resultUrl.hostname.includes("google.")) return resultUrl.href;

    const directDestination =
        resultUrl.searchParams.get("q") ||
        resultUrl.searchParams.get("url") ||
        resultUrl.searchParams.get("adurl");
    if (directDestination && /^https?:\/\//i.test(directDestination)) {
        return new URL(directDestination).href;
    }

    const response = await fetch(resultUrl.href, {
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
    });
    const location = response.headers.get("location");
    if (!location || ![301, 302, 303, 307, 308].includes(response.status)) {
        throw new Error(`Google did not resolve the search result link (HTTP ${response.status})`);
    }

    const destination = new URL(location, resultUrl);
    if (!["http:", "https:"].includes(destination.protocol) || destination.hostname.includes("google.")) {
        throw new Error("Google returned an invalid search result destination");
    }
    return destination.href;
}

export async function rankTracker(keyword, targetDomain) {
    let browser;
    try {
        const normalizedKeyword = normalizeKeyword(keyword);
        const cleanTarget = normalizeDomain(targetDomain);
        const country = (process.env.GOOGLE_SEARCH_COUNTRY || "in").toLowerCase();
        const language = (process.env.GOOGLE_SEARCH_LANGUAGE || "en").toLowerCase();
        const browserbase = new Browserbase({
            apiKey: process.env.BROWSERBASE_API_KEY,
        });
        const session = await browserbase.sessions.create({
            browserSettings: { blockAds: true },
        });
        browser = await chromium.connectOverCDP(session.connectUrl);
        const context = browser.contexts()[0];
        if (!context) throw new Error("Browser session did not provide a browser context");
        const page = context.pages()[0] ?? await context.newPage();
        page.setDefaultNavigationTimeout(45000);

        const allResults = [];
        let found = null;

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
                throw new Error("Google blocked this automated search. Try again later.");
            }

            let pageResults = [];
            for (let retry = 0; retry < 2; retry += 1) {
                try {
                    await page.waitForSelector("#rso h3, h3", {
                        state: "attached",
                        timeout: 20000,
                    });
                    pageResults = await extractOrganicResults(page);
                    if (pageResults.length > 0) break;
                } catch (error) {
                    if (retry === 1) {
                        const title = await page.title();
                        const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 300);
                        throw new Error(
                            `Google returned no readable search results (title: "${title}"). ${bodyText}`,
                            { cause: error },
                        );
                    }
                }

                await page.waitForTimeout(1500);
                await page.reload({ waitUntil: "domcontentloaded" });
            }

            if (pageResults.length === 0) {
                throw new Error("Google loaded the page but no organic search results could be extracted.");
            }

            const resolvedResults = await Promise.all(
                pageResults.map(async (result, resultIndex) => {
                    try {
                        const url = await resolveResultUrl(result.href);
                        const domain = normalizeDomain(url);
                        if (domain.includes("google.")) return null;
                        return {
                            url,
                            domain,
                            title: result.title,
                            snippet: result.snippet,
                            position: googlePage * RESULTS_PER_PAGE + resultIndex + 1,
                        };
                    } catch (error) {
                        console.warn(`Could not resolve Google result "${result.title}":`, error.message);
                        return null;
                    }
                }),
            );

            for (const result of resolvedResults) {
                if (!result) continue;
                allResults.push(result);
                if (!found && domainMatches(cleanTarget, result.domain)) {
                    found = { ...result, page: googlePage + 1 };
                }
            }
            if (resolvedResults.every((result) => result === null)) {
                throw new Error("Google search results were found, but none of their destination links could be resolved.");
            }
            if (found) break;
            await page.waitForTimeout(1000);
        }

        return {
            success: true,
            data: {
                keyword: normalizedKeyword,
                targetDomain: cleanTarget,
                position: found?.position ?? null,
                page: found?.page ?? null,
                title: found?.title || "",
                snippet: found?.snippet || "",
                competitors: allResults
                    .filter((result) => !domainMatches(cleanTarget, result.domain))
                    .slice(0, 10),
                totalResultsScanned: allResults.length,
                maxResults: MAX_PAGES * RESULTS_PER_PAGE,
                country,
                language,
            },
        };
    } catch (error) {
        console.error("Rank check error:", error);
        return { success: false, error: error.message };
    } finally {
        if (browser) {
            await browser.close().catch((error) => {
                console.error("Failed to close ranking browser:", error);
            });
        }
    }
}
