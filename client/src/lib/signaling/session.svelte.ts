import { buildWebSocketUrl } from "../api/urls";
import { SvelteMap } from "svelte/reactivity";
import type { ReadySignal, SignalMessage } from "../types/signaling";
import { parseSignalMessage, serializeSignalMessage } from "./protocol";

export type SignalingSessionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "expired"
  | "closed"
  | "error";

export type SessionFailure = "expired" | "temporary";

export type SignalingSocket = {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
};

export type SignalingSessionOptions = {
  url?: string | URL;
  serverUrl?: string;
  roomId?: string;
  ready: ReadySignal;
  webSocket?: (url: string) => SignalingSocket;
  setTimeout?: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof setTimeout>;
  clearTimeout?: (timer: ReturnType<typeof setTimeout>) => void;
  preflight?: (url: string) => Promise<"ok" | "expired">;
  classifyClose?: (event: CloseEvent) => SessionFailure;
  classifyError?: (event: Event) => SessionFailure;
  onMessage?: (message: SignalMessage) => void;
  onStateChange?: (state: SignalingSessionState) => void;
  onReconnect?: () => void;
  onError?: (error: unknown) => void;
};

const OPEN = 1;
const INITIAL_RETRY_DELAY = 1_000;
const MAX_RETRY_DELAY = 10_000;

export class SignalingSession {
  private readonly url: string;
  private readonly createSocket: (url: string) => SignalingSocket;
  private readonly setTimer: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof setTimeout>;
  private readonly clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
  private socket: SignalingSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private active = false;
  private disposed = false;
  private hasConnected = false;
  private generation = 0;
  private readonly values = new SvelteMap<string, SignalingSessionState>();

  constructor(private readonly options: SignalingSessionOptions) {
    this.url = resolveUrl(options);
    this.createSocket = options.webSocket ?? ((url) => new WebSocket(url));
    this.setTimer =
      options.setTimeout ?? ((callback, delay) => setTimeout(callback, delay));
    this.clearTimer = options.clearTimeout ?? ((timer) => clearTimeout(timer));
    this.values.set("state", "idle");
  }

  get state(): SignalingSessionState {
    return this.values.get("state") ?? "idle";
  }

  connect(): void {
    if (this.disposed || this.active) return;
    this.active = true;
    this.retryCount = 0;
    this.open(false);
  }

  send(message: SignalMessage): boolean {
    if (this.state !== "connected" || this.socket?.readyState !== OPEN)
      return false;
    try {
      this.socket.send(serializeSignalMessage(message));
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    }
  }

  leave(): void {
    this.stop("closed");
  }

  dispose(): void {
    this.disposed = true;
    this.stop("closed");
  }

  private async open(reconnecting: boolean): Promise<void> {
    if (!this.active || this.disposed) return;
    this.setState(reconnecting ? "reconnecting" : "connecting");
    const generation = ++this.generation;

    try {
      if (
        this.options.preflight &&
        (await this.options.preflight(this.url)) === "expired"
      ) {
        if (this.isCurrent(generation)) this.stop("expired");
        return;
      }
      if (!this.isCurrent(generation)) return;
      const socket = this.createSocket(this.url);
      this.socket = socket;
      socket.onopen = () => this.onOpen(socket, generation);
      socket.onmessage = (event) => this.onMessage(socket, event);
      socket.onclose = (event) => this.onClose(socket, event);
      socket.onerror = (event) => this.onError(socket, event);
    } catch (error) {
      if (this.isCurrent(generation)) this.failAndRetry(error);
    }
  }

  private onOpen(socket: SignalingSocket, generation: number): void {
    if (!this.isCurrent(generation) || this.socket !== socket) return;
    this.retryCount = 0;
    this.setState("connected");
    if (!this.send(this.options.ready)) return;
    this.send({
      type: "chat-history-request",
      peerId: this.options.ready.peerId,
    });
    if (this.hasConnected) this.options.onReconnect?.();
    this.hasConnected = true;
  }

  private onMessage(socket: SignalingSocket, event: MessageEvent): void {
    if (this.socket !== socket || typeof event.data !== "string") return;
    const message = parseSignalMessage(event.data);
    if (message) this.options.onMessage?.(message);
  }

  private onClose(socket: SignalingSocket, event: CloseEvent): void {
    if (this.socket !== socket) return;
    this.socket = null;
    if (!this.active || this.disposed) return;
    if (
      (this.options.classifyClose ?? defaultCloseFailure)(event) === "expired"
    ) {
      this.stop("expired");
      return;
    }
    this.retry();
  }

  private onError(socket: SignalingSocket, event: Event): void {
    if (this.socket !== socket || !this.active) return;
    if (
      (this.options.classifyError ?? defaultErrorFailure)(event) === "expired"
    )
      this.stop("expired");
  }

  private failAndRetry(error: unknown): void {
    this.fail(error);
    if (this.active && !this.disposed) this.retry();
  }

  private fail(error: unknown): void {
    this.options.onError?.(error);
    this.setState("error");
  }

  private retry(): void {
    if (!this.active || this.retryTimer) return;
    const delay = Math.min(
      INITIAL_RETRY_DELAY * 2 ** this.retryCount++,
      MAX_RETRY_DELAY,
    );
    this.setState("reconnecting");
    this.retryTimer = this.setTimer(() => {
      this.retryTimer = null;
      void this.open(true);
    }, delay);
  }

  private stop(
    state: Extract<SignalingSessionState, "expired" | "closed">,
  ): void {
    this.active = false;
    this.generation++;
    if (this.retryTimer) this.clearTimer(this.retryTimer);
    this.retryTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      socket.close();
    }
    this.setState(state);
  }

  private isCurrent(generation: number): boolean {
    return this.active && !this.disposed && this.generation === generation;
  }

  private setState(state: SignalingSessionState): void {
    this.values.set("state", state);
    this.options.onStateChange?.(state);
  }
}

export function createSignalingSession(
  options: SignalingSessionOptions,
): SignalingSession {
  return new SignalingSession(options);
}

function resolveUrl(options: SignalingSessionOptions): string {
  if (options.url) return new URL(options.url).href;
  if (options.serverUrl && options.roomId)
    return buildWebSocketUrl(options.roomId, options.serverUrl).href;
  throw new TypeError("Provide a WebSocket URL or both serverUrl and roomId");
}

function defaultCloseFailure(event: CloseEvent): SessionFailure {
  return event.code === 4004 ||
    event.code === 4404 ||
    /\b404\b|expired/i.test(event.reason)
    ? "expired"
    : "temporary";
}

function defaultErrorFailure(event: Event): SessionFailure {
  const status = (event as Event & { status?: unknown }).status;
  return status === 404 ? "expired" : "temporary";
}
