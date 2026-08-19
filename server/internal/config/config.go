package config

import (
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	defaultPort              = 8080
	defaultAllowedOrigins    = "http://localhost:5173"
	defaultRoomEmptyTTL      = 5 * time.Minute
	defaultMaxWSMessageBytes = int64(65536)
)

type Config struct {
	Port              int
	AllowedOrigins    []string
	RoomEmptyTTL      time.Duration
	MaxWSMessageBytes int64
	LogLevel          slog.Level
}

func Load() (Config, error) {
	port, err := parsePort(value("PORT", strconv.Itoa(defaultPort)))
	if err != nil {
		return Config{}, err
	}

	allowedOrigins, err := parseAllowedOrigins(value("ALLOWED_ORIGINS", defaultAllowedOrigins))
	if err != nil {
		return Config{}, err
	}

	roomEmptyTTL, err := time.ParseDuration(value("ROOM_EMPTY_TTL", defaultRoomEmptyTTL.String()))
	if err != nil || roomEmptyTTL <= 0 {
		if err != nil {
			return Config{}, fmt.Errorf("invalid ROOM_EMPTY_TTL: must be a positive duration: %w", err)
		}
		return Config{}, fmt.Errorf("invalid ROOM_EMPTY_TTL: must be a positive duration")
	}

	maxWSMessageBytes, err := strconv.ParseInt(value("MAX_WS_MESSAGE_BYTES", strconv.FormatInt(defaultMaxWSMessageBytes, 10)), 10, 64)
	if err != nil || maxWSMessageBytes <= 0 {
		if err != nil {
			return Config{}, fmt.Errorf("invalid MAX_WS_MESSAGE_BYTES: must be a positive integer: %w", err)
		}
		return Config{}, fmt.Errorf("invalid MAX_WS_MESSAGE_BYTES: must be a positive integer")
	}

	logLevel, err := parseLogLevel(value("LOG_LEVEL", "info"))
	if err != nil {
		return Config{}, err
	}

	return Config{
		Port:              port,
		AllowedOrigins:    allowedOrigins,
		RoomEmptyTTL:      roomEmptyTTL,
		MaxWSMessageBytes: maxWSMessageBytes,
		LogLevel:          logLevel,
	}, nil
}

func value(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok && strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value)
	}
	return fallback
}

func parsePort(value string) (int, error) {
	port, err := strconv.Atoi(value)
	if err != nil || port < 1 || port > 65535 {
		if err != nil {
			return 0, fmt.Errorf("invalid PORT: must be an integer between 1 and 65535: %w", err)
		}
		return 0, fmt.Errorf("invalid PORT: must be between 1 and 65535")
	}
	return port, nil
}

func parseAllowedOrigins(value string) ([]string, error) {
	origins := strings.Split(value, ",")
	for index, origin := range origins {
		origin = strings.TrimSpace(origin)
		parsed, err := url.ParseRequestURI(origin)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" || parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
			return nil, fmt.Errorf("invalid ALLOWED_ORIGINS entry %q: must be an http or https origin", origin)
		}
		if parsed.Scheme != "http" && parsed.Scheme != "https" {
			return nil, fmt.Errorf("invalid ALLOWED_ORIGINS entry %q: must use http or https", origin)
		}
		origins[index] = origin
	}
	return origins, nil
}

func parseLogLevel(value string) (slog.Level, error) {
	switch strings.ToLower(value) {
	case "debug":
		return slog.LevelDebug, nil
	case "info":
		return slog.LevelInfo, nil
	case "warn", "warning":
		return slog.LevelWarn, nil
	case "error":
		return slog.LevelError, nil
	default:
		return 0, fmt.Errorf("invalid LOG_LEVEL %q: must be debug, info, warn, or error", value)
	}
}
