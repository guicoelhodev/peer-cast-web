import { describe, expect, it } from "vitest";
import { createRoom } from "./rooms";

const roomId = "123e4567e89b12d3a456426614174000";

describe("createRoom", () => {
  it("posts to the API and validates the response", async () => {
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/base/api/rooms");
      expect(init?.method).toBe("POST");
      return Response.json(
        { roomId, websocketPath: `/ws/${roomId}`, expiresInSeconds: 300 },
        { status: 201 },
      );
    };
    await expect(
      createRoom({ serverUrl: "https://example.test/base", fetch }),
    ).resolves.toEqual({
      roomId,
      websocketPath: `/ws/${roomId}`,
      expiresInSeconds: 300,
    });
  });

  it("returns typed errors for HTTP, invalid responses, and network failures", async () => {
    const serverUrl = "http://example.test";
    await expect(
      createRoom({
        serverUrl,
        fetch: async () => new Response("", { status: 500 }),
      }),
    ).rejects.toMatchObject({ kind: "http", status: 500 });
    await expect(
      createRoom({
        serverUrl,
        fetch: async () => Response.json({ roomId: "bad" }),
      }),
    ).rejects.toMatchObject({ kind: "response", status: 200 });
    await expect(
      createRoom({
        serverUrl,
        fetch: async () => {
          throw new Error("offline");
        },
      }),
    ).rejects.toMatchObject({ kind: "network" });
  });
});
