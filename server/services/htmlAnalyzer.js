const COMMON_STOP_WORDS = new Set([
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i",
    "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
    "this", "but", "his", "by", "from", "they", "we", "say", "her", "she",
    "or", "an", "will", "my", "one", "all", "would", "there", "their", "what",
    "so", "up", "out", "if", "about", "who", "get", "which", "go", "me",
    "when", "make", "can", "like", "time", "no", "just", "him", "know", "take",
    "people", "into", "year", "your", "good", "some", "could", "them", "see", "other",
    "than", "then", "now", "look", "only", "come", "its", "over", "think", "also",
    "back", "after", "use", "two", "how", "our", "work", "first", "well", "way",
    "even", "new", "want", "because", "any", "these", "give", "day", "most", "us",
    "is", "are", "was", "were", "been", "has", "had", "does", "did", "more",
]);

export function decodeHtmlEntities(text) {
    if (!text) return "";
    return text
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&nbsp;/gi, " ")
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function parseAttributes(tagHtml) {
    const attrs = {};
    const regex = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let match;
    while ((match = regex.exec(tagHtml)) !== null) {
        const key = match[1].toLowerCase();
        const value = match[2] ?? match[3] ?? match[4] ?? "";
        attrs[key] = decodeHtmlEntities(value);
    }
    return attrs;
}

export function extractSeoData(html, pageUrl) {
    let urlObj;
    try {
        urlObj = new URL(pageUrl);
    } catch {
        urlObj = new URL("https://example.com");
    }

    // 1. Meta Data
    let title = "";
    const titleMatch = html.match(/<title(?:\s+[^>]*)?>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
        title = decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, "").trim());
    }

    const metaTags = [];
    const metaRegex = /<meta\s+([^>]*?)>/gi;
    let metaMatch;
    while ((metaMatch = metaRegex.exec(html)) !== null) {
        metaTags.push(parseAttributes(metaMatch[1]));
    }

    const getMetaContent = (nameOrProperty) => {
        const target = nameOrProperty.toLowerCase();
        const found = metaTags.find((m) => (m.name && m.name.toLowerCase() === target) || (m.property && m.property.toLowerCase() === target));
        return found ? found.content || "" : "";
    };

    let charset = "";
    const charsetMeta = metaTags.find((m) => m.charset);
    if (charsetMeta) {
        charset = charsetMeta.charset;
    } else {
        const httpEquiv = metaTags.find((m) => m["http-equiv"] && m["http-equiv"].toLowerCase() === "content-type");
        if (httpEquiv && httpEquiv.content) {
            const csMatch = httpEquiv.content.match(/charset=([a-zA-Z0-9-]+)/i);
            if (csMatch) charset = csMatch[1];
        }
    }

    let canonical = "";
    const canonicalMatch = html.match(/<link\s+[^>]*?rel=["']?canonical["']?[^>]*?>/i);
    if (canonicalMatch) {
        const attrs = parseAttributes(canonicalMatch[0]);
        canonical = attrs.href || "";
    }

    const metaData = {
        title,
        description: getMetaContent("description"),
        canonical,
        robots: getMetaContent("robots"),
        ogTitle: getMetaContent("og:title"),
        ogDescription: getMetaContent("og:description"),
        ogImage: getMetaContent("og:image"),
        twitterCard: getMetaContent("twitter:card"),
        viewport: getMetaContent("viewport"),
        charset,
    };

    // 2. Headings
    const headings = {
        h1: 0,
        h2: 0,
        h3: 0,
        h4: 0,
        h5: 0,
        h6: 0,
        h1Texts: [],
    };

    const headingRegex = /<h([1-6])(?:\s+[^>]*)?>([\s\S]*?)<\/h\1>/gi;
    let hMatch;
    while ((hMatch = headingRegex.exec(html)) !== null) {
        const level = `h${hMatch[1]}`;
        headings[level] += 1;
        const text = decodeHtmlEntities(hMatch[2].replace(/<[^>]+>/g, "").trim());
        if (level === "h1" && text) {
            headings.h1Texts.push(text);
        }
    }

    // 3. Links
    const linkRegex = /<a\s+([^>]*?)>/gi;
    let aMatch;
    let internalLinks = 0;
    let externalLinks = 0;
    let totalLinks = 0;

    while ((aMatch = linkRegex.exec(html)) !== null) {
        const attrs = parseAttributes(aMatch[1]);
        const href = (attrs.href || "").trim();
        if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
            continue;
        }

        totalLinks += 1;
        try {
            const resolved = new URL(href, urlObj.href);
            if (resolved.hostname === urlObj.hostname || resolved.hostname.endsWith(`.${urlObj.hostname}`)) {
                internalLinks += 1;
            } else {
                externalLinks += 1;
            }
        } catch {
            internalLinks += 1;
        }
    }

    const links = {
        internal: internalLinks,
        external: externalLinks,
        broken: 0, // Quick single-page audit does not spider outgoing links
        total: totalLinks,
    };

    // 4. Images
    const imgRegex = /<img\s+([^>]*?)>/gi;
    let imgMatch;
    let totalImages = 0;
    let withAlt = 0;
    let missingAlt = 0;

    while ((imgMatch = imgRegex.exec(html)) !== null) {
        totalImages += 1;
        const attrs = parseAttributes(imgMatch[1]);
        if (attrs.alt && attrs.alt.trim().length > 0) {
            withAlt += 1;
        } else {
            missingAlt += 1;
        }
    }

    const images = {
        total: totalImages,
        missingAlt,
        withAlt,
    };

    // 5. Body Text & Word Count
    let cleanText = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<[^>]+>/g, " ");

    cleanText = decodeHtmlEntities(cleanText);
    const rawTokens = cleanText
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 2);

    const wordCount = rawTokens.length;

    // 6. Keywords
    const wordFreq = new Map();
    for (const token of rawTokens) {
        if (token.length >= 3 && !COMMON_STOP_WORDS.has(token) && !/^\d+$/.test(token)) {
            wordFreq.set(token, (wordFreq.get(token) || 0) + 1);
        }
    }

    const sortedKeywords = Array.from(wordFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const keywords = sortedKeywords.map(([word, count]) => ({
        word,
        count,
        density: wordCount > 0 ? Math.round((count / wordCount) * 1000) / 10 : 0,
    }));

    // 7. HTML Lang attribute
    const htmlTagMatch = html.match(/<html(?:\s+[^>]*)?>/i);
    const htmlLang = htmlTagMatch ? parseAttributes(htmlTagMatch[0]).lang || "" : "";

    return {
        metaData,
        headings,
        links,
        images,
        wordCount,
        keywords,
        htmlLang,
    };
}

export function computeSeoScoreAndIssues(extracted, pageMetrics) {
    const { metaData, headings, links, images, wordCount, htmlLang } = extracted;
    const { loadTime = 0, pageSize = 0, finalUrl = "" } = pageMetrics;

    const issues = [];

    // --- Category 1: SEO (Max 100) ---
    let seoScore = 100;

    // Title checks
    if (!metaData.title) {
        seoScore -= 25;
        issues.push({
            severity: "critical",
            category: "SEO",
            message: "Missing <title> tag on page",
            recommendation: "Add a descriptive <title> tag between 30 and 65 characters to clearly describe your page in search engines.",
        });
    } else if (metaData.title.length < 30) {
        seoScore -= 10;
        issues.push({
            severity: "warning",
            category: "SEO",
            message: `Title tag is too short (${metaData.title.length} characters)`,
            recommendation: "Expand your title tag to 30-65 characters to include relevant target keywords and branding.",
        });
    } else if (metaData.title.length > 65) {
        seoScore -= 5;
        issues.push({
            severity: "warning",
            category: "SEO",
            message: `Title tag may be truncated (${metaData.title.length} characters)`,
            recommendation: "Keep title length under 65 characters to avoid being clipped in search engine results pages.",
        });
    }

    // Meta Description checks
    if (!metaData.description) {
        seoScore -= 20;
        issues.push({
            severity: "critical",
            category: "SEO",
            message: "Missing meta description tag",
            recommendation: "Add a compelling meta description between 120 and 160 characters to improve organic click-through rates.",
        });
    } else if (metaData.description.length < 80) {
        seoScore -= 8;
        issues.push({
            severity: "warning",
            category: "SEO",
            message: `Meta description is very short (${metaData.description.length} characters)`,
            recommendation: "Aim for 120-160 characters to provide users with a complete summary of the page content.",
        });
    } else if (metaData.description.length > 165) {
        seoScore -= 5;
        issues.push({
            severity: "info",
            category: "SEO",
            message: `Meta description exceeds optimal length (${metaData.description.length} characters)`,
            recommendation: "Keep meta description under 165 characters so search snippets do not get truncated.",
        });
    }

    // H1 Heading check
    if (headings.h1 === 0) {
        seoScore -= 20;
        issues.push({
            severity: "critical",
            category: "SEO",
            message: "No H1 heading found on the page",
            recommendation: "Add exactly one <h1> heading to clearly establish the primary subject of the page.",
        });
    } else if (headings.h1 > 1) {
        seoScore -= 10;
        issues.push({
            severity: "warning",
            category: "SEO",
            message: `Multiple H1 headings found (${headings.h1} detected)`,
            recommendation: "Structure your page with a single primary <h1> heading and use <h2> through <h6> for subsections.",
        });
    }

    // Canonical tag check
    if (!metaData.canonical) {
        seoScore -= 10;
        issues.push({
            severity: "info",
            category: "SEO",
            message: "Missing canonical URL tag",
            recommendation: "Add a <link rel='canonical'> tag to specify the authoritative URL and avoid duplicate content penalties.",
        });
    }

    // Viewport meta check
    if (!metaData.viewport) {
        seoScore -= 15;
        issues.push({
            severity: "critical",
            category: "SEO",
            message: "Missing mobile viewport meta tag",
            recommendation: "Add <meta name='viewport' content='width=device-width, initial-scale=1'> for responsive mobile indexing.",
        });
    }

    // Thin content check
    if (wordCount < 200) {
        seoScore -= 10;
        issues.push({
            severity: "warning",
            category: "SEO",
            message: `Low content word count (${wordCount} words)`,
            recommendation: "Add comprehensive and informative text content. Search engines favor content that thoroughly answers user intent.",
        });
    }

    // --- Category 2: Performance (Server Response & Document Size) (Max 100) ---
    // Note: Plain HTTP fetch measures server response and document weight, not in-browser Core Web Vitals
    let perfScore = 100;

    if (loadTime > 4000) {
        perfScore -= 35;
        issues.push({
            severity: "critical",
            category: "Performance",
            message: `Slow server response time (${loadTime}ms)`,
            recommendation: "Optimize server processing time, leverage edge caching, or host content closer to users via CDN.",
        });
    } else if (loadTime > 2000) {
        perfScore -= 20;
        issues.push({
            severity: "warning",
            category: "Performance",
            message: `Moderate server response time (${loadTime}ms)`,
            recommendation: "Aim for server response times under 1000ms by optimizing backend queries and caching.",
        });
    } else if (loadTime > 1000) {
        perfScore -= 10;
    }

    const pageSizeKb = Math.round(pageSize / 1024);
    if (pageSizeKb > 2500) {
        perfScore -= 25;
        issues.push({
            severity: "warning",
            category: "Performance",
            message: `Large HTML document size (${pageSizeKb} KB)`,
            recommendation: "Reduce HTML payload size by deferring non-critical scripts, minifying markup, and externalizing styles.",
        });
    } else if (pageSizeKb > 1000) {
        perfScore -= 12;
    }

    if (images.total > 35) {
        perfScore -= 10;
        issues.push({
            severity: "info",
            category: "Performance",
            message: `High number of images (${images.total} images)`,
            recommendation: "Ensure lazy loading (loading='lazy') is enabled on offscreen images to speed up initial page render.",
        });
    }

    // --- Category 3: Accessibility (Max 100) ---
    let a11yScore = 100;

    if (images.total > 0 && images.missingAlt > 0) {
        const altRatio = images.withAlt / images.total;
        const penalty = Math.round((1 - altRatio) * 35);
        a11yScore -= Math.max(10, penalty);
        issues.push({
            severity: images.missingAlt > 3 ? "critical" : "warning",
            category: "Accessibility",
            message: `${images.missingAlt} of ${images.total} images are missing alt text attributes`,
            recommendation: "Add descriptive 'alt' attributes to all informative images so screen readers can interpret them.",
        });
    }

    if (!htmlLang) {
        a11yScore -= 20;
        issues.push({
            severity: "warning",
            category: "Accessibility",
            message: "Missing 'lang' attribute on <html> tag",
            recommendation: "Specify language in your html tag (e.g. <html lang='en'>) to allow screen readers to choose the correct accent.",
        });
    }

    if (!metaData.title) {
        a11yScore -= 20;
    }

    if (headings.h1 === 0 && headings.h2 === 0) {
        a11yScore -= 15;
        issues.push({
            severity: "warning",
            category: "Accessibility",
            message: "Lack of structural heading hierarchy",
            recommendation: "Use standard heading tags (H1, H2, H3) to structure content logically for screen readers.",
        });
    }

    // --- Category 4: Best Practices (Max 100) ---
    let bpScore = 100;

    const isHttps = finalUrl.toLowerCase().startsWith("https://");
    if (!isHttps) {
        bpScore -= 35;
        issues.push({
            severity: "critical",
            category: "Best Practices",
            message: "Website is not served securely over HTTPS",
            recommendation: "Install an SSL/TLS certificate and enforce HTTPS across the entire domain.",
        });
    }

    if (!metaData.charset) {
        bpScore -= 20;
        issues.push({
            severity: "warning",
            category: "Best Practices",
            message: "Character encoding is not declared",
            recommendation: "Add <meta charset='UTF-8'> early inside your <head> to prevent character rendering bugs.",
        });
    }

    if (!metaData.ogTitle || !metaData.ogImage) {
        bpScore -= 15;
        issues.push({
            severity: "info",
            category: "Best Practices",
            message: "Incomplete Open Graph social meta tags",
            recommendation: "Define og:title, og:description, and og:image tags for rich previews on social networks and chat apps.",
        });
    }

    if (!metaData.twitterCard) {
        bpScore -= 10;
        issues.push({
            severity: "info",
            category: "Best Practices",
            message: "Missing Twitter Card meta tags",
            recommendation: "Add <meta name='twitter:card' content='summary_large_image'> to format Twitter link shares.",
        });
    }

    // Normalize scores between 0 and 100
    const clamp = (val) => Math.max(0, Math.min(100, Math.round(val)));
    const categories = {
        seo: clamp(seoScore),
        performance: clamp(perfScore),
        accessibility: clamp(a11yScore),
        bestPractices: clamp(bpScore),
    };

    const overallScore = clamp(
        categories.seo * 0.4 +
        categories.performance * 0.2 +
        categories.accessibility * 0.2 +
        categories.bestPractices * 0.2
    );

    // Sort issues: critical first, then warning, then info
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return {
        categories,
        overallScore,
        issues,
    };
}

export function analyzeHtml(html, targetUrl, pageMetrics = {}) {
    const extracted = extractSeoData(html, targetUrl);
    const { categories, overallScore, issues } = computeSeoScoreAndIssues(extracted, {
        loadTime: pageMetrics.loadTime,
        pageSize: pageMetrics.pageSize,
        finalUrl: pageMetrics.finalUrl || targetUrl,
    });

    return {
        overallScore,
        categories,
        metaData: extracted.metaData,
        headings: extracted.headings,
        links: extracted.links,
        images: extracted.images,
        keywords: extracted.keywords,
        issues,
        wordCount: extracted.wordCount,
        loadTime: pageMetrics.loadTime || 0,
        pageSize: pageMetrics.pageSize || 0,
    };
}
