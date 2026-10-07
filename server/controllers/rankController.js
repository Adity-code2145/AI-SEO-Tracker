import mongoose from "mongoose";
import KeywordTracking from "../models/keywordTracking.js";
import { keywordTracking } from "../services/keywordTrackingService.js";
import { normalizeDomain, normalizeKeyword } from "../services/rankUtils.js";

const getTrackingForUser = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        res.status(400).json({ success: false, message: "Invalid tracking ID" });
        return null;
    }

    const tracking = await KeywordTracking.findOne({
        _id: req.params.id,
        userId: req.userId,
    });

    if (!tracking) {
        res.status(404).json({ success: false, message: "Keyword tracking not found" });
    }

    return tracking;
};

export const addKeyword = async (req, res) => {
    try {
        const keyword = typeof req.body.keyword === "string" ? normalizeKeyword(req.body.keyword) : "";
        const rawUrl = typeof req.body.url === "string" ? req.body.url.trim() : "";

        if (!keyword || !rawUrl) {
            return res.status(400).json({ success: false, message: "Keyword and URL are required" });
        }

        let normalizedUrl;
        let domain;
        try {
            const candidate = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
            const urlObject = new URL(candidate);
            if (!["http:", "https:"].includes(urlObject.protocol) || !urlObject.hostname) {
                throw new Error("Unsupported URL");
            }
            normalizedUrl = urlObject.toString();
            domain = normalizeDomain(normalizedUrl);
        } catch {
            return res.status(400).json({ success: false, message: "Invalid URL format" });
        }

        const normalizedKeyword = keyword.toLowerCase();
        const existing = await KeywordTracking.findOne({
            userId: req.userId,
            keyword: normalizedKeyword,
            domain,
        });
        if (existing) {
            return res.status(400).json({ success: false, message: "Already tracking this keyword for this domain" });
        }

        const tracking = await KeywordTracking.create({
            userId: req.userId,
            keyword: normalizedKeyword,
            url: normalizedUrl,
            domain,
            status: "checking",
        });

        res.status(201).json({ success: true, message: "Keyword tracking started", tracking });
        void keywordTracking(tracking).catch((error) => {
            console.error("Background keyword tracking error:", error);
        });
    } catch (error) {
        console.error("Add keyword error:", error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "Already tracking this keyword for this domain" });
        }
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const getKeywords = async (req, res) => {
    try {
        const keywords = await KeywordTracking.find({ userId: req.userId })
            .sort({ createdAt: -1 })
            .select("-rankHistory");
        res.json({ success: true, keywords });
    } catch (error) {
        console.error("Get keywords error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const getKeyword = async (req, res) => {
    try {
        const tracking = await getTrackingForUser(req, res);
        if (!tracking) return;
        res.json({ success: true, tracking });
    } catch (error) {
        console.error("Get keyword error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const refreshKeyword = async (req, res) => {
    try {
        const tracking = await getTrackingForUser(req, res);
        if (!tracking) return;
        tracking.status = "checking";
        tracking.lastError = "";
        await tracking.save();
        res.json({ success: true, tracking });
        void keywordTracking(tracking).catch((error) => {
            console.error("Background keyword refresh error:", error);
        });
    } catch (error) {
        console.error("Refresh keyword error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const deleteKeyword = async (req, res) => {
    try {
        const tracking = await getTrackingForUser(req, res);
        if (!tracking) return;
        await tracking.deleteOne();
        res.json({ success: true, message: "Keyword tracking deleted" });
    } catch (error) {
        console.error("Delete keyword error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const toggleTracking = async (req, res) => {
    try {
        const tracking = await getTrackingForUser(req, res);
        if (!tracking) return;
        tracking.active = !tracking.active;
        await tracking.save();
        res.json({ success: true, tracking });
    } catch (error) {
        console.error("Toggle keyword error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};