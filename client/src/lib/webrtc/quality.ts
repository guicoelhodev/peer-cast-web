export type QualityPresetId =
  "720p30" | "1080p30" | "1080p60" | "1440p60" | "4K30";

export type QualityPreset = {
  id: QualityPresetId;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
};

export const QUALITY_PRESETS: readonly QualityPreset[] = [
  { id: "720p30", width: 1280, height: 720, fps: 30, bitrate: 2_500_000 },
  { id: "1080p30", width: 1920, height: 1080, fps: 30, bitrate: 5_000_000 },
  { id: "1080p60", width: 1920, height: 1080, fps: 60, bitrate: 8_000_000 },
  { id: "1440p60", width: 2560, height: 1440, fps: 60, bitrate: 14_000_000 },
  { id: "4K30", width: 3840, height: 2160, fps: 30, bitrate: 20_000_000 },
];

export const DEFAULT_QUALITY_PRESET_ID: QualityPresetId = "1080p30";

export function getQualityPreset(
  id = DEFAULT_QUALITY_PRESET_ID,
): QualityPreset {
  return (
    QUALITY_PRESETS.find((preset) => preset.id === id) ?? QUALITY_PRESETS[1]
  );
}

export function qualityConstraints(
  preset: QualityPreset,
): MediaTrackConstraints {
  return {
    width: { ideal: preset.width },
    height: { ideal: preset.height },
    frameRate: { ideal: preset.fps },
  };
}

export type SenderWithParameters = Pick<
  RTCRtpSender,
  "getParameters" | "setParameters"
>;

export async function applyQualityToSender(
  sender: SenderWithParameters,
  preset: QualityPreset,
): Promise<boolean> {
  try {
    const parameters = sender.getParameters();
    const encodings = parameters.encodings?.length
      ? parameters.encodings
      : [{}];
    parameters.encodings = encodings;
    encodings[0].maxBitrate = preset.bitrate;
    encodings[0].maxFramerate = preset.fps;
    await sender.setParameters(parameters);
    return true;
  } catch {
    return false;
  }
}

export async function applyQuality(
  track: MediaStreamTrack,
  preset: QualityPreset,
  senders: Iterable<SenderWithParameters> = [],
): Promise<void> {
  try {
    await track.applyConstraints(qualityConstraints(preset));
  } catch {}
  await Promise.all(
    [...senders].map((sender) => applyQualityToSender(sender, preset)),
  );
}
