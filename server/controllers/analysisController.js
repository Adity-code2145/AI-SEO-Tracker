import mongoose from "mongoose";
import Analysis from "../models/Analysis.js";
import User from "../models/User.js";
import { validateAndNormalizeUrl } from "../services/ssrfGuard.js";
import { executeAnalysis } from "../services/analysisService.js";
import { getGeminiInsights } from "../services/geminiService.js";

// Create / Start analysis for a URL
export const createAnalysis = async (req, res) => {
    try {
        const rawUrl = req.body?.url;
        if (!rawUrl || typeof rawUrl !== "string") {
            return res.status(400).json({ success: false, message: "URL is required" });
        }

        let normalizedUrl;
        try {
            normalizedUrl = validateAndNormalizeUrl(rawUrl).href;
        } catch (urlError) {
            return res.status(400).json({ success: false, message: urlError.message });
        }

        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Quota check for free plan (5 scans per day)
        const now = new Date();
        const lastDate = user.lastAnalysisDate ? new Date(user.lastAnalysisDate) : null;
        const isSameDay = lastDate && lastDate.toDateString() === now.toDateString();

        if (!isSameDay) {
            user.analysisCount = 0;
        }

        if (user.plan === "free" && user.analysisCount >= 50) {
            return res.status(429).json({
                success: false,
                message: "Daily limit reached (50 scans per day for Free plan). Upgrade to Pro for unlimited scans.",
            });
        }

        user.analysisCount = (user.analysisCount || 0) + 1;
        user.lastAnalysisDate = now;
        await user.save();

        const analysis = await Analysis.create({
            userId: req.userId,
            url: normalizedUrl,
            status: "processing",
        });

        res.status(201).json({
            success: true,
            message: "Analysis started",
            analysisId: analysis._id,
            analysis,
        });

        // Run analysis in background
        void executeAnalysis(analysis._id).catch((err) => {
            console.error(`Background analysis error for ${analysis._id}:`, err.message);
        });
    } catch (error) {
        console.error("Create analysis error:", error.message);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Get single analysis by ID
export const getAnalysis = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid analysis ID" });
        }

        const analysis = await Analysis.findOne({
            _id: req.params.id,
            userId: req.userId,
        });

        if (!analysis) {
            return res.status(404).json({ success: false, message: "Analysis not found" });
        }

        res.json({ success: true, analysis });
    } catch (error) {
        console.error("Get analysis error:", error.message);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Get all analyses for authenticated user with filters and pagination
export const getAnalyses = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const skip = (page - 1) * limit;

        const query = { userId: req.userId };

        if (req.query.status && ["completed", "processing", "failed", "pending"].includes(req.query.status)) {
            query.status = req.query.status;
        }

        if (req.query.search && typeof req.query.search === "string") {
            const sanitizedSearch = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            if (sanitizedSearch) {
                query.url = { $regex: sanitizedSearch, $options: "i" };
            }
        }

        let sortOption = { createdAt: -1 };
        if (req.query.sort === "oldest") sortOption = { createdAt: 1 };
        else if (req.query.sort === "score_high") sortOption = { overallScore: -1, createdAt: -1 };
        else if (req.query.sort === "score_low") sortOption = { overallScore: 1, createdAt: -1 };

        const [analyses, total] = await Promise.all([
            Analysis.find(query)
                .sort(sortOption)
                .skip(skip)
                .limit(limit)
                .select("url overallScore categories status createdAt loadTime pageSize wordCount"),
            Analysis.countDocuments(query),
        ]);

        const totalPages = Math.ceil(total / limit) || 1;

        res.json({
            success: true,
            analyses,
            total,
            totalPages,
            page,
        });
    } catch (error) {
        console.error("Get analyses error:", error.message);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Delete single analysis
export const deleteAnalysis = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid analysis ID" });
        }

        const analysis = await Analysis.findOneAndDelete({
            _id: req.params.id,
            userId: req.userId,
        });

        if (!analysis) {
            return res.status(404).json({ success: false, message: "Analysis not found" });
        }

        res.json({ success: true, message: "Analysis deleted" });
    } catch (error) {
        console.error("Delete analysis error:", error.message);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Generate or re-generate Gemini AI insights on-demand for an existing completed analysis
export const generateAiInsightsForAnalysis = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid analysis ID" });
        }

        const analysis = await Analysis.findOne({
            _id: req.params.id,
            userId: req.userId,
        });

        if (!analysis) {
            return res.status(404).json({ success: false, message: "Analysis not found" });
        }

        const audit = {
            overallScore: analysis.overallScore,
            metaData: analysis.metaData,
            headings: analysis.headings,
            links: analysis.links,
            images: analysis.images,
            keywords: analysis.keywords,
            issues: analysis.issues,
            wordCount: analysis.wordCount,
            loadTime: analysis.loadTime,
            pageSize: analysis.pageSize,
        };

        const gemini = await getGeminiInsights(audit, analysis.url);

        if (!gemini.aiSummary) {
            return res.status(502).json({
                success: false,
                message: "Gemini API is temporarily busy. Please retry in a few moments.",
            });
        }

        analysis.aiSummary = gemini.aiSummary;
        analysis.aiRecommendations = gemini.aiRecommendations;
        analysis.aiKeywordSuggestions = gemini.aiKeywordSuggestions;
        await analysis.save();

        res.json({
            success: true,
            message: "AI insights generated successfully",
            analysis,
        });
    } catch (error) {
        console.error("Generate AI insights error:", error.message);
        res.status(500).json({ success: false, message: error.message || "Failed to generate AI insights" });
    }
};