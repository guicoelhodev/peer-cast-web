import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import Lobby from "./Lobby.svelte";

describe("Lobby", () => {
  it("creates a room only after a name is provided", async () => {
    const onCreate = vi.fn();
    render(Lobby, { name: "", onCreate, onJoin: vi.fn() });
    const button = screen.getByRole("button", {
      name: "Create room",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await fireEvent.input(screen.getByLabelText("Name"), {
      target: { value: "Ada" },
    });
    await fireEvent.click(button);
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("uses the join action for an invite room", async () => {
    const onJoin = vi.fn();
    render(Lobby, { roomId: "room-1", name: "Ada", onCreate: vi.fn(), onJoin });
    await fireEvent.click(screen.getByRole("button", { name: "Join room" }));
    expect(onJoin).toHaveBeenCalledOnce();
    expect(screen.getByText("room-1")).toBeTruthy();
  });
});
