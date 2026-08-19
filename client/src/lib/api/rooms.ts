import { buildApiUrl } from "./urls";

export type CreateRoomResponse = {
  roomId: string;
  websocketPath: string;
  expiresInSeconds: number;
};

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class CreateRoomError extends Error {
  constructor(
    public readonly kind: "network" | "http" | "response",
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "CreateRoomError";
  }
}

export async function createRoom(
  options: { serverUrl?: string; fetch?: FetchLike } = {},
): Promise<CreateRoomResponse> {
  const fetcher = options.fetch ?? globalThis.fetch;
  if (!fetcher) throw new CreateRoomError("network", "Fetch is unavailable");

  let response: Response;
  try {
    response = await fetcher(buildApiUrl("api/rooms", options.serverUrl), {
      method: "POST",
    });
  } catch {
    throw new CreateRoomError("network", "Could not create room");
  }
  if (!response.ok)
    throw new CreateRoomError("http", "Could not create room", response.status);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new CreateRoomError(
      "response",
      "Invalid create room response",
      response.status,
    );
  }
  if (!isCreateRoomResponse(body)) {
    throw new CreateRoomError(
      "response",
      "Invalid create room response",
      response.status,
    );
  }
  return body;
}

function isCreateRoomResponse(value: unknown): value is CreateRoomResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const response = value as Record<string, unknown>;
  return (
    Object.keys(response).length === 3 &&
    typeof response.roomId === "string" &&
    /^[\da-f]{32}$/i.test(response.roomId) &&
    response.websocketPath === `/ws/${response.roomId}` &&
    typeof response.expiresInSeconds === "number" &&
    Number.isInteger(response.expiresInSeconds) &&
    response.expiresInSeconds > 0
  );
}
