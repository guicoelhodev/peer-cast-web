package room

import (
	"sync"
	"testing"
	"time"
)

func TestManagerCreateAndGet(t *testing.T) {
	manager := NewManager(time.Hour, nil)
	room, err := manager.Create()
	if err != nil {
		t.Fatal(err)
	}
	if len(room.ID) != 32 {
		t.Fatalf("ID length = %d, want 32", len(room.ID))
	}
	if got, ok := manager.Get(room.ID); !ok || got != room {
		t.Fatal("created room was not found")
	}
	if room.Registry == nil {
		t.Fatal("created room has no peer registry")
	}
	hub := room.Hub
	manager.Remove(room.ID)
	if _, ok := manager.Get(room.ID); ok {
		t.Fatal("removed room was found")
	}
	select {
	case <-hub.Done():
	case <-time.After(time.Second):
		t.Fatal("removed room hub was not closed")
	}
	if room.Registry != nil {
		t.Fatal("removed room retains peer registry")
	}
}

func TestManagerCreatesDistinctPeerRegistries(t *testing.T) {
	manager := NewManager(time.Hour, nil)
	first, err := manager.Create()
	if err != nil {
		t.Fatal(err)
	}
	second, err := manager.Create()
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Remove(first.ID)
	defer manager.Remove(second.ID)

	if first.Registry == nil || second.Registry == nil || first.Registry == second.Registry {
		t.Fatal("rooms do not have distinct peer registries")
	}
}

func TestManagerExpiresInitiallyEmptyRoom(t *testing.T) {
	manager := NewManager(20*time.Millisecond, nil)
	room, err := manager.Create()
	if err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool {
		_, ok := manager.Get(room.ID)
		return !ok
	})
}

func TestManagerExpiresAfterLastLeave(t *testing.T) {
	manager := NewManager(20*time.Millisecond, nil)
	room, err := manager.Create()
	if err != nil {
		t.Fatal(err)
	}
	client := NewClient(1)
	if !room.Hub.Register(client) {
		t.Fatal("could not register client")
	}
	room.Hub.Unregister(client)
	waitFor(t, func() bool {
		_, ok := manager.Get(room.ID)
		return !ok
	})
}

func TestManagerReconnectCancelsExpiration(t *testing.T) {
	manager := NewManager(30*time.Millisecond, nil)
	room, err := manager.Create()
	if err != nil {
		t.Fatal(err)
	}
	first := NewClient(1)
	if !room.Hub.Register(first) {
		t.Fatal("could not register first client")
	}
	room.Hub.Unregister(first)
	time.Sleep(10 * time.Millisecond)
	second := NewClient(1)
	if !room.Hub.Register(second) {
		t.Fatal("could not register reconnecting client")
	}
	time.Sleep(40 * time.Millisecond)
	if got, ok := manager.Get(room.ID); !ok || got != room {
		t.Fatal("reconnected room expired")
	}
	manager.Remove(room.ID)
}

func TestManagerIgnoresObsoleteExpiration(t *testing.T) {
	manager := NewManager(time.Hour, nil)
	room, err := manager.Create()
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Remove(room.ID)

	client := NewClient(1)
	if !room.Hub.Register(client) {
		t.Fatal("could not register client")
	}
	manager.expire(room.ID, room, 1)
	if got, ok := manager.Get(room.ID); !ok || got != room {
		t.Fatal("obsolete callback removed occupied room")
	}

	room.Hub.Unregister(client)
	waitFor(t, func() bool { return room.Hub.Count() == 0 })
	second := NewClient(1)
	if !room.Hub.Register(second) {
		t.Fatal("could not register reconnecting client")
	}
	manager.expire(room.ID, room, 2)
	if got, ok := manager.Get(room.ID); !ok || got != room {
		t.Fatal("obsolete callback removed reoccupied room")
	}
}

func TestManagerConcurrentAccess(t *testing.T) {
	manager := NewManager(time.Hour, nil)
	const workers = 32

	rooms := make(chan *Room, workers)
	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			room, err := manager.Create()
			if err != nil {
				t.Errorf("Create() error = %v", err)
				return
			}
			client := NewClient(1)
			if !room.Hub.Register(client) {
				t.Error("could not register client")
				return
			}
			room.Hub.Unregister(client)
			rooms <- room
		}()
	}
	wg.Wait()
	close(rooms)
	if got := manager.Count(); got != workers {
		t.Fatalf("Count() = %d, want %d", got, workers)
	}
	for room := range rooms {
		manager.Remove(room.ID)
	}
	if got := manager.Count(); got != 0 {
		t.Fatalf("Count() after removal = %d, want 0", got)
	}
}

func waitFor(t *testing.T, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("condition was not met before timeout")
}
