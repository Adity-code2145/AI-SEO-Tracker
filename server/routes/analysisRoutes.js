import express from "express";
import auth from "../middleware/auth.js";
import {
    createAnalysis,
    getAnalysis,
    getAnalyses,
    deleteAnalysis,
    generateAiInsightsForAnalysis,
} from "../controllers/analysisController.js";

const analysisRouter = express.Router();

analysisRouter.post("/", auth, createAnalysis);
analysisRouter.get("/", auth, getAnalyses);
analysisRouter.get("/:id", auth, getAnalysis);
analysisRouter.post("/:id/ai-insights", auth, generateAiInsightsForAnalysis);
analysisRouter.delete("/:id", auth, deleteAnalysis);

export default analysisRouter;
