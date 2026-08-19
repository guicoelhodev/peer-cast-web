import { expect, test } from "@playwright/test";
import { createRoom, expectParticipant, joinRoom, openChat } from "./helpers";
import {
  createResponsiveContext,
  expectNoHorizontalOverflow,
  expectWithinMobileViewport,
  scrollChatToEnd,
} from "./responsive.helpers";

test("keeps the 320px lobby and newly created call accessible without horizontal overflow", async ({
  browser,
}) => {
  const context = await createResponsiveContext(browser);
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Create room" }),
    ).toBeDisabled();
    await expectWithinMobileViewport(page, page.locator(".lobby section"));
    await expectNoHorizontalOverflow(page);

    const inviteUrl = await createRoom(page, "Mobile host");
    await expect(page.getByLabel("Call participants")).toHaveCount(1);
    await expect(
      page.getByRole("navigation", { name: "Call controls" }),
    ).toBeVisible();
    await expect(page.getByLabel("Invite link")).toHaveValue(inviteUrl);
    await expectWithinMobileViewport(
      page,
      page.getByLabel("Call participants"),
    );
    await expectWithinMobileViewport(
      page,
      page.getByRole("navigation", { name: "Call controls" }),
    );
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "Turn on camera" }).click();
    await expect(
      page.getByRole("button", { name: "Turn off camera" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expectNoHorizontalOverflow(page);
  } finally {
    await context.close();
  }
});

test("joins an invite into a two-tile mobile grid and opens and closes the chat sidebar", async ({
  browser,
}) => {
  const hostContext = await createResponsiveContext(browser);
  const guestContext = await createResponsiveContext(browser);
  try {
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    const inviteUrl = await createRoom(host, "Mobile host");

    await guest.goto(inviteUrl);
    await expect(
      guest.getByRole("button", { name: "Join room" }),
    ).toBeDisabled();
    await joinRoom(guest, inviteUrl, "Mobile guest");
    await expectParticipant(host, "Mobile guest");
    await expect(
      host.getByLabel("Call participants").locator(".tile"),
    ).toHaveCount(2);
    await expectWithinMobileViewport(
      host,
      host.getByLabel("Call participants"),
    );
    await expectNoHorizontalOverflow(host);
    await expectNoHorizontalOverflow(guest);

    await openChat(host);
    await expectWithinMobileViewport(host, host.getByLabel("Room chat"));
    await expectNoHorizontalOverflow(host);
    await host.getByRole("button", { name: "Close chat" }).click();
    await expect(host.getByLabel("Room chat")).toHaveCount(0);
    await expectNoHorizontalOverflow(host);
  } finally {
    await Promise.all([guestContext.close(), hostContext.close()]);
  }
});

test("supports keyboard chat composition and scrolling in the 320px mobile sidebar", async ({
  browser,
}) => {
  const hostContext = await createResponsiveContext(browser);
  const guestContext = await createResponsiveContext(browser);
  try {
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    const inviteUrl = await createRoom(host, "Mobile host");
    await joinRoom(guest, inviteUrl, "Mobile guest");
    await openChat(host);

    const composer = host.getByPlaceholder("Message the room");
    await composer.fill("first line");
    await composer.press("Shift+Enter");
    await composer.type("second line");
    await expect(composer).toHaveValue("first line\nsecond line");
    await composer.press("Enter");
    await expect(host.getByLabel("Messages")).toContainText("first line");

    for (let index = 0; index < 12; index++) {
      await composer.fill(`mobile message ${index}`);
      await composer.press("Enter");
    }
    await expect(host.getByLabel("Messages")).toContainText(
      "mobile message 11",
    );
    await scrollChatToEnd(host);
    await expectWithinMobileViewport(host, host.getByLabel("Room chat"));
    await expectNoHorizontalOverflow(host);
  } finally {
    await Promise.all([guestContext.close(), hostContext.close()]);
  }
});
