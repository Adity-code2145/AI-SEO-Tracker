import test from "node:test";
import assert from "node:assert/strict";
import { getAnalysis, deleteAnalysis } from "../controllers/analysisController.js";
import Analysis from "../models/Analysis.js";

test("getAnalysis rejects invalid ObjectId with 400", async () => {
    let statusCode = null;
    let jsonBody = null;

    const req = {
        params: { id: "invalid-id-format" },
        userId: "507f1f77bcf86cd799439011",
    };
    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(payload) {
            jsonBody = payload;
            return this;
        },
    };

    await getAnalysis(req, res);
    assert.equal(statusCode, 400);
    assert.equal(jsonBody.success, false);
    assert.equal(jsonBody.message, "Invalid analysis ID");
});

test("getAnalysis queries strictly with the authenticated userId", async () => {
    let queriedFilter = null;
    const originalFindOne = Analysis.findOne;

    Analysis.findOne = (filter) => {
        queriedFilter = filter;
        return Promise.resolve(null);
    };

    let statusCode = null;
    let jsonBody = null;
    const req = {
        params: { id: "507f1f77bcf86cd799439011" },
        userId: "607f1f77bcf86cd799439022",
    };
    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(payload) {
            jsonBody = payload;
            return this;
        },
    };

    try {
        await getAnalysis(req, res);
        assert.equal(queriedFilter._id, "507f1f77bcf86cd799439011");
        assert.equal(queriedFilter.userId, "607f1f77bcf86cd799439022");
        assert.equal(statusCode, 404);
        assert.equal(jsonBody.success, false);
        assert.equal(jsonBody.message, "Analysis not found");
    } finally {
        Analysis.findOne = originalFindOne;
    }
});

test("deleteAnalysis enforces user ownership and returns 404 if record belongs to someone else", async () => {
    let deletedFilter = null;
    const originalFindOneAndDelete = Analysis.findOneAndDelete;

    Analysis.findOneAndDelete = (filter) => {
        deletedFilter = filter;
        return Promise.resolve(null); // Not found for this user
    };

    let statusCode = null;
    let jsonBody = null;
    const req = {
        params: { id: "507f1f77bcf86cd799439011" },
        userId: "607f1f77bcf86cd799439022",
    };
    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(payload) {
            jsonBody = payload;
            return this;
        },
    };

    try {
        await deleteAnalysis(req, res);
        assert.equal(deletedFilter.userId, "607f1f77bcf86cd799439022");
        assert.equal(statusCode, 404);
        assert.equal(jsonBody.success, false);
    } finally {
        Analysis.findOneAndDelete = originalFindOneAndDelete;
    }
});
