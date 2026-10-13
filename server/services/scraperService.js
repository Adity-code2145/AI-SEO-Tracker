import { chromium } from "playwright-core";
import Browserbase from "@browserbasehq/sdk";

const bb = new Browserbase({
    apiKey: process.env.BROWSERBASE_API_KEY,
});

export async function scrapeUrl(url){
    let browser;
    try {
        const session = await bb.session.create({browserSettings: {blockAds: true}});
        browser = await chromium.connectOverCDP(session.connectUrl)
        const defaultContext = browser.contexts()[0];
        const page = defaultContext.pages()[0];
        page.setDefaultNavigationTimeout(30000);

        const startTime = Date.now()
        let response;
        try {
            response = await page.goto(url,{waitUntil: "domcontentloaded"})
        } catch (naverror) {
            await browser.close().catch(()=>{});
            browser = null;
            return {success: false, error: naverror.message}
        }
        const loadTime = Date.now() - startTime;
        await page.waitForTimeout(2000);

        //Extract all SEO-relevant data from the rendered page
        const scrapedData = await page.evaluate(()=>{
            const getMeta = (name)=>{
                const el = document.querySelector(`meta[name="${name}"]`) || document.querySelector(`meta[property="${name}"]`);
                return el ? el.getAttribute("content") || "" : "";
            }
        })
    } catch (error) {
        
    }
}