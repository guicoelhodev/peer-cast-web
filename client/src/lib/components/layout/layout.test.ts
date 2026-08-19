import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import RoomLayout from "./RoomLayout.svelte";

describe("RoomLayout", () => {
  it("shows a copyable invite and connection state", () => {
    render(RoomLayout, {
      roomId: "room-1",
      inviteUrl: "https://example.test/?room=room-1",
      status: "connected",
      participants: [],
      local: {
        id: "local",
        displayName: "Ada",
        microphoneMuted: false,
        videoState: "off",
        connected: true,
      },
      microphoneMuted: false,
      videoState: "off",
      quality: "1080p30",
      qualityOptions: [],
      onCopyInvite: vi.fn(),
      onSendChat: vi.fn(),
      onToggleMicrophone: vi.fn(),
      onToggleCamera: vi.fn(),
      onToggleScreen: vi.fn(),
      onQualityChange: vi.fn(),
      onLeave: vi.fn(),
    });
    expect(
      (screen.getByLabelText("Invite link") as HTMLInputElement).value,
    ).toBe("https://example.test/?room=room-1");
    expect(screen.getByText("● connected")).toBeTruthy();
  });
});
