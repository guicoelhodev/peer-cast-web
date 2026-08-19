import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignalingSession, type SignalingSocket } from "./session.svelte";

const peerId = "123e4567-e89b-12d3-a456-426614174000";

class MockSocket implements SignalingSocket {
  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }
  message(data: string): void {
    this.onmessage?.({ data } as MessageEvent);
  }
  closeEvent(code = 1006, reason = ""): void {
    this.readyState = 3;
    this.onclose?.({ code, reason } as CloseEvent);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
    this.readyState = 3;
  }
}

describe("signaling session", () => {
  afterEach(() => vi.useRealTimers());

  it("connects, sends ready, and dispatches valid messages", () => {
    const sockets: MockSocket[] = [];
    const received = vi.fn();
    const session = createSignalingSession({
      url: "ws://example.test/ws/room",
      ready: { type: "ready", peerId },
      onMessage: received,
      webSocket: () => {
        const socket = new MockSocket();
        sockets.push(socket);
        return socket;
      },
    });

    session.connect();
    expect(session.state).toBe("connecting");
    expect(session.send({ type: "participant-left", peerId })).toBe(false);
    sockets[0].open();
    expect(session.state).toBe("connected");
    expect(JSON.parse(sockets[0].sent[0])).toEqual({ type: "ready", peerId });
    sockets[0].message(JSON.stringify({ type: "participant-left", peerId }));
    sockets[0].message("{");
    expect(received).toHaveBeenCalledTimes(1);
  });

  it("builds the connection URL from server and room", () => {
    let url = "";
    createSignalingSession({
      serverUrl: "https://example.test/base",
      roomId: "room",
      ready: { type: "ready", peerId },
      webSocket: (value) => {
        url = value;
        return new MockSocket();
      },
    }).connect();
    expect(url).toBe("wss://example.test/base/ws/room");
  });

  it("reconnects with exponential backoff, re-sends ready, and signals reconstruction", async () => {
    vi.useFakeTimers();
    const sockets: MockSocket[] = [];
    const reconnect = vi.fn();
    const session = createSignalingSession({
      url: "ws://example.test/ws/room",
      ready: { type: "ready", peerId },
      onReconnect: reconnect,
      webSocket: () => {
        const socket = new MockSocket();
        sockets.push(socket);
        return socket;
      },
    });
    session.connect();
    sockets[0].open();
    sockets[0].closeEvent();
    expect(session.state).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(999);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);
    sockets[1].open();
    expect(JSON.parse(sockets[1].sent[0])).toEqual({ type: "ready", peerId });
    expect(reconnect).toHaveBeenCalledOnce();
  });

  it("increases retry delays up to ten seconds", async () => {
    vi.useFakeTimers();
    const sockets: MockSocket[] = [];
    const session = createSignalingSession({
      url: "ws://example.test/ws/room",
      ready: { type: "ready", peerId },
      webSocket: () => {
        const socket = new MockSocket();
        sockets.push(socket);
        return socket;
      },
    });
    session.connect();
    sockets[0].closeEvent();
    await vi.advanceTimersByTimeAsync(1_000);
    sockets[1].closeEvent();
    await vi.advanceTimersByTimeAsync(1_999);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(3);
  });

  it("cancels retries and closes the socket on leave", () => {
    vi.useFakeTimers();
    const sockets: MockSocket[] = [];
    const session = createSignalingSession({
      url: "ws://example.test/ws/room",
      ready: { type: "ready", peerId },
      webSocket: () => {
        const socket = new MockSocket();
        sockets.push(socket);
        return socket;
      },
    });
    session.connect();
    sockets[0].open();
    sockets[0].closeEvent();
    session.leave();
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(1);
    expect(session.state).toBe("closed");
  });

  it("stops permanently when preflight or close classification reports an expired room", async () => {
    const expired = createSignalingSession({
      url: "ws://example.test/ws/room",
      ready: { type: "ready", peerId },
      preflight: async () => "expired",
      webSocket: () => new MockSocket(),
    });
    expired.connect();
    await vi.waitFor(() => expect(expired.state).toBe("expired"));

    const socket = new MockSocket();
    const session = createSignalingSession({
      url: "ws://example.test/ws/room",
      ready: { type: "ready", peerId },
      webSocket: () => socket,
    });
    session.connect();
    socket.closeEvent(4404);
    expect(session.state).toBe("expired");
  });
});
