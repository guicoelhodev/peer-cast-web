import type { SignalMessage, VideoState } from "../types/signaling";

export type PeerConnectionFactory = (
  configuration?: RTCConfiguration,
) => RTCPeerConnection;

export type Participant = {
  peerId: string;
  displayName: string;
  isHost: boolean;
  microphoneMuted: boolean;
  videoState: VideoState;
  connected: boolean;
  stream: MediaStream;
  audioStream: MediaStream;
};

export type LocalPeerState = {
  displayName: string;
  isHost: boolean;
  microphoneMuted: boolean;
  videoState: VideoState;
};

export type PeerManagerOptions = LocalPeerState & {
  peerId: string;
  sendSignal: (message: SignalMessage) => void;
  onParticipantsChange?: (participants: Participant[]) => void;
  createPeerConnection?: PeerConnectionFactory;
  createMediaStream?: () => MediaStream;
  configuration?: RTCConfiguration;
};

export type PeerManager = {
  readonly participants: Participant[];
  handleSignal: (message: SignalMessage) => Promise<void>;
  addParticipant: (
    peerId: string,
    participant?: Partial<
      Omit<Participant, "peerId" | "stream" | "audioStream" | "connected">
    >,
  ) => Promise<void>;
  removeParticipant: (peerId: string) => void;
  setLocalState: (state: Partial<LocalPeerState>) => void;
  setLocalTracks: (
    tracks: MediaStreamTrack[],
    stream?: MediaStream,
  ) => Promise<void>;
  addLocalTrack: (
    track: MediaStreamTrack,
    stream?: MediaStream,
  ) => Promise<void>;
  replaceLocalTrack: (
    kind: MediaStreamTrack["kind"],
    track: MediaStreamTrack,
    stream?: MediaStream,
  ) => Promise<void>;
  removeLocalTracks: (kind?: MediaStreamTrack["kind"]) => Promise<void>;
  renegotiate: (peerId?: string) => Promise<void>;
  rebuild: () => Promise<void>;
  cleanup: () => void;
};
