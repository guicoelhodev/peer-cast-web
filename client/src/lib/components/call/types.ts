import type { VideoState } from "../../types/signaling";

export type CallParticipant = {
  id: string;
  displayName: string;
  stream?: MediaStream | null;
  isHost?: boolean;
  microphoneMuted?: boolean;
  videoState?: VideoState;
  connected?: boolean;
  speaking?: boolean;
  volume?: number;
  muted?: boolean;
};

export type CallQualityOption = {
  id: string;
  label: string;
};
