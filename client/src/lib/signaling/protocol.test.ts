import { describe, expect, it } from "vitest";
import { isMessageForPeer, type SignalMessage } from "../types/signaling";
import {
  parseSignalMessage,
  serializeSignalMessage,
  SignalMessageError,
} from "./protocol";

const peerId = "123e4567-e89b-12d3-a456-426614174000";
const targetPeerId = "123e4567-e89b-12d3-a456-426614174001";
const messageId = "123e4567-e89b-12d3-a456-426614174002";

describe("signal protocol", () => {
  it("parses every valid event and keeps directed messages filterable", () => {
    const messages: SignalMessage[] = [
      { type: "ready", peerId, displayName: "李🙂", microphoneMuted: false },
      { type: "participant-left", peerId },
      {
        type: "offer",
        peerId,
        targetPeerId,
        description: { type: "offer", sdp: "v=0" },
      },
      {
        type: "answer",
        peerId,
        targetPeerId,
        description: { type: "answer", sdp: "v=0" },
      },
      {
        type: "ice",
        peerId,
        targetPeerId,
        candidate: {
          candidate: "candidate:1",
          sdpMid: null,
          usernameFragment: null,
        },
      },
      { type: "microphone-state", peerId, microphoneMuted: true },
      { type: "video-state", peerId, videoState: "screen" },
      {
        type: "chat",
        peerId,
        messageId,
        text: "Olá 🙂",
        sentAt: "2026-08-19T12:00:00Z",
      },
    ];

    for (const message of messages) {
      expect(parseSignalMessage(serializeSignalMessage(message))).toEqual(
        message,
      );
    }
    expect(isMessageForPeer(messages[2], targetPeerId)).toBe(true);
    expect(isMessageForPeer(messages[2], peerId)).toBe(false);
  });

  it("rejects malformed, oversized, unknown, and invalid messages", () => {
    expect(parseSignalMessage("{")).toBeNull();
    expect(
      parseSignalMessage(
        JSON.stringify({ type: "ready", peerId: "not-a-uuid" }),
      ),
    ).toBeNull();
    expect(
      parseSignalMessage(
        JSON.stringify({ type: "ready", peerId, unknown: true }),
      ),
    ).toBeNull();
    expect(
      parseSignalMessage(
        JSON.stringify({
          type: "chat",
          peerId,
          messageId,
          text: "",
          sentAt: "today",
        }),
      ),
    ).toBeNull();
    expect(parseSignalMessage("x".repeat(11), 10)).toBeNull();
    expect(() =>
      serializeSignalMessage({
        type: "video-state",
        peerId,
        videoState: "bad",
      } as never),
    ).toThrow(SignalMessageError);
  });

  it("counts Unicode display names and chat text by characters", () => {
    const displayName = "界".repeat(50);
    expect(
      parseSignalMessage(
        JSON.stringify({ type: "ready", peerId, displayName }),
      ),
    ).not.toBeNull();
    expect(
      parseSignalMessage(
        JSON.stringify({
          type: "ready",
          peerId,
          displayName: `${displayName}界`,
        }),
      ),
    ).toBeNull();
    const text = "🙂".repeat(500);
    expect(
      parseSignalMessage(
        JSON.stringify({
          type: "chat",
          peerId,
          messageId,
          text,
          sentAt: "2026-08-19T12:00:00Z",
        }),
      ),
    ).not.toBeNull();
  });
});
