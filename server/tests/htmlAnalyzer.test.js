import test from "node:test";
import assert from "node:assert/strict";
import {
    extractSeoData,
    computeSeoScoreAndIssues,
    analyzeHtml,
} from "../services/htmlAnalyzer.js";

const SAMPLE_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Best SEO Tracking Platform for Modern Web Apps</title>
    <meta name="description" content="Discover powerful rank tracking, technical website SEO audits, and competitor analysis in one comprehensive dashboard.">
    <link rel="canonical" href="https://example.com/platform">
    <meta name="robots" content="index, follow">
    <meta property="og:title" content="AI SEO Tracker">
    <meta property="og:description" content="Automate SEO tracking and audits">
    <meta property="og:image" content="https://example.com/og.png">
    <meta name="twitter:card" content="summary_large_image">
</head>
<body>
    <h1>AI-Powered SEO Audits and Keyword Tracker</h1>
    <h2>Keyword Intelligence</h2>
    <p>Track your Google keyword rankings across international search engines with real-time updates and historical trends.</p>
    <h2>Comprehensive Audits</h2>
    <p>Perform deep scans of your website metadata, headings, internal links, and image alt text to boost organic visibility.</p>
    <a href="/pricing">View Pricing</a>
    <a href="https://example.com/features">Features</a>
    <a href="https://twitter.com/ai_tracker">Twitter</a>
    <img src="/logo.png" alt="Company Logo">
    <img src="/banner.png" alt="Dashboard Preview">
</body>
</html>
`;

test("extractSeoData parses metadata, headings, links, and images accurately", () => {
    const extracted = extractSeoData(SAMPLE_HTML, "https://example.com/platform");

    assert.equal(extracted.metaData.title, "Best SEO Tracking Platform for Modern Web Apps");
    assert.equal(extracted.metaData.description.includes("Discover powerful"), true);
    assert.equal(extracted.metaData.canonical, "https://example.com/platform");
    assert.equal(extracted.metaData.ogTitle, "AI SEO Tracker");
    assert.equal(extracted.metaData.ogImage, "https://example.com/og.png");
    assert.equal(extracted.metaData.twitterCard, "summary_large_image");
    assert.equal(extracted.metaData.charset, "UTF-8");
    assert.equal(extracted.htmlLang, "en");

    assert.equal(extracted.headings.h1, 1);
    assert.equal(extracted.headings.h2, 2);
    assert.deepEqual(extracted.headings.h1Texts, ["AI-Powered SEO Audits and Keyword Tracker"]);

    assert.equal(extracted.links.total, 3);
    assert.equal(extracted.links.internal, 2);
    assert.equal(extracted.links.external, 1);

    assert.equal(extracted.images.total, 2);
    assert.equal(extracted.images.withAlt, 2);
    assert.equal(extracted.images.missingAlt, 0);

    assert.ok(extracted.wordCount > 30);
    assert.ok(extracted.keywords.length > 0);
});

test("computeSeoScoreAndIssues awards high score for compliant page", () => {
    const extracted = extractSeoData(SAMPLE_HTML, "https://example.com/platform");
    const { categories, overallScore, issues } = computeSeoScoreAndIssues(extracted, {
        loadTime: 450,
        pageSize: 15000,
        finalUrl: "https://example.com/platform",
    });

    assert.ok(categories.seo >= 85);
    assert.ok(categories.performance >= 90);
    assert.ok(categories.accessibility >= 90);
    assert.ok(categories.bestPractices >= 90);
    assert.ok(overallScore >= 85);
    // No critical issues for this well-structured markup
    const criticals = issues.filter((i) => i.severity === "critical");
    assert.equal(criticals.length, 0);
});

test("analyzeHtml catches missing tags and flags critical issues", () => {
    const brokenHtml = `
    <html>
    <body>
        <img src="pic.jpg">
        <p>Short page</p>
    </body>
    </html>
    `;

    const audit = analyzeHtml(brokenHtml, "http://insecure-site.com", {
        loadTime: 4500,
        pageSize: 5000,
        finalUrl: "http://insecure-site.com",
    });

    assert.equal(audit.headings.h1, 0);
    assert.equal(audit.images.missingAlt, 1);
    assert.equal(audit.metaData.title, "");

    const criticalIssues = audit.issues.filter((i) => i.severity === "critical");
    assert.ok(criticalIssues.some((i) => i.message.includes("<title>")));
    assert.ok(criticalIssues.some((i) => i.message.includes("H1 heading")));
    assert.ok(criticalIssues.some((i) => i.message.includes("HTTPS")));

    assert.ok(audit.categories.seo < 60);
    assert.ok(audit.overallScore < 70);
});
