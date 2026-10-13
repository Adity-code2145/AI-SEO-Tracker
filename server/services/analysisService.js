import Analysis from "../models/Analysis.js";
import { safeFetchHtml } from "./ssrfGuard.js";
import { analyzeHtml } from "./htmlAnalyzer.js";
import { getGeminiInsights } from "./geminiService.js";

export async function executeAnalysis(analysisId, dependencies = {}) {
    const analysis = await Analysis.findById(analysisId);
    if (!analysis) {
        throw new Error("Analysis record not found");
    }

    try {
        analysis.status = "processing";
        analysis.errorMessage = "";
        await analysis.save();

        const fetchOptions = {
            fetchImpl: dependencies.fetchImpl,
            dnsLookupImpl: dependencies.dnsLookupImpl,
            timeoutMs: dependencies.timeoutMs,
            maxByteLength: dependencies.maxByteLength,
            maxRedirects: dependencies.maxRedirects,
        };

        const fetchResult = await (dependencies.fetchHtml || safeFetchHtml)(
            analysis.url,
            fetchOptions
        );

        const audit = (dependencies.analyzeHtml || analyzeHtml)(
            fetchResult.html,
            fetchResult.finalUrl || analysis.url,
            {
                loadTime: fetchResult.loadTime,
                pageSize: fetchResult.pageSize,
                finalUrl: fetchResult.finalUrl || analysis.url,
            }
        );

        analysis.overallScore = audit.overallScore;
        analysis.categories = audit.categories;
        analysis.metaData = audit.metaData;
        analysis.headings = audit.headings;
        analysis.links = audit.links;
        analysis.images = audit.images;
        analysis.keywords = audit.keywords;
        analysis.issues = audit.issues;
        analysis.wordCount = audit.wordCount;
        analysis.loadTime = audit.loadTime;
        analysis.pageSize = audit.pageSize;

        // Get AI-powered insights from Gemini (runs after basic analysis)
        const gemini = await (dependencies.getGeminiInsights || getGeminiInsights)(
            audit,
            fetchResult.finalUrl || analysis.url
        );
        analysis.aiSummary = gemini.aiSummary || "";
        analysis.aiRecommendations = gemini.aiRecommendations || [];
        analysis.aiKeywordSuggestions = gemini.aiKeywordSuggestions || [];

        analysis.status = "completed";
        analysis.errorMessage = "";

        await analysis.save();
        return analysis;
    } catch (error) {
        console.error(`Analysis failed for ${analysis.url}:`, error.message);
        analysis.status = "failed";
        analysis.errorMessage = error.message || "Failed to analyze website.";
        await analysis.save();
        return analysis;
    }
}
