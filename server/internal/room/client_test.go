package room

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type fakeConnection struct {
	reads  chan []byte
	writes chan []byte
	pings  chan struct{}

	closed           chan struct{}
	closeOnce        sync.Once
	writing          atomic.Int32
	concurrentWrites atomic.Bool
	readLimit        atomic.Int64
}

func newFakeConnection() *fakeConnection {
	return &fakeConnection{
		reads:  make(chan []byte, 8),
		writes: make(chan []byte, 8),
		pings:  make(chan struct{}, 8),
		closed: make(chan struct{}),
	}
}

func (c *fakeConnection) Read(ctx context.Context) ([]byte, error) {
	select {
	case payload := <-c.reads:
		return payload, nil
	case <-c.closed:
		return nil, errors.New("closed")
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (c *fakeConnection) Write(ctx context.Context, payload []byte) error {
	if c.writing.Add(1) != 1 {
		c.concurrentWrites.Store(true)
	}
	defer c.writing.Add(-1)
	select {
	case c.writes <- append([]byte(nil), payload...):
		return nil
	case <-c.closed:
		return errors.New("closed")
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (c *fakeConnection) Ping(ctx context.Context) error {
	if c.writing.Add(1) != 1 {
		c.concurrentWrites.Store(true)
	}
	defer c.writing.Add(-1)
	select {
	case c.pings <- struct{}{}:
		return nil
	case <-c.closed:
		return errors.New("closed")
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (c *fakeConnection) Close() error {
	c.closeOnce.Do(func() { close(c.closed) })
	return nil
}
func (c *fakeConnection) SetReadLimit(limit int64) { c.readLimit.Store(limit) }

func clientPayload(t *testing.T, message Message) []byte {
	t.Helper()
	payload, err := json.Marshal(message)
	if err != nil {
		t.Fatal(err)
	}
	return payload
}

func waitClientDone(t *testing.T, client *WebSocketClient) {
	t.Helper()
	select {
	case <-client.Done():
	case <-time.After(time.Second):
		t.Fatal("client pumps did not stop")
	}
}

func TestWebSocketClientAssociatesIdentityAndRejectsSpoofing(t *testing.T) {
	hub := NewHub(nil, nil)
	defer hub.Close()
	connection := newFakeConnection()
	client := NewWebSocketClient(connection, hub, NewPeerRegistry(), ClientOptions{MaxPayloadBytes: 123})
	receiver := NewClient(2)
	if !hub.Register(receiver) || !client.Start() {
		t.Fatal("could not start clients")
	}
	if got := connection.readLimit.Load(); got != 123 {
		t.Fatalf("read limit = %d, want 123", got)
	}
	connection.reads <- clientPayload(t, Message{Type: MessageReady, PeerID: peerID})
	if got := string(receive(t, receiver)); got == "" {
		t.Fatal("ready was not broadcast")
	}
	connection.reads <- clientPayload(t, Message{Type: MessageVideoState, PeerID: targetID, VideoState: "off"})
	select {
	case payload := <-receiver.Send:
		t.Fatalf("spoofed payload broadcast: %s", payload)
	case <-time.After(20 * time.Millisecond):
	}
	if got := client.PeerID(); got != peerID {
		t.Fatalf("peer ID = %q", got)
	}
	client.Close()
	waitClientDone(t, client)
}

func TestWebSocketClientSerializesWritesAndPings(t *testing.T) {
	hub := NewHub(nil, nil)
	defer hub.Close()
	connection := newFakeConnection()
	client := NewWebSocketClient(connection, hub, NewPeerRegistry(), ClientOptions{PingInterval: time.Millisecond, WriteTimeout: time.Second})
	if !client.Start() {
		t.Fatal("could not start client")
	}
	client.Client.Send <- []byte("one")
	client.Client.Send <- []byte("two")
	select {
	case <-connection.writes:
	case <-time.After(time.Second):
		t.Fatal("missing first write")
	}
	select {
	case <-connection.writes:
	case <-time.After(time.Second):
		t.Fatal("missing second write")
	}
	select {
	case <-connection.pings:
	case <-time.After(time.Second):
		t.Fatal("missing ping")
	}
	if connection.concurrentWrites.Load() {
		t.Fatal("concurrent websocket writes")
	}
	client.Close()
	waitClientDone(t, client)
}

func TestWebSocketClientDeliversChatHistoryOnlyToRequester(t *testing.T) {
	hub := NewHub(nil, nil)
	defer hub.Close()
	history := &ChatHistory{}
	history.Add(Message{Type: MessageChat, PeerID: targetID, MessageID: messageID, Text: "previous", SentAt: "2026-08-19T12:00:00Z"})
	connection := newFakeConnection()
	client := NewWebSocketClient(connection, hub, NewPeerRegistry(), ClientOptions{}, history)
	if !client.Start() {
		t.Fatal("could not start client")
	}
	connection.reads <- clientPayload(t, Message{Type: MessageReady, PeerID: peerID})
	connection.reads <- clientPayload(t, Message{Type: MessageChatHistoryRequest, PeerID: peerID})
	var response Message
	if err := json.Unmarshal(<-connection.writes, &response); err != nil {
		t.Fatal(err)
	}
	if response.Type != MessageChatHistory || response.PeerID != peerID || len(response.Messages) != 1 || response.Messages[0].Text != "previous" {
		t.Fatalf("history response = %+v", response)
	}
	client.Close()
	waitClientDone(t, client)
}

func TestWebSocketClientRejectsDuplicatePeerID(t *testing.T) {
	hub := NewHub(nil, nil)
	defer hub.Close()
	registry := NewPeerRegistry()
	firstConnection := newFakeConnection()
	first := NewWebSocketClient(firstConnection, hub, registry, ClientOptions{})
	if !first.Start() {
		t.Fatal("could not start first client")
	}
	firstConnection.reads <- clientPayload(t, Message{Type: MessageReady, PeerID: peerID})
	deadline := time.Now().Add(time.Second)
	for first.PeerID() != peerID && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if first.PeerID() != peerID {
		t.Fatal("first client was not identified")
	}

	secondConnection := newFakeConnection()
	second := NewWebSocketClient(secondConnection, hub, registry, ClientOptions{})
	if !second.Start() {
		t.Fatal("could not start second client")
	}
	secondConnection.reads <- clientPayload(t, Message{Type: MessageReady, PeerID: peerID})
	waitClientDone(t, second)
	if first.PeerID() != peerID {
		t.Fatal("duplicate connection displaced the original")
	}
	first.Close()
	waitClientDone(t, first)
}

func TestWebSocketClientCleanupBroadcastsIdentifiedLeaveOnce(t *testing.T) {
	hub := NewHub(nil, nil)
	defer hub.Close()
	connection := newFakeConnection()
	client := NewWebSocketClient(connection, hub, NewPeerRegistry(), ClientOptions{})
	receiver := NewClient(2)
	if !hub.Register(receiver) || !client.Start() {
		t.Fatal("could not start clients")
	}
	connection.reads <- clientPayload(t, Message{Type: MessageReady, PeerID: peerID})
	receive(t, receiver)
	client.Close()
	client.Close()
	left := receive(t, receiver)
	var message Message
	if err := json.Unmarshal(left, &message); err != nil {
		t.Fatal(err)
	}
	if message.Type != MessageParticipantLeft || message.PeerID != peerID {
		t.Fatalf("leave = %+v", message)
	}
	waitClientDone(t, client)
	select {
	case payload := <-receiver.Send:
		t.Fatalf("duplicate leave: %s", payload)
	case <-time.After(20 * time.Millisecond):
	}

	unknown := NewWebSocketClient(newFakeConnection(), hub, NewPeerRegistry(), ClientOptions{})
	if !unknown.Start() {
		t.Fatal("could not start unidentified client")
	}
	unknown.Close()
	waitClientDone(t, unknown)
	select {
	case payload := <-receiver.Send:
		t.Fatalf("unidentified leave: %s", payload)
	case <-time.After(20 * time.Millisecond):
	}
}
