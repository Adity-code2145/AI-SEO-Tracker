import test from "node:test";
import assert from "node:assert/strict";
import { domainMatches, normalizeDomain, normalizeKeyword } from "../services/rankUtils.js";

test("normalizes accidental quote-wrapped keywords", () => {
    assert.equal(normalizeKeyword('" Full Stack Project "'), "full stack project");
    assert.equal(normalizeKeyword("“Full Stack Project”"), "full stack project");
    assert.equal(normalizeKeyword("full   stack project"), "full stack project");
});

test("normalizes a URL to its bare hostname", () => {
    assert.equal(normalizeDomain("https://www.GreatStack.dev/products"), "greatstack.dev");
    assert.equal(normalizeDomain("greatstack.dev"), "greatstack.dev");
});

test("matches only the target hostname and its subdomains", () => {
    assert.equal(domainMatches("greatstack.dev", "greatstack.dev"), true);
    assert.equal(domainMatches("greatstack.dev", "blog.greatstack.dev"), true);
    assert.equal(domainMatches("greatstack.dev", "notgreatstack.dev"), false);
});
