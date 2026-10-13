/**
 * Gemini AI SEO Insights Service
 * Uses Google Gemini 3.5 Flash / Flash Lite via REST API with AQ authorization keys.
 * Includes automatic model fallback and resilient JSON extraction.
 */

const CANDIDATE_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-3.1-flash-lite-preview",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
];

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Extracts and parses JSON from a model's response text.
 */
function extractJsonFromText(rawText) {
    if (!rawText) return null;

    // Try finding JSON inside markdown code blocks ```json ... ```
    const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
        try {
            return JSON.parse(codeBlockMatch[1]);
        } catch {
            // fallback to greedy brace match
        }
    }

    // Try finding the outermost { ... }
    const firstBrace = rawText.indexOf("{");
    const lastBrace = rawText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const potentialJson = rawText.substring(firstBrace, lastBrace + 1);
        try {
            return JSON.parse(potentialJson);
        } catch {
            // fall through
        }
    }

    return null;
}

/**
 * Uses Gemini to generate intelligent SEO recommendations
 * based on the analysis data already extracted from the page.
 *
 * @param {object} audit - Result from htmlAnalyzer
 * @param {string} url   - The analyzed URL
 * @returns {Promise<{aiRecommendations: string[], aiSummary: string, aiKeywordSuggestions: string[]}>}
 */
export async function getGeminiInsights(audit, url) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn("GEMINI_API_KEY is not set in environment");
        return { aiRecommendations: [], aiSummary: "", aiKeywordSuggestions: [] };
    }

    const pageData = {
        url,
        title: audit.metaData?.title || "Not found",
        description: audit.metaData?.description || "Not found",
        h1: audit.headings?.h1Texts?.slice(0, 3).join(", ") || "Not found",
        h1Count: audit.headings?.h1 || 0,
        h2Count: audit.headings?.h2 || 0,
        wordCount: audit.wordCount || 0,
        internalLinks: audit.links?.internal || 0,
        externalLinks: audit.links?.external || 0,
        imagesTotal: audit.images?.total || 0,
        imagesMissingAlt: audit.images?.missingAlt || 0,
        hasCanonical: !!audit.metaData?.canonical,
        hasOgTitle: !!audit.metaData?.ogTitle,
        hasTwitterCard: !!audit.metaData?.twitterCard,
        hasViewport: !!audit.metaData?.viewport,
        overallScore: audit.overallScore || 0,
        topKeywords: (audit.keywords || []).slice(0, 5).map((k) => k.word).join(", "),
        existingIssues: (audit.issues || []).slice(0, 6).map((i) => i.message).join("; "),
        loadTime: audit.loadTime || 0,
        pageSize: audit.pageSize || 0,
    };

    const prompt = `You are an expert senior SEO consultant. Review this website audit and provide actionable expert recommendations:

Website URL: ${pageData.url}
Page Title: ${pageData.title}
Meta Description: ${pageData.description}
H1 Headings: ${pageData.h1} (Total H1: ${pageData.h1Count}, Total H2: ${pageData.h2Count})
Word Count: ${pageData.wordCount}
Links: ${pageData.internalLinks} internal, ${pageData.externalLinks} external
Images: ${pageData.imagesTotal} total (${pageData.imagesMissingAlt} missing alt text)
Meta Tags: Canonical=${pageData.hasCanonical}, OpenGraph=${pageData.hasOgTitle}, TwitterCard=${pageData.hasTwitterCard}, Mobile Viewport=${pageData.hasViewport}
Top Keywords: ${pageData.topKeywords || "None"}
Current Issues: ${pageData.existingIssues || "None"}
Overall SEO Score: ${pageData.overallScore}/100
Load Time: ${pageData.loadTime}ms, Page Size: ${Math.round(pageData.pageSize / 1024)}KB

Respond ONLY in valid JSON format:
{
  "aiSummary": "2-3 clear sentences assessing the site's overall SEO health, strengths, and primary area to fix.",
  "aiRecommendations": [
    "High-impact specific recommendation 1",
    "High-impact specific recommendation 2",
    "High-impact specific recommendation 3",
    "High-impact specific recommendation 4"
  ],
  "aiKeywordSuggestions": [
    "relevant target keyword 1",
    "relevant target keyword 2",
    "relevant target keyword 3"
  ]
}`;

    for (const model of CANDIDATE_MODELS) {
        try {
            const endpoint = `${API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.4,
                        maxOutputTokens: 900,
                    },
                }),
                signal: AbortSignal.timeout(20000), // 20-second timeout for cloud reliability
            });

            if (!response.ok) {
                const errBody = await response.text().catch(() => "");
                console.warn(`Gemini [${model}] HTTP ${response.status}: ${errBody.substring(0, 100)} - trying fallback...`);
                continue;
            }

            const data = await response.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

            const parsed = extractJsonFromText(rawText);
            if (!parsed) {
                console.warn(`Gemini [${model}] response could not be parsed as JSON, trying next model...`);
                continue;
            }

            return {
                aiSummary: typeof parsed.aiSummary === "string" ? parsed.aiSummary.trim() : "",
                aiRecommendations: Array.isArray(parsed.aiRecommendations) ? parsed.aiRecommendations.map(String) : [],
                aiKeywordSuggestions: Array.isArray(parsed.aiKeywordSuggestions) ? parsed.aiKeywordSuggestions.map(String) : [],
            };
        } catch (err) {
            console.warn(`Gemini [${model}] failed (${err.message}) - trying fallback...`);
        }
    }

    return { aiRecommendations: [], aiSummary: "", aiKeywordSuggestions: [] };
}
