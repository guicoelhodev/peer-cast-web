package room

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"regexp"
	"time"
	"unicode/utf8"
)

const (
	DefaultMaxPayloadBytes = 65536
	MaxDisplayNameRunes    = 50
	MaxChatTextRunes       = 500
)

const (
	MessageReady           = "ready"
	MessageParticipantLeft = "participant-left"
	MessageOffer           = "offer"
	MessageAnswer          = "answer"
	MessageICE             = "ice"
	MessageMicrophoneState = "microphone-state"
	MessageVideoState      = "video-state"
	MessageChat               = "chat"
	MessageChatHistoryRequest = "chat-history-request"
	MessageChatHistory        = "chat-history"
)

type ErrorKind string

const (
	ErrorPayload  ErrorKind = "payload"
	ErrorType     ErrorKind = "type"
	ErrorIdentity ErrorKind = "identity"
)

type ValidationError struct {
	Kind ErrorKind
}

func (e *ValidationError) Error() string {
	return "invalid signaling " + string(e.Kind)
}

func (e *ValidationError) Is(target error) bool {
	other, ok := target.(*ValidationError)
	return ok && e.Kind == other.Kind
}

var (
	ErrInvalidPayload = &ValidationError{Kind: ErrorPayload}
	ErrUnknownType    = &ValidationError{Kind: ErrorType}
	ErrIdentity       = &ValidationError{Kind: ErrorIdentity}
)

type SessionDescription struct {
	Type string `json:"type"`
	SDP  string `json:"sdp"`
}

type ICECandidate struct {
	Candidate        *string `json:"candidate"`
	SDPMid           *string `json:"sdpMid,omitempty"`
	SDPMLineIndex    *uint16 `json:"sdpMLineIndex,omitempty"`
	UsernameFragment *string `json:"usernameFragment,omitempty"`
}

type ChatMessage struct {
	Type      string `json:"type"`
	PeerID    string `json:"peerId"`
	MessageID string `json:"messageId"`
	Text      string `json:"text"`
	SentAt    string `json:"sentAt"`
}

type Message struct {
	Type            string              `json:"type"`
	PeerID          string              `json:"peerId,omitempty"`
	TargetPeerID    string              `json:"targetPeerId,omitempty"`
	DisplayName     *string             `json:"displayName,omitempty"`
	MicrophoneMuted *bool               `json:"microphoneMuted,omitempty"`
	VideoState      string              `json:"videoState,omitempty"`
	IsHost          *bool               `json:"isHost,omitempty"`
	Description     *SessionDescription `json:"description,omitempty"`
	Candidate       *ICECandidate       `json:"candidate,omitempty"`
	MessageID       string              `json:"messageId,omitempty"`
	Text            string              `json:"text,omitempty"`
	SentAt          string              `json:"sentAt,omitempty"`
	Messages        []ChatMessage       `json:"messages"`
}

var uuidPattern = regexp.MustCompile(`^[[:xdigit:]]{8}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{12}$`)

func ValidatePayload(payload []byte, maxPayloadBytes int) (Message, error) {
	if maxPayloadBytes <= 0 {
		maxPayloadBytes = DefaultMaxPayloadBytes
	}
	if len(payload) == 0 || len(payload) > maxPayloadBytes {
		return Message{}, ErrInvalidPayload
	}

	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	var message Message
	if err := decoder.Decode(&message); err != nil {
		return Message{}, ErrInvalidPayload
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return Message{}, ErrInvalidPayload
	}
	if err := validateMessage(message); err != nil {
		return Message{}, err
	}
	return message, nil
}

func ValidateClientMessage(payload []byte, associatedPeerID string, maxPayloadBytes int) (Message, string, error) {
	message, err := ValidatePayload(payload, maxPayloadBytes)
	if err != nil {
		return Message{}, associatedPeerID, err
	}
	if message.Type == MessageParticipantLeft {
		return Message{}, associatedPeerID, ErrInvalidPayload
	}
	if message.Type == MessageChatHistory {
		return Message{}, associatedPeerID, ErrInvalidPayload
	}
	if associatedPeerID == "" {
		if message.Type != MessageReady {
			return Message{}, associatedPeerID, ErrIdentity
		}
		return message, message.PeerID, nil
	}
	if message.PeerID != associatedPeerID {
		return Message{}, associatedPeerID, ErrIdentity
	}
	return message, associatedPeerID, nil
}

func ValidateServerMessage(message Message) error {
	if message.Type != MessageParticipantLeft {
		return ErrInvalidPayload
	}
	return validateMessage(message)
}

func validateMessage(message Message) error {
	switch message.Type {
	case MessageReady:
		if !validUUID(message.PeerID) || !validDisplayName(message.DisplayName) {
			return ErrInvalidPayload
		}
	case MessageParticipantLeft:
		if !validUUID(message.PeerID) {
			return ErrInvalidPayload
		}
	case MessageOffer, MessageAnswer:
		if !validUUID(message.PeerID) || !validUUID(message.TargetPeerID) || !validDisplayName(message.DisplayName) || !validVideoState(message.VideoState, true) || message.Description == nil || message.Description.Type != message.Type || message.Description.SDP == "" {
			return ErrInvalidPayload
		}
	case MessageICE:
		if !validUUID(message.PeerID) || !validUUID(message.TargetPeerID) || message.Candidate == nil || message.Candidate.Candidate == nil {
			return ErrInvalidPayload
		}
	case MessageMicrophoneState:
		if !validUUID(message.PeerID) || message.MicrophoneMuted == nil {
			return ErrInvalidPayload
		}
	case MessageVideoState:
		if !validUUID(message.PeerID) || !validVideoState(message.VideoState, false) {
			return ErrInvalidPayload
		}
	case MessageChat:
		if !validUUID(message.PeerID) || !validUUID(message.MessageID) || message.Text == "" || utf8.RuneCountInString(message.Text) > MaxChatTextRunes || !validTimestamp(message.SentAt) {
			return ErrInvalidPayload
		}
	case MessageChatHistoryRequest:
		if !validUUID(message.PeerID) {
			return ErrInvalidPayload
		}
	case MessageChatHistory:
		if !validUUID(message.PeerID) || len(message.Messages) > MaxChatHistoryMessages {
			return ErrInvalidPayload
		}
		for _, item := range message.Messages {
			if item.Type != MessageChat || !validUUID(item.PeerID) || !validUUID(item.MessageID) || item.Text == "" || utf8.RuneCountInString(item.Text) > MaxChatTextRunes || !validTimestamp(item.SentAt) {
				return ErrInvalidPayload
			}
		}
	default:
		return ErrUnknownType
	}
	return nil
}

func validUUID(value string) bool { return uuidPattern.MatchString(value) }

func validDisplayName(value *string) bool {
	return value == nil || utf8.RuneCountInString(*value) <= MaxDisplayNameRunes
}

func validVideoState(value string, optional bool) bool {
	if optional && value == "" {
		return true
	}
	return value == "camera" || value == "screen" || value == "off"
}

func validTimestamp(value string) bool {
	if value == "" {
		return false
	}
	_, err := time.Parse(time.RFC3339, value)
	return err == nil
}
