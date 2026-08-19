import { describe, expect, it, vi } from "vitest";
import {
  applyQuality,
  applyQualityToSender,
  getQualityPreset,
  qualityConstraints,
} from "./quality";

describe("quality presets", () => {
  it("defines the legacy resolutions, frame rates, and bitrates", () => {
    expect(getQualityPreset("720p30")).toMatchObject({
      width: 1280,
      height: 720,
      fps: 30,
      bitrate: 2_500_000,
    });
    expect(getQualityPreset("1080p30")).toMatchObject({
      width: 1920,
      height: 1080,
      fps: 30,
      bitrate: 5_000_000,
    });
    expect(getQualityPreset("1080p60")).toMatchObject({
      width: 1920,
      height: 1080,
      fps: 60,
      bitrate: 8_000_000,
    });
    expect(getQualityPreset("1440p60")).toMatchObject({
      width: 2560,
      height: 1440,
      fps: 60,
      bitrate: 14_000_000,
    });
    expect(getQualityPreset("4K30")).toMatchObject({
      width: 3840,
      height: 2160,
      fps: 30,
      bitrate: 20_000_000,
    });
    expect(qualityConstraints(getQualityPreset("720p30"))).toEqual({
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    });
  });

  it("sets sender bitrate and frame rate when supported", async () => {
    const parameters: { encodings: RTCRtpEncodingParameters[] } = {
      encodings: [],
    };
    const sender = {
      getParameters: () => parameters,
      setParameters: vi.fn().mockResolvedValue(undefined),
    } as unknown as RTCRtpSender;
    expect(
      await applyQualityToSender(sender, getQualityPreset("1080p60")),
    ).toBe(true);
    expect(parameters.encodings[0]).toMatchObject({
      maxBitrate: 8_000_000,
      maxFramerate: 60,
    });
  });

  it("falls back safely when sender parameters or constraints fail", async () => {
    const sender = {
      getParameters: vi.fn(() => {
        throw new Error("unsupported");
      }),
      setParameters: vi.fn(),
    } as unknown as RTCRtpSender;
    const track = {
      applyConstraints: vi.fn().mockRejectedValue(new Error("unsupported")),
    } as unknown as MediaStreamTrack;
    expect(await applyQualityToSender(sender, getQualityPreset("720p30"))).toBe(
      false,
    );
    await expect(
      applyQuality(track, getQualityPreset("720p30"), [sender]),
    ).resolves.toBeUndefined();
  });
});
