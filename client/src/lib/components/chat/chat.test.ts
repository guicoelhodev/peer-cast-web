import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import ChatComposer from "./ChatComposer.svelte";
import ChatMessageList from "./ChatMessageList.svelte";
import ChatPanel from "./ChatPanel.svelte";
import ChatUnreadBadge from "./ChatUnreadBadge.svelte";
import { limitChatHistory, type ChatMessage } from "./types";

describe("chat components", () => {
  it("sends with Enter and keeps a newline with Shift+Enter", async () => {
    const onSend = vi.fn();
    render(ChatComposer, { connected: true, onSend });
    const input = screen.getByLabelText("Message the room");
    await fireEvent.input(input, { target: { value: "hello" } });
    await fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("hello");
    await fireEvent.input(input, { target: { value: "first" } });
    await fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("limits drafts by runes and history to the most recent 200 messages", async () => {
    const onSend = vi.fn();
    render(ChatComposer, { connected: true, onSend });
    await fireEvent.input(screen.getByLabelText("Message the room"), {
      target: { value: "🙂".repeat(501) },
    });
    expect(screen.getByText("500/500")).toBeTruthy();
    const messages: ChatMessage[] = Array.from({ length: 201 }, (_, index) => ({
      id: String(index),
      peerId: "peer",
      text: `message ${index}`,
      sentAt: "2026-08-19T12:00:00Z",
      isOwn: false,
    }));
    expect(limitChatHistory(messages)).toHaveLength(200);
    render(ChatMessageList, { messages });
    expect(screen.queryByText("message 0")).toBeNull();
    expect(screen.getByText("message 200")).toBeTruthy();
  });

  it("disables sending while disconnected and lets its parent close the panel", async () => {
    const onOpenChange = vi.fn();
    const onSend = vi.fn();
    render(ChatPanel, { open: true, connected: false, onOpenChange, onSend });
    expect(
      (screen.getByLabelText("Message the room") as HTMLTextAreaElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Send message",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await fireEvent.click(screen.getByLabelText("Close chat"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders a controllable unread count", () => {
    render(ChatUnreadBadge, { count: 100 });
    expect(screen.getByLabelText("99+ unread chat messages").textContent).toBe(
      "99+",
    );
  });
});
