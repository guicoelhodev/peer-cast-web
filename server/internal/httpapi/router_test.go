package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/guicoelhodev/peerCastWeb/server/internal/room"
)

const allowedOrigin = "https://app.example"

func newTestServer(t *testing.T) (*room.Manager, *httptest.Server) {
	t.Helper()
	manager := room.NewManager(time.Hour, nil)
	server := httptest.NewServer(NewRouter(manager, RouterOptions{
		AllowedOrigins:    []string{allowedOrigin},
		RoomEmptyTTL:      5 * time.Minute,
		MaxWSMessageBytes: room.DefaultMaxPayloadBytes,
	}))
	t.Cleanup(server.Close)
	return manager, server
}

func TestHealthAndMethodHandling(t *testing.T) {
	_, server := newTestServer(t)
	response, err := http.Get(server.URL + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK || !strings.HasPrefix(response.Header.Get("Content-Type"), "application/json") {
		t.Fatalf("health response = %d, %q", response.StatusCode, response.Header.Get("Content-Type"))
	}
	var body map[string]string
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["status"] != "ok" {
		t.Fatalf("health body = %#v", body)
	}

	response, err = http.Post(server.URL+"/healthz", "application/json", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusMethodNotAllowed || response.Header.Get("Allow") != "GET, HEAD" {
		t.Fatalf("method response = %d, allow %q", response.StatusCode, response.Header.Get("Allow"))
	}
}

func TestCreateRoomJSONAndCORS(t *testing.T) {
	manager, server := newTestServer(t)
	request, err := http.NewRequest(http.MethodPost, server.URL+"/api/rooms", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Origin", allowedOrigin)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated || response.Header.Get("Access-Control-Allow-Origin") != allowedOrigin || !strings.HasPrefix(response.Header.Get("Content-Type"), "application/json") {
		t.Fatalf("create response = %d, headers = %#v", response.StatusCode, response.Header)
	}
	var created createRoomResponse
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	if created.RoomID == "" || created.WebSocketPath != "/ws/"+created.RoomID || created.ExpiresInSeconds != 300 {
		t.Fatalf("create body = %#v", created)
	}
	if _, ok := manager.Get(created.RoomID); !ok {
		t.Fatal("created room was not registered")
	}

	request, _ = http.NewRequest(http.MethodPost, server.URL+"/api/rooms", nil)
	request.Header.Set("Origin", "https://blocked.example")
	response, err = http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusForbidden || response.Header.Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("blocked CORS response = %d, headers = %#v", response.StatusCode, response.Header)
	}
}

func TestCORSPreflightAndMissingRoom(t *testing.T) {
	_, server := newTestServer(t)
	request, _ := http.NewRequest(http.MethodOptions, server.URL+"/api/rooms", nil)
	request.Header.Set("Origin", allowedOrigin)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusNoContent || response.Header.Get("Access-Control-Allow-Origin") != allowedOrigin {
		t.Fatalf("preflight response = %d, headers = %#v", response.StatusCode, response.Header)
	}

	response, err = http.Get(server.URL + "/ws/missing")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusNotFound {
		t.Fatalf("missing room response = %d", response.StatusCode)
	}
}

func TestWebSocketUpgradeAndBroadcast(t *testing.T) {
	manager, server := newTestServer(t)
	created, err := manager.Create()
	if err != nil {
		t.Fatal(err)
	}
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/" + created.ID
	dialOptions := &websocket.DialOptions{HTTPHeader: http.Header{"Origin": []string{allowedOrigin}}}
	first, response, err := websocket.Dial(context.Background(), wsURL, dialOptions)
	if err != nil {
		t.Fatalf("first upgrade: %v", err)
	}
	if response.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("upgrade status = %d", response.StatusCode)
	}
	defer first.Close(websocket.StatusNormalClosure, "")
	second, _, err := websocket.Dial(context.Background(), wsURL, dialOptions)
	if err != nil {
		t.Fatalf("second upgrade: %v", err)
	}
	defer second.Close(websocket.StatusNormalClosure, "")

	ready := []byte(`{"type":"ready","peerId":"123e4567-e89b-12d3-a456-426614174000"}`)
	if err := second.Write(context.Background(), websocket.MessageText, ready); err != nil {
		t.Fatal(err)
	}
	readCtx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_, received, err := first.Read(readCtx)
	if err != nil {
		t.Fatal(err)
	}
	if string(received) != string(ready) {
		t.Fatalf("broadcast = %s", received)
	}
}
