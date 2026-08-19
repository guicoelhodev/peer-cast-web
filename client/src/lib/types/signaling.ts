export const MAX_SIGNAL_PAYLOAD_BYTES = 65_536;
export const MAX_DISPLAY_NAME_LENGTH = 50;
export const MAX_CHAT_MESSAGE_LENGTH = 500;

export type VideoState = "camera" | "screen" | "off";

export type ReadySignal = {
  type: "ready";
  peerId: string;
  displayName?: string;
  microphoneMuted?: boolean;
};

export type ParticipantLeftSignal = {
  type: "participant-left";
  peerId: string;
};

export type OfferSignal = {
  type: "offer";
  peerId: string;
  targetPeerId: string;
  isHost?: boolean;
  displayName?: string;
  microphoneMuted?: boolean;
  videoState?: VideoState;
  description: RTCSessionDescriptionInit;
};

export type AnswerSignal = Omit<OfferSignal, "type"> & { type: "answer" };

export type IceSignal = {
  type: "ice";
  peerId: string;
  targetPeerId: string;
  candidate: RTCIceCandidateInit;
};

export type MicrophoneStateSignal = {
  type: "microphone-state";
  peerId: string;
  microphoneMuted: boolean;
};

export type VideoStateSignal = {
  type: "video-state";
  peerId: string;
  videoState: VideoState;
};

export type ChatSignal = {
  type: "chat";
  peerId: string;
  messageId: string;
  text: string;
  sentAt: string;
};

export type SignalMessage =
  | ReadySignal
  | ParticipantLeftSignal
  | OfferSignal
  | AnswerSignal
  | IceSignal
  | MicrophoneStateSignal
  | VideoStateSignal
  | ChatSignal;

export type TargetedSignal = OfferSignal | AnswerSignal | IceSignal;

export function isTargetedSignal(
  message: SignalMessage,
): message is TargetedSignal {
  return "targetPeerId" in message;
}

export function isMessageForPeer(
  message: SignalMessage,
  peerId: string,
): boolean {
  return !isTargetedSignal(message) || message.targetPeerId === peerId;
}
