package room

import (
	"sync"
	"sync/atomic"
)

const defaultClientQueueSize = 32

type Client struct {
	Send chan []byte

	closeOnce sync.Once
}

func NewClient(queueSize int) *Client {
	if queueSize < 1 {
		queueSize = defaultClientQueueSize
	}

	return &Client{Send: make(chan []byte, queueSize)}
}

func (c *Client) close() {
	c.closeOnce.Do(func() {
		close(c.Send)
	})
}

type Hub struct {
	register   chan registerRequest
	unregister chan *Client
	broadcast  chan broadcastRequest
	deliver    chan deliveryRequest
	stop       chan struct{}
	done       chan struct{}
	closed     sync.Once
	count      atomic.Int64
	onOccupied func()
	onEmpty    func()
}

type registerRequest struct {
	client *Client
	result chan bool
}

type broadcastRequest struct {
	sender  *Client
	message []byte
}

type deliveryRequest struct {
	client  *Client
	message []byte
}

func NewHub(onOccupied, onEmpty func()) *Hub {
	hub := &Hub{
		register:   make(chan registerRequest),
		unregister: make(chan *Client),
		broadcast:  make(chan broadcastRequest),
		deliver:    make(chan deliveryRequest),
		stop:       make(chan struct{}),
		done:       make(chan struct{}),
		onOccupied: onOccupied,
		onEmpty:    onEmpty,
	}
	go hub.run()
	return hub
}

func (h *Hub) Register(client *Client) bool {
	if client == nil {
		return false
	}
	select {
	case <-h.stop:
		return false
	default:
	}

	request := registerRequest{client: client, result: make(chan bool, 1)}
	select {
	case h.register <- request:
	case <-h.done:
		return false
	}

	select {
	case registered := <-request.result:
		return registered
	case <-h.done:
		return false
	}
}

func (h *Hub) Unregister(client *Client) {
	if client == nil {
		return
	}
	select {
	case <-h.stop:
		return
	default:
	}
	select {
	case h.unregister <- client:
	case <-h.done:
	}
}

func (h *Hub) Broadcast(sender *Client, message []byte) {
	copy := append([]byte(nil), message...)
	select {
	case <-h.stop:
		return
	default:
	}
	select {
	case h.broadcast <- broadcastRequest{sender: sender, message: copy}:
	case <-h.done:
	}
}

func (h *Hub) Deliver(client *Client, message []byte) {
	copy := append([]byte(nil), message...)
	select {
	case <-h.stop:
		return
	default:
	}
	select {
	case h.deliver <- deliveryRequest{client: client, message: copy}:
	case <-h.done:
	}
}

func (h *Hub) Count() int {
	return int(h.count.Load())
}

func (h *Hub) Done() <-chan struct{} {
	return h.done
}

func (h *Hub) Close() {
	h.closed.Do(func() {
		close(h.stop)
	})
}

func (h *Hub) run() {
	clients := make(map[*Client]struct{})
	defer func() {
		for client := range clients {
			client.close()
		}
		h.count.Store(0)
		close(h.done)
	}()

	remove := func(client *Client) {
		if _, ok := clients[client]; !ok {
			return
		}
		delete(clients, client)
		client.close()
		h.count.Store(int64(len(clients)))
		if len(clients) == 0 && h.onEmpty != nil {
			h.onEmpty()
		}
	}

	for {
		select {
		case <-h.stop:
			return
		case request := <-h.register:
			select {
			case <-h.stop:
				return
			default:
			}
			if _, exists := clients[request.client]; exists {
				request.result <- false
				continue
			}
			wasEmpty := len(clients) == 0
			clients[request.client] = struct{}{}
			h.count.Store(int64(len(clients)))
			if wasEmpty && h.onOccupied != nil {
				h.onOccupied()
			}
			request.result <- true
		case client := <-h.unregister:
			remove(client)
		case event := <-h.broadcast:
			for client := range clients {
				if client == event.sender {
					continue
				}
				message := append([]byte(nil), event.message...)
				select {
				case client.Send <- message:
				default:
					remove(client)
				}
			}
		case event := <-h.deliver:
			if _, ok := clients[event.client]; ok {
				select {
				case event.client.Send <- event.message:
				default:
					remove(event.client)
				}
			}
		}
	}
}
