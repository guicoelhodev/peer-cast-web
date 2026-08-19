import {
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

export async function createContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.grantPermissions(["camera", "microphone"], {
    origin: "http://127.0.0.1:5173",
  });
  return context;
}

export async function waitForConnected(page: Page): Promise<void> {
  await expect(page.locator(".status")).toContainText("connected");
}

export async function createRoom(page: Page, name = "Host"): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page).toHaveURL(/[?&]room=[^&]+/);
  await waitForConnected(page);
  return await page.getByLabel("Invite link").inputValue();
}

export async function joinRoom(
  page: Page,
  inviteUrl: string,
  name: string,
): Promise<void> {
  await page.goto(inviteUrl);
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Join room" }).click();
  await waitForConnected(page);
}

export async function expectParticipant(
  page: Page,
  name: string,
): Promise<void> {
  await expect(
    page
      .getByLabel("Call participants")
      .getByRole("button", { name: `Focus ${name}'s video` }),
  ).toBeVisible();
}

export async function openChat(page: Page): Promise<void> {
  if (!(await page.getByLabel("Room chat").isVisible()))
    await page.getByRole("button", { name: /^Chat/ }).click();
  await expect(page.getByLabel("Room chat")).toBeVisible();
}
