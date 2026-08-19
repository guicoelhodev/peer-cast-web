package room

import (
	"context"
	"encoding/json"
	"sync"
	"time"
)

const (
	defaultPingInterval = 30 * time.Second
	defaultReadTimeout  = 60 * time.Second
	defaultWriteTimeout = 10 * time.Second
)

type ClientConnection interface {
	Read(context.Context) ([]byte, error)
	Write(context.Context, []byte) error
	Ping(context.Context) error
	Close() error
}

type readLimitSetter interface {
	SetReadLimit(int64)
}

type ClientOptions struct {
	MaxPayloadBytes int
	PingInterval    time.Duration
	ReadTimeout     time.Duration
	WriteTimeout    time.Duration
	QueueSize       int
}

func (o ClientOptions) withDefaults() ClientOptions {
	if o.MaxPayloadBytes <= 0 {
		o.MaxPayloadBytes = DefaultMaxPayloadBytes
	}
	if o.PingInterval <= 0 {
		o.PingInterval = defaultPingInterval
	}
	if o.ReadTimeout <= 0 {
		o.ReadTimeout = defaultReadTimeout
	}
	if o.WriteTimeout <= 0 {
		o.WriteTimeout = defaultWriteTimeout
	}
	if o.QueueSize <= 0 {
		o.QueueSize = defaultClientQueueSize
	}
	return o
}

type PeerRegistry struct {
	mu      sync.Mutex
	clients map[string]*WebSocketClient
}

func NewPeerRegistry() *PeerRegistry {
	return &PeerRegistry{clients: make(map[string]*WebSocketClient)}
}

func (r *PeerRegistry) Claim(peerID string, client *WebSocketClient) bool {
	if r == nil {
		return true
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.clients == nil {
		r.clients = make(map[string]*WebSocketClient)
	}
	if _, exists := r.clients[peerID]; exists {
		return false
	}
	r.clients[peerID] = client
	return true
}

func (r *PeerRegistry) Release(peerID string, client *WebSocketClient) {
	if r == nil || peerID == "" {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.clients[peerID] == client {
		delete(r.clients, peerID)
	}
}

func (r *PeerRegistry) ReadyMessages(except *WebSocketClient) [][]byte {
	if r == nil {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	messages := make([][]byte, 0, len(r.clients))
	for _, client := range r.clients {
		if client == except {
			continue
		}
		if payload := client.readyMessage(); payload != nil {
			messages = append(messages, payload)
		}
	}
	return messages
}

type WebSocketClient struct {
	Client *Client

	connection ClientConnection
	hub        *Hub
	registry   *PeerRegistry
	options    ClientOptions

	ctx    context.Context
	cancel context.CancelFunc

	mu     sync.Mutex
	peerID string
	ready  []byte

	startOnce  sync.Once
	closeOnce  sync.Once
	finishOnce sync.Once
	started    bool
	done       chan struct{}
	pumps      sync.WaitGroup
}

func NewWebSocketClient(connection ClientConnection, hub *Hub, registry *PeerRegistry, options ClientOptions) *WebSocketClient {
	options = options.withDefaults()
	ctx, cancel := context.WithCancel(context.Background())
	client := &WebSocketClient{
		Client:     NewClient(options.QueueSize),
		connection: connection,
		hub:        hub,
		registry:   registry,
		options:    options,
		ctx:        ctx,
		cancel:     cancel,
		done:       make(chan struct{}),
	}
	if setter, ok := connection.(readLimitSetter); ok {
		setter.SetReadLimit(int64(options.MaxPayloadBytes))
	}
	return client
}

func (c *WebSocketClient) Start() bool {
	started := false
	c.startOnce.Do(func() {
		select {
		case <-c.ctx.Done():
			c.finish()
			return
		default:
		}
		if c.connection == nil || c.hub == nil || !c.hub.Register(c.Client) {
			c.Close()
			return
		}
		c.mu.Lock()
		c.started = true
		c.mu.Unlock()
		c.pumps.Add(2)
		go c.readPump()
		go c.writePump()
		go func() {
			c.pumps.Wait()
			c.finish()
		}()
		started = true
	})
	return started
}

func (c *WebSocketClient) Done() <-chan struct{} { return c.done }

func (c *WebSocketClient) PeerID() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.peerID
}

func (c *WebSocketClient) readPump() {
	defer c.pumps.Done()
	defer c.Close()
	for {
		readCtx, cancel := context.WithTimeout(c.ctx, c.options.ReadTimeout)
		payload, err := c.connection.Read(readCtx)
		cancel()
		if err != nil {
			return
		}

		peerID := c.PeerID()
		_, associatedPeerID, err := ValidateClientMessage(payload, peerID, c.options.MaxPayloadBytes)
		if err != nil {
			continue
		}
		if peerID == "" {
			if !c.registry.Claim(associatedPeerID, c) {
				return
			}
			c.mu.Lock()
			c.peerID = associatedPeerID
			c.ready = append([]byte(nil), payload...)
			c.mu.Unlock()
			for _, ready := range c.registry.ReadyMessages(c) {
				c.hub.Deliver(c.Client, ready)
			}
		}
		c.hub.Broadcast(c.Client, payload)
	}
}

func (c *WebSocketClient) readyMessage() []byte {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]byte(nil), c.ready...)
}

func (c *WebSocketClient) writePump() {
	defer c.pumps.Done()
	defer c.Close()
	ticker := time.NewTicker(c.options.PingInterval)
	defer ticker.Stop()
	for {
		select {
		case payload, ok := <-c.Client.Send:
			if !ok {
				return
			}
			if !c.write(payload) {
				return
			}
		case <-ticker.C:
			writeCtx, cancel := context.WithTimeout(c.ctx, c.options.WriteTimeout)
			err := c.connection.Ping(writeCtx)
			cancel()
			if err != nil {
				return
			}
		case <-c.ctx.Done():
			return
		}
	}
}

func (c *WebSocketClient) write(payload []byte) bool {
	writeCtx, cancel := context.WithTimeout(c.ctx, c.options.WriteTimeout)
	err := c.connection.Write(writeCtx, payload)
	cancel()
	return err == nil
}

func (c *WebSocketClient) Close() {
	c.closeOnce.Do(func() {
		c.cancel()
		if c.connection != nil {
			_ = c.connection.Close()
		}
		peerID := c.PeerID()
		c.registry.Release(peerID, c)
		if peerID != "" && c.hub != nil {
			if payload, err := json.Marshal(Message{Type: MessageParticipantLeft, PeerID: peerID}); err == nil {
				c.hub.Broadcast(c.Client, payload)
			}
		}
		if c.hub != nil {
			c.hub.Unregister(c.Client)
		}
		c.mu.Lock()
		started := c.started
		c.mu.Unlock()
		if !started {
			c.finish()
		}
	})
}

func (c *WebSocketClient) finish() {
	c.finishOnce.Do(func() { close(c.done) })
}
