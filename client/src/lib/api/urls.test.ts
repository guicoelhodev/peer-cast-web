import { describe, expect, it } from "vitest";
import { buildApiUrl, buildWebSocketUrl } from "./urls";

describe("server URLs", () => {
  it("builds HTTP API URLs with a base path", () => {
    expect(buildApiUrl("api/rooms", "https://example.test/base/").href).toBe(
      "https://example.test/base/api/rooms",
    );
  });

  it("converts HTTP schemes to WebSocket schemes and encodes room IDs", () => {
    expect(
      buildWebSocketUrl("sala/李 🙂", "http://example.test/base").href,
    ).toBe("ws://example.test/base/ws/sala%2F%E6%9D%8E%20%F0%9F%99%82");
    expect(buildWebSocketUrl("room", "https://example.test").href).toBe(
      "wss://example.test/ws/room",
    );
  });

  it("rejects non-HTTP server URLs", () => {
    expect(() => buildApiUrl("api/rooms", "ws://example.test")).toThrow(
      TypeError,
    );
    expect(() => buildApiUrl("api/rooms", "/relative")).toThrow(TypeError);
  });
});
