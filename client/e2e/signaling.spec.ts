import { expect, test } from "@playwright/test";
import {
  createContext,
  createRoom,
  expectParticipant,
  joinRoom,
  openChat,
  waitForConnected,
} from "./helpers";

test("creates a room, connects a four-person mesh, and propagates local media state", async ({
  browser,
}) => {
  const hostContext = await createContext(browser);
  const guestContexts = await Promise.all([
    createContext(browser),
    createContext(browser),
    createContext(browser),
  ]);
  try {
    const host = await hostContext.newPage();
    const inviteUrl = await createRoom(host);
    const guests = await Promise.all(
      guestContexts.map((context) => context.newPage()),
    );
    await Promise.all(
      guests.map((page, index) =>
        joinRoom(page, inviteUrl, `Guest ${index + 1}`),
      ),
    );

    for (const [page, ownName] of [
      [host, "Host"],
      ...guests.map((page, index) => [page, `Guest ${index + 1}`] as const),
    ]) {
      for (const name of ["Host", "Guest 1", "Guest 2", "Guest 3"]) {
        if (name !== ownName) await expectParticipant(page, name);
      }
    }
    await expect(
      host.getByText("Participants (4)", { exact: true }),
    ).toBeVisible();

    await host.getByRole("button", { name: "Turn on camera" }).click();
    await expect(
      host.getByRole("button", { name: "Turn off camera" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(host.getByLabel("Host video")).toBeVisible();
    await host.getByRole("button", { name: "Turn on microphone" }).click();
    await expect(
      host.getByRole("button", { name: "Mute microphone" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(guests[0].getByLabel("Host video")).toBeVisible();
  } finally {
    await Promise.all(
      [...guestContexts, hostContext].map((context) => context.close()),
    );
  }
});

test("delivers chat, tracks unread messages, and removes a departed participant", async ({
  browser,
}) => {
  const hostContext = await createContext(browser);
  const guestContext = await createContext(browser);
  try {
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    const inviteUrl = await createRoom(host);
    await joinRoom(guest, inviteUrl, "Guest");
    await expectParticipant(host, "Guest");

    await openChat(host);
    await host.getByPlaceholder("Message the room").fill("hello guest");
    await host.getByRole("button", { name: "Send message" }).click();
    await expect(guest.getByLabel("1 unread chat message")).toBeVisible();
    await openChat(guest);
    await expect(guest.getByText("hello guest", { exact: true })).toBeVisible();
    await guest.getByPlaceholder("Message the room").fill("hello host");
    await guest.getByRole("button", { name: "Send message" }).click();
    await expect(host.getByText("hello host", { exact: true })).toBeVisible();

    await guest.getByRole("button", { name: "Leave call" }).click();
    await expect(
      host.getByText("Participants (1)", { exact: true }),
    ).toBeVisible();
    await expect(
      host.getByLabel("Call participants").getByText("Guest", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await Promise.all([guestContext.close(), hostContext.close()]);
  }
});

test("reconnects a temporarily closed signaling socket before the room TTL", async ({
  browser,
}) => {
  const hostContext = await createContext(browser);
  const guestContext = await createContext(browser);
  try {
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    await guest.addInitScript(() => {
      const NativeWebSocket = window.WebSocket;
      const sockets: WebSocket[] = [];
      class TrackedWebSocket extends NativeWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          sockets.push(this);
        }
      }
      Object.defineProperty(window, "WebSocket", {
        configurable: true,
        value: TrackedWebSocket,
      });
      Object.defineProperty(window, "__peerCastSockets", {
        configurable: true,
        value: sockets,
      });
    });
    const inviteUrl = await createRoom(host);
    await joinRoom(guest, inviteUrl, "Returning guest");
    await expectParticipant(host, "Returning guest");

    await guest.evaluate(() =>
      (window as Window & { __peerCastSockets: WebSocket[] }).__peerCastSockets
        .at(-1)
        ?.close(),
    );
    await expect(
      host.getByText("Participants (1)", { exact: true }),
    ).toBeVisible();
    await waitForConnected(guest);
    await expectParticipant(host, "Returning guest");
  } finally {
    await Promise.all([guestContext.close(), hostContext.close()]);
  }
});

test("shows an expired state for an unused room after the test TTL", async ({
  request,
  page,
}) => {
  const created = await request.post("http://127.0.0.1:8080/api/rooms");
  expect(created.ok()).toBeTruthy();
  const { roomId } = (await created.json()) as { roomId: string };
  await expect
    .poll(
      async () =>
        (await request.get(`http://127.0.0.1:8080/ws/${roomId}`)).status(),
      { timeout: 8_000 },
    )
    .toBe(404);
  await page.goto(`/?room=${roomId}`);
  await page.getByLabel("Name").fill("Late guest");
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page.locator(".status")).toContainText("expired");
});
