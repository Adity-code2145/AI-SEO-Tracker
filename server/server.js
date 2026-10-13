import express from "express";
import cors from "cors";
import "dotenv/config";
import connectDB from "./config/db.js";
import authRouter from "./routes/authRoutes.js";
import rankRouter from "./routes/rankRoutes.js";
import analysisRouter from "./routes/analysisRoutes.js";

const app = express();

const allowedOrigins = process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(",").map((s) => s.trim())
    : ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"];

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests with no origin (e.g. server-to-server or tests)
            if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
                callback(null, true);
            } else {
                callback(new Error(`CORS not allowed for origin: ${origin}`));
            }
        },
        credentials: true,
    })
);

app.use(express.json({ limit: "2mb" }));

app.get("/", (req, res) => res.send("Server is running"));
app.use("/api/auth", authRouter);
app.use("/api/rank", rankRouter);
app.use("/api/analysis", analysisRouter);

// DEV ONLY: Reset all users' daily scan counts
if (process.env.NODE_ENV !== "production") {
    app.post("/api/dev/reset-counts", async (req, res) => {
        try {
            const User = (await import("./models/User.js")).default;
            const result = await User.updateMany({}, { $set: { analysisCount: 0, lastAnalysisDate: null } });
            res.json({ success: true, message: `Reset ${result.modifiedCount} user(s)` });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    });
}

// Global error handler
app.use((err, req, res, next) => {
    if (err?.message?.includes("CORS")) {
        return res.status(403).json({ success: false, message: err.message });
    }
    console.error("Unhandled error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
});

export default app;

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== "test") {
    await connectDB();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
