package room

import "sync"

const MaxChatHistoryMessages = 25

type ChatHistory struct {
	mu       sync.Mutex
	messages []ChatMessage
}

func (h *ChatHistory) Add(message Message) {
	if h == nil || message.Type != MessageChat {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.messages = append(h.messages, ChatMessage{
		Type:      message.Type,
		PeerID:    message.PeerID,
		MessageID: message.MessageID,
		Text:      message.Text,
		SentAt:    message.SentAt,
	})
	if len(h.messages) > MaxChatHistoryMessages {
		h.messages = h.messages[len(h.messages)-MaxChatHistoryMessages:]
	}
}

func (h *ChatHistory) Messages() []ChatMessage {
	if h == nil {
		return []ChatMessage{}
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	return append([]ChatMessage(nil), h.messages...)
}
