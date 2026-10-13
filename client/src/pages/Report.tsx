import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import ScoreGauge from "../components/ScoreGauge";
import IssueCard from "../components/IssueCard";
import {
    ArrowLeft,
    Globe,
    Clock,
    FileText,
    Image,
    Link2,
    Heading,
    Tag,
    AlertCircle,
    ExternalLink,
    Type,
    Search,
    Loader2,
    Sparkles,
    RefreshCw,
} from "lucide-react";
import { useApp } from "../context/useApp";
import axios from "axios";
import toast from "react-hot-toast";

interface AnalysisData {
    _id: string;
    url: string;
    overallScore: number;
    status: string;
    errorMessage?: string;
    createdAt: string;
    loadTime: number;
    pageSize: number;
    wordCount: number;
    categories: {
        seo: number;
        performance: number;
        accessibility: number;
        bestPractices: number;
    };
    metaData: {
        title: string;
        description: string;
        canonical: string;
        robots: string;
        ogTitle: string;
        ogDescription: string;
        ogImage: string;
        twitterCard: string;
        viewport: string;
        charset: string;
    };
    headings: {
        h1: number;
        h2: number;
        h3: number;
        h4: number;
        h5: number;
        h6: number;
        h1Texts: string[];
    };
    links: {
        internal: number;
        external: number;
        total: number;
    };
    images: {
        total: number;
        missingAlt: number;
        withAlt: number;
    };
    keywords: { word: string; count: number; density: number }[];
    issues: { severity: string; category: string; message: string; recommendation: string }[];
    aiSummary?: string;
    aiRecommendations?: string[];
    aiKeywordSuggestions?: string[];
}

export default function Report() {
    const { id } = useParams();
    const { api } = useApp();
    const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState("overview");
    const [generatingAi, setGeneratingAi] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const handleGenerateAi = async () => {
        if (!id || generatingAi) return;
        setGeneratingAi(true);
        try {
            const { data } = await api.post(`/api/analysis/${id}/ai-insights`);
            if (data.success && data.analysis) {
                setAnalysis(data.analysis as AnalysisData);
                toast.success("AI insights generated successfully!");
            }
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                toast.error(err.response?.data?.message || "Failed to generate AI insights.");
            } else {
                toast.error("Failed to generate AI insights.");
            }
        } finally {
            setGeneratingAi(false);
        }
    };

    const stopPolling = () => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    };

    useEffect(() => {
        if (!id) return;
        let isMounted = true;
        stopPolling();

        const fetchAnalysis = async () => {
            try {
                const { data } = await api.get(`/api/analysis/${id}`);
                if (!isMounted) return;

                if (data.success && data.analysis) {
                    const loaded = data.analysis as AnalysisData;
                    // Ensure categories bestPractices fallback
                    if (loaded.categories && !(loaded.categories as Record<string, number>).bestPractices) {
                        (loaded.categories as Record<string, number>).bestPractices =
                            (loaded.categories as Record<string, number>).bestpractices ?? 0;
                    }
                    setAnalysis(loaded);
                    setError("");

                    // If still processing, poll until done
                    if (loaded.status === "processing") {
                        pollRef.current = setInterval(async () => {
                            try {
                                const pollRes = await api.get(`/api/analysis/${id}`);
                                const updated = pollRes.data?.analysis as AnalysisData;
                                if (updated && isMounted) {
                                    if (updated.status !== "processing") {
                                        stopPolling();
                                    }
                                    setAnalysis(updated);
                                }
                            } catch {
                                stopPolling();
                            }
                        }, 2000);
                    }
                } else {
                    setError(data.message || "Report not found.");
                }
            } catch (err: unknown) {
                if (!isMounted) return;
                if (axios.isAxiosError(err)) {
                    setError(err.response?.data?.message || "Failed to load report.");
                } else {
                    setError("Failed to load report.");
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        void fetchAnalysis();

        return () => {
            isMounted = false;
            stopPolling();
        };
    }, [id, api]);

    const getScoreClass = (s: number) => {
        if (s >= 80) return "score-good";
        if (s >= 50) return "score-medium";
        return "score-poor";
    };

    const getScoreBgClass = (s: number) => {
        if (s >= 80) return "score-bg-good";
        if (s >= 50) return "score-bg-medium";
        return "score-bg-poor";
    };

    const getHostname = (targetUrl: string) => {
        try {
            return new URL(targetUrl).hostname;
        } catch {
            return targetUrl;
        }
    };

    const tabs = [
        { id: "overview", label: "Overview" },
        { id: "meta", label: "Meta Tags" },
        { id: "content", label: "Content" },
        { id: "issues", label: "Issues" },
        { id: "ai", label: "✨ AI Insights" },
    ];

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center">
                    <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground text-sm">Loading report...</p>
                </div>
            </div>
        );
    }

    if (error || !analysis) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center px-4">
                <div className="text-center bg-card border border-border rounded-2xl p-10 max-w-md w-full">
                    <AlertCircle size={48} className="mx-auto text-danger mb-4" />
                    <h2 className="text-xl font-bold text-foreground mb-2">Report Not Found</h2>
                    <p className="text-muted-foreground text-sm mb-6">{error || "This analysis doesn't exist or you don't have access to it."}</p>
                    <Link
                        to="/dashboard"
                        className="bg-primary px-5 py-2.5 rounded-xl text-sm font-semibold text-primary-foreground inline-block"
                        style={{ color: "var(--background)" }}
                    >
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    if (analysis.status === "processing") {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center px-4">
                <div className="text-center bg-card border border-border rounded-2xl p-10 max-w-md w-full">
                    <Loader2 size={48} className="mx-auto text-primary animate-spin mb-4" />
                    <h2 className="text-xl font-bold text-foreground mb-2">Audit in Progress</h2>
                    <p className="text-muted-foreground text-sm mb-6">
                        We are currently scanning <span className="font-semibold text-foreground">{analysis.url}</span>. This page will update automatically.
                    </p>
                    <Link
                        to="/dashboard"
                        className="glass px-5 py-2.5 rounded-xl text-sm font-medium text-foreground inline-block hover:bg-muted/50"
                    >
                        Return to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    if (analysis.status === "failed") {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center px-4">
                <div className="text-center bg-card border border-border rounded-2xl p-10 max-w-md w-full">
                    <AlertCircle size={48} className="mx-auto text-danger mb-4" />
                    <h2 className="text-xl font-bold text-foreground mb-2">Analysis Failed</h2>
                    <p className="text-muted-foreground text-sm mb-6">
                        {analysis.errorMessage || "Unable to complete the SEO audit for this website."}
                    </p>
                    <div className="flex gap-3 justify-center">
                        <Link
                            to="/dashboard"
                            className="glass px-5 py-2.5 rounded-xl text-sm font-medium text-foreground inline-block hover:bg-muted/50"
                        >
                            Dashboard
                        </Link>
                        <Link
                            to="/analyze"
                            className="bg-primary px-5 py-2.5 rounded-xl text-sm font-semibold text-primary-foreground inline-block"
                            style={{ color: "var(--background)" }}
                        >
                            Try Another URL
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const issues = analysis.issues || [];
    const criticalCount = issues.filter((i) => i.severity === "critical").length;
    const warningCount = issues.filter((i) => i.severity === "warning").length;
    const infoCount = issues.filter((i) => i.severity === "info").length;

    const categories = analysis.categories || { seo: 0, performance: 0, accessibility: 0, bestPractices: 0 };
    const metaData = analysis.metaData || {
        title: "",
        description: "",
        canonical: "",
        robots: "",
        ogTitle: "",
        ogDescription: "",
        ogImage: "",
        twitterCard: "",
        viewport: "",
        charset: "",
    };
    const headings = analysis.headings || { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0, h1Texts: [] };
    const links = analysis.links || { internal: 0, external: 0, total: 0 };
    const images = analysis.images || { total: 0, missingAlt: 0, withAlt: 0 };
    const keywords = analysis.keywords || [];

    return (
        <div className="min-h-screen pt-16 md:pt-24 bg-background">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
                {/* Back + Header */}
                <div className="mb-8">
                    <Link
                        to="/dashboard"
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
                    >
                        <ArrowLeft size={16} />
                        Back to Dashboard
                    </Link>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                            <h1 className="text-2xl font-medium text-foreground truncate">{getHostname(analysis.url)}</h1>
                            <div className="flex items-center gap-3 mt-1">
                                <a
                                    href={analysis.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-muted-foreground hover:text-primary truncate flex items-center gap-1 transition-colors"
                                >
                                    {analysis.url}
                                    <ExternalLink size={12} />
                                </a>
                                <span className="text-xs text-muted-foreground">
                                    {new Date(analysis.createdAt).toLocaleDateString()} at{" "}
                                    {new Date(analysis.createdAt).toLocaleTimeString()}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Score Hero */}
                <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 mb-6" style={{ animationDelay: "100ms" }}>
                    <div className="flex flex-col md:flex-row items-center gap-8">
                        {/* Overall Score */}
                        <ScoreGauge score={analysis.overallScore} size={160} strokeWidth={12} label="Overall Score" />

                        {/* Category Scores */}
                        <div className="flex-1 w-full">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                {[
                                    { label: "SEO", value: categories.seo, icon: <Search size={18} /> },
                                    { label: "Performance", value: categories.performance, icon: <Clock size={18} /> },
                                    { label: "Accessibility", value: categories.accessibility, icon: <Globe size={18} /> },
                                    { label: "Best Practices", value: categories.bestPractices, icon: <Tag size={18} /> },
                                ].map((cat) => (
                                    <div key={cat.label} className={`rounded-xl p-4 border text-center ${getScoreBgClass(cat.value)}`}>
                                        <div className="flex items-center justify-center gap-1.5 mb-2 text-muted-foreground/80">
                                            {cat.icon}
                                            <span className="text-xs font-medium">{cat.label}</span>
                                        </div>
                                        <p className={`text-2xl font-bold ${getScoreClass(cat.value)}`}>{cat.value}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Quick Stats */}
                            <div className="grid grid-cols-3 gap-3 mt-4">
                                <div className="bg-muted/30 border border-border rounded-xl p-3 text-center">
                                    <p className="text-lg font-bold text-primary">{analysis.loadTime}ms</p>
                                    <p className="text-[10px] text-muted-foreground">Response Time</p>
                                </div>
                                <div className="bg-muted/30 border border-border rounded-xl p-3 text-center">
                                    <p className="text-lg font-bold text-secondary">{Math.round(analysis.pageSize / 1024)}KB</p>
                                    <p className="text-[10px] text-muted-foreground">Document Size</p>
                                </div>
                                <div className="bg-muted/30 border border-border rounded-xl p-3 text-center">
                                    <p className="text-lg font-bold text-accent">{(analysis.wordCount || 0).toLocaleString()}</p>
                                    <p className="text-[10px] text-muted-foreground">Words</p>
                                </div>
                            </div>

                            <p className="text-[11px] text-muted-foreground/80 text-center mt-3">
                                * Performance metrics reflect server response time and HTML payload weight from direct HTTP fetch.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mb-6 overflow-x-auto pb-1" style={{ animationDelay: "200ms" }}>
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap cursor-pointer ${
                                activeTab === tab.id
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            }`}
                            style={activeTab === tab.id ? { color: "var(--background)" } : {}}
                        >
                            {tab.label}
                            {tab.id === "issues" && issues.length > 0 && (
                                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-danger/20 text-danger">
                                    {issues.length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div key={activeTab}>
                    {activeTab === "overview" && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Issues Summary */}
                            <div className="bg-card border border-border rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                    <AlertCircle size={20} className="text-danger" />
                                    Issues Summary
                                </h3>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="severity-critical rounded-xl p-4 text-center">
                                        <p className="text-2xl font-bold">{criticalCount}</p>
                                        <p className="text-xs mt-1">Critical</p>
                                    </div>
                                    <div className="severity-warning rounded-xl p-4 text-center">
                                        <p className="text-2xl font-bold">{warningCount}</p>
                                        <p className="text-xs mt-1">Warnings</p>
                                    </div>
                                    <div className="severity-info rounded-xl p-4 text-center">
                                        <p className="text-2xl font-bold">{infoCount}</p>
                                        <p className="text-xs mt-1">Info</p>
                                    </div>
                                </div>

                                {issues.length > 0 ? (
                                    <div className="mt-4 space-y-2">
                                        {issues.slice(0, 3).map((issue, i) => (
                                            <IssueCard key={i} issue={issue} />
                                        ))}
                                        {issues.length > 3 && (
                                            <button
                                                onClick={() => setActiveTab("issues")}
                                                className="w-full text-center text-sm text-primary hover:underline py-2 cursor-pointer"
                                            >
                                                View all {issues.length} issues →
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-sm text-success mt-4 text-center">No major issues identified!</p>
                                )}
                            </div>

                            {/* Links & Images */}
                            <div className="space-y-6">
                                <div className="bg-card border border-border rounded-2xl p-6">
                                    <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                        <Link2 size={20} className="text-primary" />
                                        Links Analysis
                                    </h3>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="glass rounded-xl p-4 text-center">
                                            <p className="text-2xl font-bold text-primary">{links.internal}</p>
                                            <p className="text-xs text-muted-foreground">Internal</p>
                                        </div>
                                        <div className="glass rounded-xl p-4 text-center">
                                            <p className="text-2xl font-bold text-secondary">{links.external}</p>
                                            <p className="text-xs text-muted-foreground">External</p>
                                        </div>
                                        <div className="glass rounded-xl p-4 text-center">
                                            <p className="text-2xl font-bold text-accent">{links.total}</p>
                                            <p className="text-xs text-muted-foreground">Total</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-card border border-border rounded-2xl p-6">
                                    <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                        <Image size={20} className="text-accent" />
                                        Images Audit
                                    </h3>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="glass rounded-xl p-4 text-center">
                                            <p className="text-2xl font-bold">{images.total}</p>
                                            <p className="text-xs text-muted-foreground">Total</p>
                                        </div>
                                        <div className="glass rounded-xl p-4 text-center">
                                            <p className="text-2xl font-bold text-success">{images.withAlt}</p>
                                            <p className="text-xs text-muted-foreground">With Alt</p>
                                        </div>
                                        <div className="glass rounded-xl p-4 text-center">
                                            <p className={`text-2xl font-bold ${images.missingAlt > 0 ? "text-danger" : "text-success"}`}>
                                                {images.missingAlt}
                                            </p>
                                            <p className="text-xs text-muted-foreground">Missing Alt</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Headings */}
                            <div className="bg-card border border-border rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                    <Heading size={20} className="text-secondary" />
                                    Heading Structure
                                </h3>
                                <div className="space-y-2">
                                    {["h1", "h2", "h3", "h4", "h5", "h6"].map((tag) => {
                                        const count = headings[tag as keyof typeof headings] as number;
                                        const maxBar = Math.max(
                                            headings.h1,
                                            headings.h2,
                                            headings.h3,
                                            headings.h4,
                                            headings.h5,
                                            headings.h6,
                                            1
                                        );
                                        return (
                                            <div key={tag} className="flex items-center gap-3">
                                                <span className="text-xs font-mono text-muted-foreground w-6 uppercase">{tag}</span>
                                                <div className="flex-1 h-6 rounded-lg bg-muted/30 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-lg gradient-bg transition-all"
                                                        style={{ width: `${(count / maxBar) * 100}%`, minWidth: count > 0 ? "20px" : "0" }}
                                                    />
                                                </div>
                                                <span className={`text-sm font-bold w-6 text-right ${tag === "h1" && count !== 1 ? "text-danger" : ""}`}>
                                                    {count}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                                {headings.h1Texts && headings.h1Texts.length > 0 && (
                                    <div className="mt-4 p-3 rounded-xl bg-muted/30 border border-border">
                                        <p className="text-xs text-muted-foreground mb-1 font-medium">H1 Text:</p>
                                        {headings.h1Texts.map((text, i) => (
                                            <p key={i} className="text-sm text-foreground truncate">
                                                {text}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Keywords */}
                            <div className="bg-card border border-border rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                    <Type size={20} className="text-warning" />
                                    Top Keywords
                                </h3>
                                {keywords.length > 0 ? (
                                    <div className="space-y-2">
                                        {keywords.map((kw, i) => (
                                            <div key={kw.word} className="flex items-center gap-3">
                                                <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                                                <span className="flex-1 text-sm font-medium">{kw.word}</span>
                                                <span className="text-xs text-muted-foreground">{kw.count}×</span>
                                                <div className="w-16 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-accent"
                                                        style={{ width: `${Math.min(kw.density * 10, 100)}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs text-muted-foreground w-12 text-right">{kw.density}%</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">No keyword data available.</p>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === "meta" && (
                        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                            <h3 className="text-lg font-semibold text-foreground mb-6 flex items-center gap-2">
                                <FileText size={20} className="text-primary" />
                                Meta Tags Analysis
                            </h3>
                            <div className="space-y-4">
                                {[
                                    { label: "Title", value: metaData.title, ideal: "30-65 characters", len: metaData.title?.length },
                                    { label: "Description", value: metaData.description, ideal: "120-160 characters", len: metaData.description?.length },
                                    { label: "Canonical URL", value: metaData.canonical },
                                    { label: "Robots", value: metaData.robots },
                                    { label: "Viewport", value: metaData.viewport },
                                    { label: "Charset", value: metaData.charset },
                                    { label: "OG Title", value: metaData.ogTitle },
                                    { label: "OG Description", value: metaData.ogDescription },
                                    { label: "OG Image", value: metaData.ogImage },
                                    { label: "Twitter Card", value: metaData.twitterCard },
                                ].map((meta) => (
                                    <div key={meta.label} className="bg-muted/50 border border-border rounded-xl p-4">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-medium text-foreground">{meta.label}</span>
                                            <div className="flex items-center gap-2">
                                                {meta.len !== undefined && <span className="text-xs text-muted-foreground">{meta.len} chars</span>}
                                                {meta.value ? <span className="w-2 h-2 rounded-full bg-success" /> : <span className="w-2 h-2 rounded-full bg-danger" />}
                                            </div>
                                        </div>
                                        {meta.value ? (
                                            <p className="text-sm text-muted-foreground break-all">{meta.value}</p>
                                        ) : (
                                            <p className="text-sm text-danger/60 italic">Missing</p>
                                        )}
                                        {meta.ideal && <p className="text-[10px] text-muted-foreground mt-1">Ideal: {meta.ideal}</p>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === "content" && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-card border border-border rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-foreground mb-4">Content Stats</h3>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center p-3 bg-muted/50 border border-border rounded-xl">
                                        <span className="text-sm text-muted-foreground">Word Count</span>
                                        <span className="font-bold text-foreground">{(analysis.wordCount || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-muted/50 border border-border rounded-xl">
                                        <span className="text-sm text-muted-foreground">Document Size</span>
                                        <span className="font-bold text-foreground">{Math.round((analysis.pageSize || 0) / 1024)} KB</span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-muted/50 border border-border rounded-xl">
                                        <span className="text-sm text-muted-foreground">Response Time</span>
                                        <span className={`font-bold ${analysis.loadTime < 2000 ? "score-good" : analysis.loadTime < 4000 ? "score-medium" : "score-poor"}`}>
                                            {((analysis.loadTime || 0) / 1000).toFixed(2)}s
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-muted/50 border border-border rounded-xl">
                                        <span className="text-sm text-muted-foreground">Total Links</span>
                                        <span className="font-bold text-foreground">{links.total}</span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-muted/50 border border-border rounded-xl">
                                        <span className="text-sm text-muted-foreground">Total Images</span>
                                        <span className="font-bold text-foreground">{images.total}</span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-muted/50 border border-border rounded-xl">
                                        <span className="text-sm text-muted-foreground">Total Headings</span>
                                        <span className="font-bold text-foreground">
                                            {headings.h1 + headings.h2 + headings.h3 + headings.h4 + headings.h5 + headings.h6}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-card border border-border rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-foreground mb-4">Heading Hierarchy</h3>
                                <div className="space-y-2">
                                    {["h1", "h2", "h3", "h4", "h5", "h6"].map((tag, i) => {
                                        const count = headings[tag as keyof typeof headings] as number;
                                        return (
                                            <div
                                                key={tag}
                                                className="flex items-center gap-3 p-2.5 bg-muted/30 border border-border rounded-lg"
                                                style={{ paddingLeft: `${i * 12 + 12}px` }}
                                            >
                                                <span className="text-xs font-mono font-bold text-primary uppercase">&lt;{tag}&gt;</span>
                                                <span className="text-sm text-muted-foreground flex-1">
                                                    {count} {count === 1 ? "tag" : "tags"}
                                                </span>
                                                {tag === "h1" && (
                                                    <span
                                                        className={`text-xs px-2 py-0.5 rounded-full ${
                                                            count === 1 ? "score-bg-good text-success" : "score-bg-poor text-danger"
                                                        }`}
                                                    >
                                                        {count === 1 ? "✓ Good" : count === 0 ? "✗ Missing" : "✗ Multiple"}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "issues" && (
                        <div>
                            {issues.length > 0 ? (
                                <>
                                    <div className="flex items-center gap-3 mb-4 flex-wrap">
                                        <span className="text-sm text-muted-foreground">Summary:</span>
                                        <span className="severity-critical px-2.5 py-1 rounded-full text-xs font-semibold">
                                            {criticalCount} Critical
                                        </span>
                                        <span className="severity-warning px-2.5 py-1 rounded-full text-xs font-semibold">
                                            {warningCount} Warnings
                                        </span>
                                        <span className="severity-info px-2.5 py-1 rounded-full text-xs font-semibold">
                                            {infoCount} Info
                                        </span>
                                    </div>
                                    <div className="space-y-3">
                                        {issues.map((issue, i) => (
                                            <IssueCard key={i} issue={issue} />
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="bg-card border border-border rounded-2xl p-12 text-center">
                                    <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                                        <AlertCircle size={32} className="text-success" />
                                    </div>
                                    <h3 className="text-lg font-semibold text-foreground mb-2">No Issues Found!</h3>
                                    <p className="text-sm text-muted-foreground">Your website follows SEO and structural best practices.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === "ai" && (
                        <div className="space-y-6">
                            {/* Has AI content */}
                            {analysis.aiSummary || (analysis.aiRecommendations && analysis.aiRecommendations.length > 0) ? (
                                <>
                                    {/* AI Summary */}
                                    {analysis.aiSummary && (
                                        <div className="bg-card border border-primary/20 rounded-2xl p-6">
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="text-xl">✨</span>
                                                <h3 className="text-base font-semibold text-foreground">AI SEO Summary</h3>
                                                <span className="ml-auto text-xs bg-primary/10 text-primary px-2.5 py-0.5 rounded-full font-medium">Powered by Gemini</span>
                                                <button
                                                    onClick={handleGenerateAi}
                                                    disabled={generatingAi}
                                                    title="Regenerate AI Insights"
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary rounded-lg transition ml-2 cursor-pointer disabled:opacity-50"
                                                >
                                                    {generatingAi ? (
                                                        <Loader2 size={13} className="animate-spin text-primary" />
                                                    ) : (
                                                        <RefreshCw size={13} />
                                                    )}
                                                    <span>{generatingAi ? "Generating..." : "Regenerate"}</span>
                                                </button>
                                            </div>
                                            <p className="text-muted-foreground text-sm leading-relaxed">{analysis.aiSummary}</p>
                                        </div>
                                    )}

                                    {/* AI Recommendations */}
                                    {analysis.aiRecommendations && analysis.aiRecommendations.length > 0 && (
                                        <div className="bg-card border border-border rounded-2xl p-6">
                                            <div className="flex items-center gap-2 mb-4">
                                                <span className="text-xl">🎯</span>
                                                <h3 className="text-base font-semibold text-foreground">Smart Recommendations</h3>
                                            </div>
                                            <div className="space-y-3">
                                                {analysis.aiRecommendations.map((rec, i) => (
                                                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-background border border-border">
                                                        <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                                                            {i + 1}
                                                        </div>
                                                        <p className="text-sm text-foreground leading-relaxed">{rec}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* AI Keyword Suggestions */}
                                    {analysis.aiKeywordSuggestions && analysis.aiKeywordSuggestions.length > 0 && (
                                        <div className="bg-card border border-border rounded-2xl p-6">
                                            <div className="flex items-center gap-2 mb-4">
                                                <span className="text-xl">🔑</span>
                                                <h3 className="text-base font-semibold text-foreground">Keyword Opportunities</h3>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {analysis.aiKeywordSuggestions.map((kw, i) => (
                                                    <span key={i} className="px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-sm font-medium">
                                                        {kw}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                /* Empty state with on-demand generate button */
                                <div className="bg-card border border-border rounded-2xl p-10 text-center">
                                    <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4 text-3xl">
                                        ✨
                                    </div>
                                    <h3 className="text-lg font-semibold text-foreground mb-2">Generate Gemini AI Insights</h3>
                                    <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                                        Get instant AI-driven SEO summary, prioritized action items, and high-value keyword opportunities analyzed specifically for this website.
                                    </p>
                                    <button
                                        onClick={handleGenerateAi}
                                        disabled={generatingAi}
                                        className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-medium rounded-xl hover:bg-primary/90 transition shadow-lg shadow-primary/20 disabled:opacity-50 cursor-pointer"
                                    >
                                        {generatingAi ? (
                                            <>
                                                <Loader2 size={18} className="animate-spin" />
                                                <span>Analyzing with Gemini AI...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles size={18} />
                                                <span>Generate AI Insights Now</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
