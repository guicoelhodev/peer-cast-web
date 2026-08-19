package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/coder/websocket"
	"github.com/guicoelhodev/peerCastWeb/server/internal/room"
)

type RouterOptions struct {
	AllowedOrigins    []string
	RoomEmptyTTL      time.Duration
	MaxWSMessageBytes int64
}

type createRoomResponse struct {
	RoomID           string `json:"roomId"`
	WebSocketPath    string `json:"websocketPath"`
	ExpiresInSeconds int64  `json:"expiresInSeconds"`
}

func NewRouter(manager *room.Manager, options RouterOptions) http.Handler {
	allowedOrigins := make(map[string]struct{}, len(options.AllowedOrigins))
	for _, origin := range options.AllowedOrigins {
		allowedOrigins[origin] = struct{}{}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/rooms", func(writer http.ResponseWriter, request *http.Request) {
		created, err := manager.Create()
		if err != nil {
			writeJSONError(writer, http.StatusInternalServerError, "could not create room")
			return
		}
		writeJSON(writer, http.StatusCreated, createRoomResponse{
			RoomID:           created.ID,
			WebSocketPath:    "/ws/" + created.ID,
			ExpiresInSeconds: int64(options.RoomEmptyTTL / time.Second),
		})
	})
	mux.HandleFunc("GET /healthz", func(writer http.ResponseWriter, _ *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /ws/", func(writer http.ResponseWriter, request *http.Request) {
		roomID := strings.TrimPrefix(request.URL.Path, "/ws/")
		if roomID == "" || strings.Contains(roomID, "/") {
			writeJSONError(writer, http.StatusNotFound, "room not found")
			return
		}
		existingRoom, ok := manager.Get(roomID)
		if !ok {
			writeJSONError(writer, http.StatusNotFound, "room not found")
			return
		}
		if !originAllowed(request.Header.Get("Origin"), allowedOrigins) {
			writeJSONError(writer, http.StatusForbidden, "origin is not allowed")
			return
		}

		conn, err := websocket.Accept(writer, request, &websocket.AcceptOptions{
			CompressionMode:    websocket.CompressionDisabled,
			InsecureSkipVerify: true,
		})
		if err != nil {
			return
		}
		client := room.NewWebSocketClient(websocketConnection{conn}, existingRoom.Hub, existingRoom.Registry, room.ClientOptions{
			MaxPayloadBytes: int(options.MaxWSMessageBytes),
		}, existingRoom.History)
		if !client.Start() {
			_ = conn.Close(websocket.StatusInternalError, "could not register client")
			return
		}
		<-client.Done()
	})

	return cors(allowedOrigins, mux)
}

func cors(allowedOrigins map[string]struct{}, next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		origin := request.Header.Get("Origin")
		if origin != "" && !originAllowed(origin, allowedOrigins) {
			writeJSONError(writer, http.StatusForbidden, "origin is not allowed")
			return
		}
		if origin != "" {
			writer.Header().Set("Access-Control-Allow-Origin", origin)
			writer.Header().Set("Vary", "Origin")
		}
		if request.Method == http.MethodOptions {
			writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			writer.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(writer, request)
	})
}

func originAllowed(origin string, allowedOrigins map[string]struct{}) bool {
	_, ok := allowedOrigins[origin]
	return origin != "" && ok
}

func writeJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(value)
}

func writeJSONError(writer http.ResponseWriter, status int, message string) {
	writeJSON(writer, status, map[string]string{"error": message})
}

type websocketConnection struct {
	conn *websocket.Conn
}

func (c websocketConnection) Read(ctx context.Context) ([]byte, error) {
	_, payload, err := c.conn.Read(ctx)
	return payload, err
}

func (c websocketConnection) Write(ctx context.Context, payload []byte) error {
	return c.conn.Write(ctx, websocket.MessageText, payload)
}

func (c websocketConnection) Ping(ctx context.Context) error { return c.conn.Ping(ctx) }

func (c websocketConnection) Close() error {
	return c.conn.Close(websocket.StatusNormalClosure, "")
}

func (c websocketConnection) SetReadLimit(limit int64) { c.conn.SetReadLimit(limit) }
