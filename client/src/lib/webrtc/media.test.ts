import { describe, expect, it, vi } from "vitest";
import { createMediaSession } from "./media.svelte";

function track(kind: "audio" | "video") {
  return {
    kind,
    enabled: true,
    stop: vi.fn(),
    onended: null,
  } as unknown as MediaStreamTrack;
}

function stream(
  video: MediaStreamTrack[] = [],
  audio: MediaStreamTrack[] = [],
) {
  const tracks = [...video, ...audio];
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((item) => item.kind === "video"),
    getAudioTracks: () => tracks.filter((item) => item.kind === "audio"),
    removeTrack: (item: MediaStreamTrack) =>
      tracks.splice(tracks.indexOf(item), 1),
  } as unknown as MediaStream;
}

describe("MediaSession", () => {
  it("controls camera, microphone mute, and track notifications", async () => {
    const camera = track("video");
    const microphone = track("audio");
    const mediaDevices = {
      getUserMedia: vi
        .fn()
        .mockResolvedValueOnce(stream([camera]))
        .mockResolvedValueOnce(stream([], [microphone])),
      getDisplayMedia: vi.fn(),
      enumerateDevices: vi.fn().mockResolvedValue([]),
    };
    const session = createMediaSession({ mediaDevices });
    const changes: string[] = [];
    session.subscribeTracks((value) => changes.push(value.videoState));
    await session.startCamera();
    await session.startMicrophone();
    session.setMicrophoneMuted(true);
    expect(session.videoState).toBe("camera");
    expect(session.microphoneMuted).toBe(true);
    expect(microphone.enabled).toBe(false);
    expect(changes).toContain("camera");
    await session.stopCamera();
    expect(camera.stop).toHaveBeenCalledOnce();
    expect(session.videoState).toBe("off");
  });

  it("keeps screen audio, restores camera when sharing ends, and removes ended audio", async () => {
    const camera = track("video");
    const restoredCamera = track("video");
    const screen = track("video");
    const screenAudio = track("audio");
    const mediaDevices = {
      getUserMedia: vi
        .fn()
        .mockResolvedValueOnce(stream([camera]))
        .mockResolvedValueOnce(stream([restoredCamera])),
      getDisplayMedia: vi
        .fn()
        .mockResolvedValue(stream([screen], [screenAudio])),
      enumerateDevices: vi.fn().mockResolvedValue([]),
    };
    const session = createMediaSession({ mediaDevices });
    await session.startCamera();
    await session.startScreenShare("1440p60");
    expect(session.videoState).toBe("screen");
    expect(session.screenAudioTrack).toBe(screenAudio);
    expect(mediaDevices.getDisplayMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: expect.any(Object) }),
    );
    screenAudio.onended?.(new Event("ended"));
    expect(session.screenAudioTrack).toBeNull();
    screen.onended?.(new Event("ended"));
    await Promise.resolve();
    expect(session.videoState).toBe("camera");
    expect(camera.stop).toHaveBeenCalledOnce();
  });

  it("returns typed permission and unavailable errors", async () => {
    const denied = new DOMException("denied", "NotAllowedError");
    const permissionSession = createMediaSession({
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(denied),
        getDisplayMedia: vi.fn(),
        enumerateDevices: vi.fn(),
      },
    });
    await permissionSession.startCamera();
    expect(permissionSession.error?.code).toBe("permission-denied");
    const unavailableSession = createMediaSession({ mediaDevices: undefined });
    await unavailableSession.startMicrophone();
    expect(unavailableSession.error?.code).toBe("unavailable");
  });

  it("stops every track exactly once during idempotent cleanup", async () => {
    const camera = track("video");
    const microphone = track("audio");
    const mediaDevices = {
      getUserMedia: vi
        .fn()
        .mockResolvedValueOnce(stream([camera]))
        .mockResolvedValueOnce(stream([], [microphone])),
      getDisplayMedia: vi.fn(),
      enumerateDevices: vi.fn().mockResolvedValue([]),
    };
    const session = createMediaSession({ mediaDevices });
    await session.startCamera();
    await session.startMicrophone();
    session.cleanup();
    session.cleanup();
    expect(camera.stop).toHaveBeenCalledTimes(1);
    expect(microphone.stop).toHaveBeenCalledTimes(1);
  });
});
