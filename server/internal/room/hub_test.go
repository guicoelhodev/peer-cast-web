package room

import (
	"testing"
	"time"
)

func receive(t *testing.T, client *Client) []byte {
	t.Helper()
	select {
	case message, ok := <-client.Send:
		if !ok {
			t.Fatal("client queue closed")
		}
		return message
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for message")
		return nil
	}
}

func TestHubIsolatesRooms(t *testing.T) {
	first := NewHub(nil, nil)
	second := NewHub(nil, nil)
	t.Cleanup(first.Close)
	t.Cleanup(second.Close)

	firstSender := NewClient(1)
	firstReceiver := NewClient(1)
	secondReceiver := NewClient(1)
	if !first.Register(firstSender) || !first.Register(firstReceiver) || !second.Register(secondReceiver) {
		t.Fatal("could not register clients")
	}

	first.Broadcast(firstSender, []byte("room one"))
	if got := string(receive(t, firstReceiver)); got != "room one" {
		t.Fatalf("message = %q, want room one", got)
	}
	select {
	case message := <-secondReceiver.Send:
		t.Fatalf("unexpected cross-room message: %q", message)
	case <-time.After(20 * time.Millisecond):
	}
}

func TestHubBroadcastDoesNotEchoSender(t *testing.T) {
	hub := NewHub(nil, nil)
	t.Cleanup(hub.Close)
	sender := NewClient(1)
	receiver := NewClient(1)
	hub.Register(sender)
	hub.Register(receiver)

	hub.Broadcast(sender, []byte("signal"))
	if got := string(receive(t, receiver)); got != "signal" {
		t.Fatalf("message = %q, want signal", got)
	}
	select {
	case message := <-sender.Send:
		t.Fatalf("sender received echo: %q", message)
	case <-time.After(20 * time.Millisecond):
	}
}

func TestHubCountAndTransitions(t *testing.T) {
	occupied := make(chan struct{}, 2)
	empty := make(chan struct{}, 2)
	hub := NewHub(func() { occupied <- struct{}{} }, func() { empty <- struct{}{} })
	t.Cleanup(hub.Close)
	first := NewClient(1)
	second := NewClient(1)

	if !hub.Register(first) || hub.Count() != 1 {
		t.Fatalf("count after first registration = %d, want 1", hub.Count())
	}
	receiveSignal(t, occupied)
	if !hub.Register(second) || hub.Count() != 2 {
		t.Fatalf("count after second registration = %d, want 2", hub.Count())
	}
	assertNoSignal(t, occupied)
	hub.Unregister(first)
	waitForCount(t, hub, 1)
	assertNoSignal(t, empty)
	hub.Unregister(second)
	waitForCount(t, hub, 0)
	receiveSignal(t, empty)
}

func TestHubRemovesSlowClient(t *testing.T) {
	hub := NewHub(nil, nil)
	t.Cleanup(hub.Close)
	sender := NewClient(1)
	slow := NewClient(1)
	fast := NewClient(2)
	hub.Register(sender)
	hub.Register(slow)
	hub.Register(fast)

	hub.Broadcast(sender, []byte("first"))
	hub.Broadcast(sender, []byte("second"))
	waitForCount(t, hub, 2)
	if got := string(receive(t, fast)); got != "first" {
		t.Fatalf("first message = %q", got)
	}
	if got := string(receive(t, fast)); got != "second" {
		t.Fatalf("second message = %q", got)
	}
	if _, ok := <-slow.Send; !ok {
		t.Fatal("slow queue closed before queued message was observable")
	}
	if _, ok := <-slow.Send; ok {
		t.Fatal("slow client queue remains open")
	}
}

func TestHubCloseIsIdempotent(t *testing.T) {
	hub := NewHub(nil, nil)
	client := NewClient(1)
	hub.Register(client)
	hub.Close()
	hub.Close()
	select {
	case <-hub.Done():
	case <-time.After(time.Second):
		t.Fatal("hub did not stop")
	}
	if _, ok := <-client.Send; ok {
		t.Fatal("client queue remains open")
	}
}

func receiveSignal(t *testing.T, signal <-chan struct{}) {
	t.Helper()
	select {
	case <-signal:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for transition")
	}
}

func assertNoSignal(t *testing.T, signal <-chan struct{}) {
	t.Helper()
	select {
	case <-signal:
		t.Fatal("unexpected transition")
	case <-time.After(20 * time.Millisecond):
	}
}

func waitForCount(t *testing.T, hub *Hub, want int) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if hub.Count() == want {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("count = %d, want %d", hub.Count(), want)
}
