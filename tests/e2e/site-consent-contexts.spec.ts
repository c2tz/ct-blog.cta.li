import { clearConsentState, expect, test, gotoRoute, waitForAppReady } from "./site-fixture";
import { observePageRuntime } from "./runtime-observer";

test("keeps preference switches synchronized across tabs without restoring revoked services", async ({
  page,
  context,
}) => {
  await gotoRoute(page, "/cookies");
  await waitForAppReady(page);
  const giscus = page.locator('[data-cookie-preference-service="giscus"]');
  await giscus.click();
  await expect(giscus).toHaveJSProperty("selected", true);

  const otherPage = await context.newPage();
  const otherIssues: string[] = [];
  await observePageRuntime(otherPage, otherIssues);
  try {
    await gotoRoute(otherPage, "/cookies");
    await waitForAppReady(otherPage);
    await otherPage.locator('[data-cookie-preference-action="reject-all"]').click();

    await expect(giscus).toHaveJSProperty("selected", false);
    await expect(page.locator("[data-cookie-preferences-status]")).toHaveText(
      "Aucun service autorisé",
    );
    await page.locator('[data-cookie-preference-service="speed-insights"]').click();
    await expect
      .poll(() =>
        page.evaluate(
          () => JSON.parse(localStorage.getItem("ct-cookie-consent-v2") || "null")?.services,
        ),
      )
      .toEqual({ giscus: false, ipgeo: false, "speed-insights": true, "web-analytics": false });
    await expect(
      otherPage.locator('[data-cookie-preference-service="speed-insights"]'),
    ).toHaveJSProperty("selected", true);
    await expect(otherPage.locator('[data-cookie-preference-service="giscus"]')).toHaveJSProperty(
      "selected",
      false,
    );
    expect(otherIssues).toEqual([]);
  } finally {
    await otherPage.close();
  }
});

test("preserves the active age form when another tab saves cookie preferences", async ({
  page,
  context,
}) => {
  await page.addInitScript(clearConsentState);
  await gotoRoute(page, "/cookies");
  await waitForAppReady(page);
  const notice = page.locator(".cookie-consent--explicit-content");
  const input = notice.locator("[data-cookie-age] input");
  const acknowledge = notice.locator('[data-cookie-action="acknowledge"]');
  await input.fill("2000-01-01");
  await expect(acknowledge.getByRole("button")).toBeEnabled();
  const originalNotice = await notice.elementHandle();
  expect(originalNotice).not.toBeNull();
  await page.evaluate(() => {
    document.addEventListener(
      "site:consent-change",
      () => Reflect.set(window, "__consentResynced", true),
      { once: true },
    );
  });

  const otherPage = await context.newPage();
  try {
    // A same-origin document without app initialization changes only consent;
    // the first tab must keep its in-progress age acknowledgement untouched.
    await gotoRoute(otherPage, "/robots.txt");
    await otherPage.evaluate(() => {
      localStorage.setItem(
        "ct-cookie-consent-v2",
        JSON.stringify({
          services: {
            giscus: false,
            ipgeo: false,
            "speed-insights": false,
            "web-analytics": false,
          },
          updatedAt: new Date().toISOString(),
          version: 2,
        }),
      );
    });
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, "__consentResynced")))
      .toBe(true);
    expect(await originalNotice!.evaluate((element) => element.isConnected)).toBe(true);
    await expect(input).toHaveValue("2000-01-01");
    await input.fill("2001-02-03");
    await expect(acknowledge.getByRole("button")).toBeEnabled();
    await acknowledge.click();
    await expect(page.locator("[data-cookie-active-notice]")).toHaveCount(0);
  } finally {
    await otherPage.close();
  }
});
