package room

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

const (
	peerID    = "123e4567-e89b-12d3-a456-426614174000"
	targetID  = "123e4567-e89b-12d3-a456-426614174001"
	messageID = "123e4567-e89b-12d3-a456-426614174002"
)

func TestValidatePayloadValidMessages(t *testing.T) {
	muted := false
	name := "Alice"
	candidate := "candidate:1 1 udp 1 192.0.2.1 3478 typ host"
	tests := []Message{
		{Type: MessageReady, PeerID: peerID, DisplayName: &name, MicrophoneMuted: &muted},
		{Type: MessageParticipantLeft, PeerID: peerID},
		{Type: MessageOffer, PeerID: peerID, TargetPeerID: targetID, Description: &SessionDescription{Type: "offer", SDP: "v=0"}},
		{Type: MessageAnswer, PeerID: peerID, TargetPeerID: targetID, VideoState: "camera", Description: &SessionDescription{Type: "answer", SDP: "v=0"}},
		{Type: MessageICE, PeerID: peerID, TargetPeerID: targetID, Candidate: &ICECandidate{Candidate: &candidate}},
		{Type: MessageMicrophoneState, PeerID: peerID, MicrophoneMuted: &muted},
		{Type: MessageVideoState, PeerID: peerID, VideoState: "screen"},
		{Type: MessageChat, PeerID: peerID, MessageID: messageID, Text: "hello", SentAt: "2026-08-19T12:00:00Z"},
		{Type: MessageChatHistoryRequest, PeerID: peerID},
		{Type: MessageChatHistory, PeerID: peerID, Messages: []ChatMessage{{Type: MessageChat, PeerID: peerID, MessageID: messageID, Text: "hello", SentAt: "2026-08-19T12:00:00Z"}}},
	}
	for _, message := range tests {
		t.Run(message.Type, func(t *testing.T) {
			payload, err := json.Marshal(message)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := ValidatePayload(payload, DefaultMaxPayloadBytes); err != nil {
				t.Fatalf("ValidatePayload() error = %v", err)
			}
		})
	}
}

func TestValidatePayloadRejectsInvalidMessages(t *testing.T) {
	tests := []struct {
		name    string
		payload string
		wantErr error
	}{
		{"malformed JSON", "{", ErrInvalidPayload},
		{"unknown field", `{"type":"ready","peerId":"` + peerID + `","secret":true}`, ErrInvalidPayload},
		{"unknown type", `{"type":"audio-kind"}`, ErrUnknownType},
		{"missing peer", `{"type":"ready"}`, ErrInvalidPayload},
		{"invalid peer UUID", `{"type":"ready","peerId":"peer"}`, ErrInvalidPayload},
		{"offer missing target", `{"type":"offer","peerId":"` + peerID + `","description":{"type":"offer","sdp":"v=0"}}`, ErrInvalidPayload},
		{"answer SDP type mismatch", `{"type":"answer","peerId":"` + peerID + `","targetPeerId":"` + targetID + `","description":{"type":"offer","sdp":"v=0"}}`, ErrInvalidPayload},
		{"ice missing candidate", `{"type":"ice","peerId":"` + peerID + `","targetPeerId":"` + targetID + `"}`, ErrInvalidPayload},
		{"microphone missing state", `{"type":"microphone-state","peerId":"` + peerID + `"}`, ErrInvalidPayload},
		{"invalid video state", `{"type":"video-state","peerId":"` + peerID + `","videoState":"blur"}`, ErrInvalidPayload},
		{"chat invalid timestamp", `{"type":"chat","peerId":"` + peerID + `","messageId":"` + messageID + `","text":"hi","sentAt":"today"}`, ErrInvalidPayload},
		{"chat missing message ID", `{"type":"chat","peerId":"` + peerID + `","text":"hi","sentAt":"2026-08-19T12:00:00Z"}`, ErrInvalidPayload},
		{"trailing JSON", `{"type":"ready","peerId":"` + peerID + `"} {}`, ErrInvalidPayload},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := ValidatePayload([]byte(test.payload), DefaultMaxPayloadBytes)
			if !errors.Is(err, test.wantErr) {
				t.Fatalf("ValidatePayload() error = %v, want %v", err, test.wantErr)
			}
		})
	}

}

func TestValidatePayloadUnicodeAndSizeLimits(t *testing.T) {
	name50 := strings.Repeat("界", MaxDisplayNameRunes)
	name51 := name50 + "界"
	chat500 := strings.Repeat("🙂", MaxChatTextRunes)
	chat501 := chat500 + "🙂"
	for _, test := range []struct {
		name    string
		message Message
		wantErr bool
	}{
		{"name at rune limit", Message{Type: MessageReady, PeerID: peerID, DisplayName: &name50}, false},
		{"name above rune limit", Message{Type: MessageReady, PeerID: peerID, DisplayName: &name51}, true},
		{"chat at rune limit", Message{Type: MessageChat, PeerID: peerID, MessageID: messageID, Text: chat500, SentAt: "2026-08-19T12:00:00Z"}, false},
		{"chat above rune limit", Message{Type: MessageChat, PeerID: peerID, MessageID: messageID, Text: chat501, SentAt: "2026-08-19T12:00:00Z"}, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			payload, _ := json.Marshal(test.message)
			_, err := ValidatePayload(payload, DefaultMaxPayloadBytes)
			if (err != nil) != test.wantErr {
				t.Fatalf("ValidatePayload() error = %v, want error %t", err, test.wantErr)
			}
		})
	}
	if _, err := ValidatePayload([]byte(strings.Repeat("x", 11)), 10); !errors.Is(err, ErrInvalidPayload) {
		t.Fatalf("payload limit error = %v", err)
	}
}

func TestValidateClientMessageIdentity(t *testing.T) {
	ready, _ := json.Marshal(Message{Type: MessageReady, PeerID: peerID})
	message, associated, err := ValidateClientMessage(ready, "", DefaultMaxPayloadBytes)
	if err != nil || message.Type != MessageReady || associated != peerID {
		t.Fatalf("ready = (%+v, %q, %v)", message, associated, err)
	}
	state := "off"
	valid, _ := json.Marshal(Message{Type: MessageVideoState, PeerID: peerID, VideoState: state})
	if _, associated, err = ValidateClientMessage(valid, associated, DefaultMaxPayloadBytes); err != nil || associated != peerID {
		t.Fatalf("same identity error = %v, associated = %q", err, associated)
	}
	spoofed, _ := json.Marshal(Message{Type: MessageVideoState, PeerID: targetID, VideoState: state})
	if _, _, err := ValidateClientMessage(spoofed, peerID, DefaultMaxPayloadBytes); !errors.Is(err, ErrIdentity) {
		t.Fatalf("spoofing error = %v", err)
	}
	if _, _, err := ValidateClientMessage(valid, "", DefaultMaxPayloadBytes); !errors.Is(err, ErrIdentity) {
		t.Fatalf("message before ready error = %v", err)
	}
	left, _ := json.Marshal(Message{Type: MessageParticipantLeft, PeerID: peerID})
	if _, _, err := ValidateClientMessage(left, peerID, DefaultMaxPayloadBytes); !errors.Is(err, ErrInvalidPayload) {
		t.Fatalf("client participant-left error = %v", err)
	}
}
