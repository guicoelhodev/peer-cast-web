import type { ChatSignal } from "../../types/signaling";

export const CHAT_HISTORY_LIMIT = 200;

export type ChatMessage = Pick<ChatSignal, "peerId" | "text" | "sentAt"> & {
  id: string;
  isOwn: boolean;
  displayName?: string;
};

export function limitChatHistory(
  messages: readonly ChatMessage[],
): ChatMessage[] {
  return messages.slice(-CHAT_HISTORY_LIMIT);
}
