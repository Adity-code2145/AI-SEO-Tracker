import test from "node:test";
import assert from "node:assert/strict";
import {
    buildRankResult,
    mapGoogleOrganicResults,
    rankTracker,
} from "../services/rankTrackerService.js";

function createBrowserHarness({ resultsByPage, blocked = false }) {
    const visitedUrls = [];
    const page = {
        currentUrl: "https://www.google.com/",
        setDefaultNavigationTimeout() {},
        async goto(url) {
            this.currentUrl = blocked ? "https://www.google.com/sorry/index" : url;
            visitedUrls.push(url);
        },
        url() {
            return this.currentUrl;
        },
        locator() {
            return { first: () => ({ count: async () => 0 }) };
        },
        getByRole() {
            return { first: () => ({ count: async () => 0 }) };
        },
        async waitForSelector() {},
        async waitForTimeout() {},
        async reload() {},
    };
    let closed = false;
    const browser = {
        contexts: () => [{
            pages: () => [page],
            newPage: async () => page,
        }],
        close: async () => {
            closed = true;
        },
    };

    return {
        visitedUrls,
        get closed() {
            return closed;
        },
        dependencies: {
            environment: {
                BROWSERBASE_API_KEY: "test-browserbase-key",
                GOOGLE_SEARCH_COUNTRY: "in",
                GOOGLE_SEARCH_LANGUAGE: "en",
            },
            createBrowserbase: (apiKey) => {
                assert.equal(apiKey, "test-browserbase-key");
                return { sessions: { create: async () => ({ connectUrl: "wss://browserbase.test" }) } };
            },
            chromium: { connectOverCDP: async () => browser },
            extractResults: async (_page, pageIndex) => resultsByPage[pageIndex] || [],
            fetchImpl: async () => {
                throw new Error("Direct result URLs should not need redirect resolution");
            },
        },
    };
}

test("maps organic result URLs, domains and positions", () => {
    assert.deepEqual(
        mapGoogleOrganicResults([
            { url: "https://www.react.dev/learn", title: "React Learn", snippet: "Docs" },
            { url: "https://www.google.com/search?q=other", title: "Google", snippet: "" },
            { url: "javascript:void(0)", title: "Invalid", snippet: "" },
        ]),
        [{
            position: 1,
            url: "https://www.react.dev/learn",
            domain: "react.dev",
            title: "React Learn",
            snippet: "Docs",
        }],
    );
});

test("maps a Browserbase Google search to the target rank", async () => {
    const harness = createBrowserHarness({
        resultsByPage: [[
            { url: "https://example.com/", title: "Example", snippet: "" },
            { url: "https://greatstack.dev/projects", title: "GreatStack projects", snippet: "Full stack projects" },
        ]],
    });
    const result = await rankTracker(" full stack project ", "https://www.greatstack.dev/path", harness.dependencies);

    assert.equal(result.success, true);
    assert.equal(result.data.keyword, "full stack project");
    assert.equal(result.data.position, 2);
    assert.equal(result.data.page, 1);
    assert.equal(result.data.totalResultsScanned, 2);
    assert.match(harness.visitedUrls[0], /q=full\+stack\+project/);
    assert.match(harness.visitedUrls[0], /gl=in/);
    assert.equal(harness.closed, true);
});

test("continues through result pages while preserving organic positions", async () => {
    const firstPage = Array.from({ length: 10 }, (_, index) => ({
        url: `https://site${index}.example/`,
        title: `Result ${index + 1}`,
        snippet: "",
    }));
    const harness = createBrowserHarness({
        resultsByPage: [
            firstPage,
            [{ url: "https://target.example/page", title: "Target", snippet: "" }],
        ],
    });
    const result = await rankTracker("target keyword", "target.example", harness.dependencies);

    assert.equal(result.success, true);
    assert.equal(result.data.position, 11);
    assert.equal(result.data.page, 2);
    assert.equal(result.data.totalResultsScanned, 11);
    assert.equal(harness.visitedUrls.length, 2);
    assert.match(harness.visitedUrls[1], /start=10/);
});

test("returns a clear error when Browserbase's Google request is blocked", async () => {
    const harness = createBrowserHarness({ resultsByPage: [], blocked: true });
    const result = await rankTracker("react", "react.dev", harness.dependencies);

    assert.equal(result.success, false);
    assert.match(result.error, /Google blocked this Browserbase search/);
    assert.equal(harness.closed, true);
});

test("requires the Browserbase API key", async () => {
    const result = await rankTracker("react", "react.dev", {
        environment: {},
    });

    assert.equal(result.success, false);
    assert.match(result.error, /BROWSERBASE_API_KEY is not configured/);
});

test("matches target domains and reports successful missing ranks", () => {
    const result = buildRankResult(
        '" React docs "',
        "https://www.react.dev",
        [{
            position: 1,
            domain: "example.com",
            url: "https://example.com",
            title: "Example",
            snippet: "",
        }],
        "in",
        "en",
    );

    assert.equal(result.keyword, "react docs");
    assert.equal(result.targetDomain, "react.dev");
    assert.equal(result.position, null);
    assert.equal(result.page, null);
    assert.equal(result.totalResultsScanned, 1);
});
