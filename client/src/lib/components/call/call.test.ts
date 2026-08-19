import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import CallAvatar from "./CallAvatar.svelte";
import CallControls from "./CallControls.svelte";
import CallGrid from "./CallGrid.svelte";
import CallTile from "./CallTile.svelte";
import type { CallParticipant } from "./types";

const local: CallParticipant = {
  id: "local",
  displayName: "Ada Lovelace",
  microphoneMuted: false,
  videoState: "off",
};
const remote: CallParticipant = {
  id: "remote",
  displayName: "Grace Hopper",
  microphoneMuted: true,
  videoState: "off",
  volume: 0.5,
};

afterEach(() => vi.restoreAllMocks());

describe("call components", () => {
  it("renders responsive grid tile counts and focuses a selected participant", async () => {
    const onFocusChange = vi.fn();
    render(CallGrid, {
      local,
      participants: [remote, { ...remote, id: "remote-2", displayName: "Lin" }],
      onFocusChange,
    });
    expect(document.querySelector(".call-grid")?.className).toContain(
      "count-3",
    );
    await fireEvent.click(
      screen.getByRole("button", { name: "Focus Grace Hopper's video" }),
    );
    expect(onFocusChange).toHaveBeenCalledWith("remote");
  });

  it("uses initials and exposes speaking state for avatar fallbacks", () => {
    render(CallAvatar, { name: "Évariste Galois", speaking: true });
    expect(screen.getByLabelText("Évariste Galois avatar").textContent).toBe(
      "ÉV",
    );
    render(CallTile, { participant: { ...remote, speaking: true } });
    expect(screen.getByLabelText("Grace Hopper is speaking")).toBeTruthy();
  });

  it("controls remote volume and mute without rendering them for the local tile", async () => {
    const onVolumeChange = vi.fn();
    const onMuteChange = vi.fn();
    render(CallTile, { participant: remote, onVolumeChange, onMuteChange });
    await fireEvent.input(screen.getByLabelText("Volume for Grace Hopper"), {
      target: { value: "0.2" },
    });
    await fireEvent.click(
      screen.getByRole("button", { name: "Mute Grace Hopper" }),
    );
    expect(onVolumeChange).toHaveBeenCalledWith(0.2);
    expect(onMuteChange).toHaveBeenCalledWith(true);
    render(CallTile, { participant: local, local: true });
    expect(screen.queryByLabelText("Volume for Ada Lovelace")).toBeNull();
  });

  it("calls fullscreen when available and clears media on unmount", async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const stream = {
      getVideoTracks: () => [{ readyState: "live", enabled: true }],
    } as unknown as MediaStream;
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const view = render(CallTile, {
      participant: { ...remote, stream, videoState: "camera" },
    });
    await fireEvent.click(
      screen.getByRole("button", { name: "Fullscreen Grace Hopper" }),
    );
    expect(requestFullscreen).toHaveBeenCalled();
    const video = screen.getByLabelText(
      "Grace Hopper video",
    ) as HTMLVideoElement;
    expect(video.srcObject).toBe(stream);
    view.unmount();
    expect(video.srcObject).toBeNull();
  });

  it("updates video availability when a remote stream adds or removes a track", async () => {
    const track = new EventTarget() as MediaStreamTrack;
    Object.assign(track, { kind: "video", readyState: "live", enabled: true });
    const stream = new EventTarget() as MediaStream;
    const tracks: MediaStreamTrack[] = [];
    Object.assign(stream, { getVideoTracks: () => tracks });
    const { getByLabelText } = render(CallTile, {
      participant: { ...remote, stream, videoState: "camera" },
    });
    const video = getByLabelText("Grace Hopper video");
    expect(video.className).toContain("hidden");

    tracks.push(track);
    stream.dispatchEvent(new Event("addtrack"));
    await tick();
    expect(video.className).not.toContain("hidden");

    tracks.pop();
    stream.dispatchEvent(new Event("removetrack"));
    await tick();
    expect(video.className).toContain("hidden");
  });

  it("provides labelled, touch-sized presentation callbacks", async () => {
    const onToggleMicrophone = vi.fn();
    const onToggleCamera = vi.fn();
    const onToggleScreen = vi.fn();
    const onLeave = vi.fn();
    const onQualityChange = vi.fn();
    render(CallControls, {
      microphoneMuted: true,
      onToggleMicrophone,
      onToggleCamera,
      onToggleScreen,
      onLeave,
      quality: "720p",
      qualityOptions: [
        { id: "720p", label: "720p" },
        { id: "1080p", label: "1080p" },
      ],
      onQualityChange,
    });
    await fireEvent.click(
      screen.getByRole("button", { name: "Turn on microphone" }),
    );
    await fireEvent.click(
      screen.getByRole("button", { name: "Turn on camera" }),
    );
    await fireEvent.click(screen.getByRole("button", { name: "Share screen" }));
    await fireEvent.change(screen.getByLabelText("Video quality"), {
      target: { value: "1080p" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Leave call" }));
    expect(onToggleMicrophone).toHaveBeenCalledTimes(1);
    expect(onToggleCamera).toHaveBeenCalledTimes(1);
    expect(onToggleScreen).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onQualityChange).toHaveBeenCalledWith("1080p");
  });
});
