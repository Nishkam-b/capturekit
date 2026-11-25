import { expect, test } from "@playwright/test";

/**
 * Privacy guarantees that can be checked automatically:
 * - the production build carries a Content-Security-Policy that blocks requests to other sites;
 * - loading and using the app makes no network requests to any other origin.
 */

test("CSP is present and blocks requests to other sites", async ({ page }) => {
  await page.goto("/");
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toContain("object-src 'none'");

  const result = await page.evaluate(async () => {
    const violations: string[] = [];
    document.addEventListener("securitypolicyviolation", (e) => violations.push(e.violatedDirective));
    let blocked = false;
    try {
      await fetch("https://example.com/collect", { method: "POST", body: "data" });
    } catch {
      blocked = true;
    }
    await new Promise((r) => setTimeout(r, 200));
    return { blocked, violations };
  });
  expect(result.blocked).toBe(true);
  expect(result.violations).toContain("connect-src");
});

test("no requests leave this origin while browsing the app", async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const external: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!["blob:", "data:"].includes(u.protocol) && u.origin !== origin) external.push(r.url());
  });
  for (const path of ["/", "/record", "/recordings", "/screenshots", "/help"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(external).toEqual([]);
});
