import {
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_SIGNAL_PAYLOAD_BYTES,
  type SignalMessage,
  type VideoState,
} from "../types/signaling";

const uuidPattern =
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const timestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const encoder = new TextEncoder();

export class SignalMessageError extends Error {
  constructor(message = "Invalid signaling message") {
    super(message);
    this.name = "SignalMessageError";
  }
}

export function parseSignalMessage(
  data: string,
  maxPayloadBytes = MAX_SIGNAL_PAYLOAD_BYTES,
): SignalMessage | null {
  if (encoder.encode(data).byteLength > maxPayloadBytes) return null;

  try {
    return parseMessage(JSON.parse(data));
  } catch {
    return null;
  }
}

export function serializeSignalMessage(
  message: SignalMessage,
  maxPayloadBytes = MAX_SIGNAL_PAYLOAD_BYTES,
): string {
  const parsed = parseMessage(message);
  if (!parsed) throw new SignalMessageError();

  const payload = JSON.stringify(parsed);
  if (encoder.encode(payload).byteLength > maxPayloadBytes) {
    throw new SignalMessageError("Signaling message exceeds the payload limit");
  }
  return payload;
}

function parseMessage(value: unknown): SignalMessage | null {
  if (
    !isRecord(value) ||
    !hasOnlyKnownFields(value) ||
    typeof value.type !== "string" ||
    !isUUID(value.peerId)
  ) {
    return null;
  }

  switch (value.type) {
    case "ready":
      return optionalDisplayName(value) &&
        optionalBoolean(value, "microphoneMuted")
        ? (value as SignalMessage)
        : null;
    case "participant-left":
      return value as SignalMessage;
    case "offer":
    case "answer":
      return isUUID(value.targetPeerId) &&
        optionalBoolean(value, "isHost") &&
        optionalDisplayName(value) &&
        optionalBoolean(value, "microphoneMuted") &&
        optionalVideoState(value) &&
        isSessionDescription(value.description, value.type)
        ? (value as SignalMessage)
        : null;
    case "ice":
      return isUUID(value.targetPeerId) && isIceCandidate(value.candidate)
        ? (value as SignalMessage)
        : null;
    case "microphone-state":
      return typeof value.microphoneMuted === "boolean"
        ? (value as SignalMessage)
        : null;
    case "video-state":
      return isVideoState(value.videoState) ? (value as SignalMessage) : null;
    case "chat":
      return isUUID(value.messageId) &&
        typeof value.text === "string" &&
        value.text.length > 0 &&
        [...value.text].length <= MAX_CHAT_MESSAGE_LENGTH &&
        isTimestamp(value.sentAt)
        ? (value as SignalMessage)
        : null;
    default:
      return null;
  }
}

function hasOnlyKnownFields(value: Record<string, unknown>): boolean {
  const allowed = new Set([
    "type",
    "peerId",
    "targetPeerId",
    "displayName",
    "microphoneMuted",
    "videoState",
    "isHost",
    "description",
    "candidate",
    "messageId",
    "text",
    "sentAt",
  ]);
  return Object.keys(value).every((key) => allowed.has(key));
}

function optionalDisplayName(value: Record<string, unknown>): boolean {
  return (
    value.displayName === undefined ||
    (typeof value.displayName === "string" &&
      [...value.displayName].length <= MAX_DISPLAY_NAME_LENGTH)
  );
}

function optionalBoolean(value: Record<string, unknown>, key: string): boolean {
  return value[key] === undefined || typeof value[key] === "boolean";
}

function optionalVideoState(value: Record<string, unknown>): boolean {
  return value.videoState === undefined || isVideoState(value.videoState);
}

function isSessionDescription(
  value: unknown,
  type: string,
): value is RTCSessionDescriptionInit {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => key === "type" || key === "sdp") &&
    value.type === type &&
    typeof value.sdp === "string" &&
    value.sdp.length > 0
  );
}

function isIceCandidate(value: unknown): value is RTCIceCandidateInit {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) =>
      ["candidate", "sdpMid", "sdpMLineIndex", "usernameFragment"].includes(
        key,
      ),
    ) &&
    typeof value.candidate === "string" &&
    (value.sdpMid === undefined ||
      value.sdpMid === null ||
      typeof value.sdpMid === "string") &&
    (value.sdpMLineIndex === undefined ||
      value.sdpMLineIndex === null ||
      (typeof value.sdpMLineIndex === "number" &&
        Number.isInteger(value.sdpMLineIndex) &&
        value.sdpMLineIndex >= 0 &&
        value.sdpMLineIndex <= 65535)) &&
    (value.usernameFragment === undefined ||
      value.usernameFragment === null ||
      typeof value.usernameFragment === "string")
  );
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    timestampPattern.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isUUID(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function isVideoState(value: unknown): value is VideoState {
  return value === "camera" || value === "screen" || value === "off";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
