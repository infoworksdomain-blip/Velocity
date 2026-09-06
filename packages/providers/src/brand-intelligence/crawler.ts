import { chromium, type Browser, type Page } from "playwright";
import type { CrawledPage } from "./prompt";
import { resolveSafely } from "./ssrf-safe-fetch";

/**
 * Fixed-path crawl (STEP 6, flagged deviation from full link-discovery —
 * see docs/steps/STEP-06.md): visits the literal pages the script names
 * rather than following discovered navigation links. This caps page count
 * at exactly `CRAWL_PATHS.length` by construction and satisfies "cap depth
 * and page count" without a frontier/dedup crawler.
 */
const CRAWL_PATHS = ["/", "/pricing", "/about", "/features", "/testimonials", "/blog"];
const PAGE_TIMEOUT_MS = 15_000;
const MAX_TEXT_CHARS_PER_PAGE = 20_000;

async function isRequestSafe(requestUrl: string): Promise<boolean> {
  try {
    const url = new URL(requestUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    await resolveSafely(url.hostname);
    return true;
  } catch {
    return false;
  }
}

export async function crawlWebsite(baseUrl: string): Promise<CrawledPage[]> {
  const entry = new URL(baseUrl);
  await resolveSafely(entry.hostname); // pre-flight — throws before any browser opens if unsafe

  const browser: Browser = await chromium.launch();
  const pages: CrawledPage[] = [];

  try {
    const context = await browser.newContext({ userAgent: "VelocityBrandIntelligenceBot/0.1" });

    // Per-request interception closes the DNS-rebinding gap: every request
    // Chromium makes during this crawl (navigation, redirects,
    // subresources) is re-resolved and re-checked here, not just the
    // initial URL above.
    await context.route("**/*", async (route) => {
      if (await isRequestSafe(route.request().url())) {
        await route.continue();
      } else {
        await route.abort("blockedbyclient");
      }
    });

    for (const path of CRAWL_PATHS) {
      const pageUrl = new URL(path, entry).toString();
      const page: Page = await context.newPage();
      try {
        const response = await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });
        // A guessed path 404ing is expected, not a crawl failure.
        if (!response || !response.ok()) continue;

        const title = await page.title();
        const metaDescription = await page
          .locator('meta[name="description"]')
          .first()
          .getAttribute("content")
          .catch(() => null);
        const visibleText = await page
          .locator("body")
          .innerText()
          .catch(() => "");

        pages.push({
          url: pageUrl,
          title,
          metaDescription: metaDescription ?? "",
          visibleText: visibleText.slice(0, MAX_TEXT_CHARS_PER_PAGE),
        });
      } catch {
        // One path failing (timeout, SSRF-blocked redirect, transient
        // network error) must not abort the rest of the fixed-path crawl.
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  return pages;
}
