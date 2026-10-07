import { rankTracker } from "./rankTrackerService.js";
import { normalizeKeyword } from "./rankUtils.js";

export async function keywordTracking(tracking) {
    let result;
    tracking.keyword = normalizeKeyword(tracking.keyword);

    try {
        for (let attempt = 1; attempt <= 2; attempt += 1) {
            result = await rankTracker(tracking.keyword, tracking.domain);
            if (result.success && result.data.totalResultsScanned > 0) break;
            if (attempt < 2) {
                await new Promise((resolve) => setTimeout(resolve, result.success ? 3000 : 5000));
            }
        }

        if (!result.success || result.data.totalResultsScanned === 0) {
            tracking.status = "failed";
            tracking.lastError = result.error || "Google returned no organic results to check.";
            tracking.resultsScanned = result.success ? result.data.totalResultsScanned : 0;
            if (result.success) tracking.searchCountry = result.data.country;
            await tracking.save();
            return result;
        }

        const previousPosition = tracking.currentPosition;
        const checkedAt = new Date();
        const today = new Date(checkedAt);
        today.setHours(0, 0, 0, 0);

        tracking.currentPosition = result.data.position;
        tracking.currentPage = result.data.page;
        tracking.competitors = result.data.competitors;
        tracking.resultsScanned = result.data.totalResultsScanned;
        tracking.lastError = "";
        tracking.searchCountry = result.data.country;
        tracking.lastChecked = checkedAt;
        tracking.status = "completed";
        tracking.positionChange =
            previousPosition != null && result.data.position != null
                ? previousPosition - result.data.position
                : 0;

        if (
            result.data.position != null &&
            (tracking.bestPosition == null || result.data.position < tracking.bestPosition)
        ) {
            tracking.bestPosition = result.data.position;
        }

        const historyEntry = {
            date: today,
            position: result.data.position,
            page: result.data.page,
            title: result.data.title,
            snippet: result.data.snippet,
        };
        const historyIndex = tracking.rankHistory.findIndex(
            (entry) => entry.date.toDateString() === today.toDateString(),
        );
        if (historyIndex >= 0) tracking.rankHistory[historyIndex] = historyEntry;
        else tracking.rankHistory.push(historyEntry);

        await tracking.save();
        return result;
    } catch (error) {
        tracking.status = "failed";
        tracking.lastError = error.message || "Unexpected error during the rank check.";
        await tracking.save();
        throw error;
    }
}