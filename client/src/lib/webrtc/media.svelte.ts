import type { VideoState } from "../types/signaling";
import {
  applyQuality,
  getQualityPreset,
  qualityConstraints,
  type QualityPreset,
  type QualityPresetId,
  type SenderWithParameters,
} from "./quality";

export type MediaErrorCode =
  | "permission-denied"
  | "device-not-found"
  | "unavailable"
  | "constraints"
  | "unknown";

export class MediaError extends Error {
  constructor(
    public readonly code: MediaErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "MediaError";
  }
}

export type MediaDevice = {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
};

export type LocalTracks = {
  videoTrack: MediaStreamTrack | null;
  microphoneTrack: MediaStreamTrack | null;
  screenAudioTrack: MediaStreamTrack | null;
  videoState: VideoState;
  microphoneMuted: boolean;
};

export type MediaSessionOptions = {
  mediaDevices?: Pick<
    MediaDevices,
    "getUserMedia" | "getDisplayMedia" | "enumerateDevices"
  >;
  onTracksChanged?: (tracks: LocalTracks) => void;
};

type TrackListener = (tracks: LocalTracks) => void;

export class MediaSession {
  readonly mediaDevices: MediaSessionOptions["mediaDevices"];
  videoState: VideoState = "off";
  microphoneMuted = false;
  error: MediaError | null = null;
  cameraDevices: MediaDevice[] = [];
  microphoneDevices: MediaDevice[] = [];
  selectedCameraDeviceId: string | null = null;
  selectedMicrophoneDeviceId: string | null = null;

  cameraStream: MediaStream | null = null;
  microphoneStream: MediaStream | null = null;
  screenStream: MediaStream | null = null;
  private cameraWasActiveBeforeScreen = false;
  private stoppingScreen = false;
  private disposed = false;
  private listeners = new Set<TrackListener>();

  constructor(options: MediaSessionOptions = {}) {
    this.mediaDevices =
      options.mediaDevices ?? globalThis.navigator?.mediaDevices;
    if (options.onTracksChanged) this.listeners.add(options.onTracksChanged);
  }

  get videoTrack(): MediaStreamTrack | null {
    return this.activeVideoStream?.getVideoTracks()[0] ?? null;
  }

  get microphoneTrack(): MediaStreamTrack | null {
    return this.microphoneStream?.getAudioTracks()[0] ?? null;
  }

  get screenAudioTrack(): MediaStreamTrack | null {
    return this.screenStream?.getAudioTracks()[0] ?? null;
  }

  get tracks(): LocalTracks {
    return {
      videoTrack: this.videoTrack,
      microphoneTrack: this.microphoneTrack,
      screenAudioTrack: this.screenAudioTrack,
      videoState: this.videoState,
      microphoneMuted: this.microphoneMuted,
    };
  }

  subscribeTracks(listener: TrackListener): () => void {
    this.listeners.add(listener);
    listener(this.tracks);
    return () => this.listeners.delete(listener);
  }

  async refreshDevices(): Promise<void> {
    const devices = await this.requireMediaDevices("device").enumerateDevices();
    this.cameraDevices = devices.filter(
      (device) => device.kind === "videoinput",
    );
    this.microphoneDevices = devices.filter(
      (device) => device.kind === "audioinput",
    );
  }

  async selectCamera(deviceId: string | null): Promise<void> {
    this.selectedCameraDeviceId = deviceId;
    if (this.cameraStream && this.videoState === "camera")
      await this.startCamera();
  }

  async selectMicrophone(deviceId: string | null): Promise<void> {
    this.selectedMicrophoneDeviceId = deviceId;
    if (this.microphoneStream) await this.startMicrophone();
  }

  async startCamera(): Promise<void> {
    this.assertActive();
    if (this.videoState === "screen") await this.stopScreenShare(false);
    try {
      const stream = await this.requireMediaDevices("camera").getUserMedia({
        video: this.selectedCameraDeviceId
          ? { deviceId: { exact: this.selectedCameraDeviceId } }
          : true,
        audio: false,
      });
      if (!stream.getVideoTracks()[0])
        throw new MediaError(
          "device-not-found",
          "No camera track was provided",
        );
      this.stopStream(this.cameraStream);
      this.cameraStream = stream;
      this.videoState = "camera";
      this.error = null;
      this.emitTracks();
    } catch (error) {
      this.fail(error, "camera");
    }
  }

  async stopCamera(): Promise<void> {
    this.stopStream(this.cameraStream);
    this.cameraStream = null;
    if (this.videoState === "camera") this.videoState = "off";
    this.emitTracks();
  }

  async startMicrophone(): Promise<void> {
    this.assertActive();
    try {
      const stream = await this.requireMediaDevices("microphone").getUserMedia({
        video: false,
        audio: this.selectedMicrophoneDeviceId
          ? { deviceId: { exact: this.selectedMicrophoneDeviceId } }
          : true,
      });
      if (!stream.getAudioTracks()[0])
        throw new MediaError(
          "device-not-found",
          "No microphone track was provided",
        );
      this.stopStream(this.microphoneStream);
      this.microphoneStream = stream;
      this.microphoneMuted = false;
      this.error = null;
      this.emitTracks();
    } catch (error) {
      this.fail(error, "microphone");
    }
  }

  setMicrophoneMuted(muted: boolean): void {
    const track = this.microphoneTrack;
    if (!track) return;
    track.enabled = !muted;
    this.microphoneMuted = muted;
    this.emitTracks();
  }

  toggleMicrophoneMuted(): void {
    this.setMicrophoneMuted(!this.microphoneMuted);
  }

  async startScreenShare(presetId: QualityPresetId = "1080p30"): Promise<void> {
    this.assertActive();
    const preset = getQualityPreset(presetId);
    try {
      const stream = await this.requireMediaDevices("screen").getDisplayMedia({
        video: qualityConstraints(preset),
        audio: { suppressLocalAudioPlayback: false },
        systemAudio: "include",
        surfaceSwitching: "include",
        windowAudio: "system",
      } as DisplayMediaStreamOptions);
      const video = stream.getVideoTracks()[0];
      if (!video)
        throw new MediaError(
          "device-not-found",
          "No screen video track was provided",
        );
      this.cameraWasActiveBeforeScreen = this.videoState === "camera";
      this.stopStream(this.cameraStream);
      this.cameraStream = null;
      this.stopStream(this.screenStream);
      this.screenStream = stream;
      this.videoState = "screen";
      this.error = null;
      video.onended = () => void this.stopScreenShare();
      const audio = this.screenAudioTrack;
      if (audio) {
        audio.onended = () => {
          this.screenStream?.removeTrack(audio);
          this.emitTracks();
        };
      }
      await applyQuality(video, preset);
      this.emitTracks();
    } catch (error) {
      this.fail(error, "screen");
    }
  }

  async stopScreenShare(restoreCamera = true): Promise<void> {
    if (this.stoppingScreen || !this.screenStream) return;
    this.stoppingScreen = true;
    const shouldRestoreCamera =
      restoreCamera && this.cameraWasActiveBeforeScreen && !this.disposed;
    this.cameraWasActiveBeforeScreen = false;
    this.stopStream(this.screenStream);
    this.screenStream = null;
    this.videoState = "off";
    this.emitTracks();
    this.stoppingScreen = false;
    if (shouldRestoreCamera) await this.startCamera();
  }

  async applyQuality(
    preset: QualityPreset | QualityPresetId,
    senders: Iterable<SenderWithParameters> = [],
  ): Promise<void> {
    const track = this.videoTrack;
    if (track)
      await applyQuality(
        track,
        typeof preset === "string" ? getQualityPreset(preset) : preset,
        senders,
      );
  }

  cleanup(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopStream(this.cameraStream);
    this.stopStream(this.microphoneStream);
    this.stopStream(this.screenStream);
    this.cameraStream = null;
    this.microphoneStream = null;
    this.screenStream = null;
    this.videoState = "off";
    this.microphoneMuted = false;
    this.emitTracks();
    this.listeners.clear();
  }

  private get activeVideoStream(): MediaStream | null {
    return this.videoState === "screen" ? this.screenStream : this.cameraStream;
  }

  private emitTracks(): void {
    const tracks = this.tracks;
    for (const listener of this.listeners) listener(tracks);
  }

  private stopStream(stream: MediaStream | null): void {
    stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
  }

  private requireMediaDevices(
    feature: string,
  ): NonNullable<MediaSessionOptions["mediaDevices"]> {
    if (!this.mediaDevices)
      throw new MediaError(
        "unavailable",
        `${feature} capture is unavailable in this context`,
      );
    return this.mediaDevices;
  }

  private assertActive(): void {
    if (this.disposed)
      throw new MediaError(
        "unavailable",
        "The media session has been cleaned up",
      );
  }

  private fail(error: unknown, feature: string): void {
    const mediaError =
      error instanceof MediaError ? error : toMediaError(error, feature);
    this.error = mediaError;
    this.emitTracks();
  }
}

export function createMediaSession(
  options?: MediaSessionOptions,
): MediaSession {
  return new MediaSession(options);
}

function toMediaError(error: unknown, feature: string): MediaError {
  const name =
    error instanceof DOMException
      ? error.name
      : (error as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return new MediaError(
      "permission-denied",
      `Permission to use ${feature} was denied`,
      error,
    );
  if (name === "NotFoundError" || name === "DevicesNotFoundError")
    return new MediaError(
      "device-not-found",
      `No ${feature} device is available`,
      error,
    );
  if (name === "NotReadableError" || name === "AbortError")
    return new MediaError(
      "unavailable",
      `${feature} is unavailable or already in use`,
      error,
    );
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError")
    return new MediaError(
      "constraints",
      `${feature} does not support the requested constraints`,
      error,
    );
  return new MediaError("unknown", `Unable to start ${feature}`, error);
}
