package room

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

type Room struct {
	ID       string
	Hub      *Hub
	Registry *PeerRegistry

	empty      bool
	expiration *time.Timer
	generation uint64
}

type Manager struct {
	mu       sync.Mutex
	rooms    map[string]*Room
	emptyTTL time.Duration
	newHub   func(onOccupied, onEmpty func()) *Hub
}

func NewManager(emptyTTL time.Duration, newHub func(onOccupied, onEmpty func()) *Hub) *Manager {
	if newHub == nil {
		newHub = NewHub
	}

	return &Manager{
		rooms:    make(map[string]*Room),
		emptyTTL: emptyTTL,
		newHub:   newHub,
	}
}

func (m *Manager) Create() (*Room, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for {
		id, err := newRoomID()
		if err != nil {
			return nil, err
		}
		if _, exists := m.rooms[id]; exists {
			continue
		}

		room := &Room{
			ID:       id,
			Registry: NewPeerRegistry(),
			empty:    true,
		}
		room.Hub = m.newHub(
			func() { m.MarkOccupied(id) },
			func() { m.MarkEmpty(id) },
		)
		m.rooms[id] = room
		m.scheduleExpirationLocked(room)
		return room, nil
	}
}

func (m *Manager) Get(id string) (*Room, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	room, ok := m.rooms[id]
	return room, ok
}

func (m *Manager) Remove(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.removeLocked(id, m.rooms[id])
}

func (m *Manager) Count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.rooms)
}

func (m *Manager) MarkOccupied(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	room, ok := m.rooms[id]
	if !ok {
		return
	}
	room.empty = false
	room.generation++
	if room.expiration != nil {
		room.expiration.Stop()
		room.expiration = nil
	}
}

func (m *Manager) MarkEmpty(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	room, ok := m.rooms[id]
	if !ok || room.empty {
		return
	}
	room.empty = true
	m.scheduleExpirationLocked(room)
}

func (m *Manager) scheduleExpirationLocked(room *Room) {
	room.generation++
	generation := room.generation
	room.expiration = time.AfterFunc(m.emptyTTL, func() {
		m.expire(room.ID, room, generation)
	})
}

func (m *Manager) expire(id string, expected *Room, generation uint64) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.rooms[id] != expected || !expected.empty || expected.generation != generation {
		return
	}
	m.removeLocked(id, expected)
}

func (m *Manager) removeLocked(id string, expected *Room) {
	if expected == nil || m.rooms[id] != expected {
		return
	}
	if expected.expiration != nil {
		expected.expiration.Stop()
		expected.expiration = nil
	}
	delete(m.rooms, id)
	expected.Hub.Close()
	expected.Hub = nil
	expected.Registry = nil
}

func newRoomID() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	value[6] = value[6]&0x0f | 0x40
	value[8] = value[8]&0x3f | 0x80
	return hex.EncodeToString(value), nil
}
