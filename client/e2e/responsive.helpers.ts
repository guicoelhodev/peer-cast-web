import {
  devices,
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

const mobileDevice = devices["iPhone SE"];

export async function createResponsiveContext(
  browser: Browser,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    ...mobileDevice,
    viewport: { width: 320, height: 667 },
    screen: { width: 320, height: 667 },
  });
  await context.grantPermissions(["camera", "microphone"], {
    origin: "http://127.0.0.1:5173",
  });
  return context;
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
}

export async function expectWithinMobileViewport(
  page: Page,
  locator: Locator,
): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth + 1);
}

export async function scrollChatToEnd(page: Page): Promise<void> {
  const messages = page.getByLabel("Messages");
  await expect(messages).toBeVisible();
  const scrollState = await messages.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return {
      canScroll: element.scrollHeight > element.clientHeight,
      atEnd: element.scrollTop + element.clientHeight >= element.scrollHeight,
    };
  });
  expect(scrollState.canScroll).toBe(true);
  expect(scrollState.atEnd).toBe(true);
}
