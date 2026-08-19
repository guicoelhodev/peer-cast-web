const publicServerUrl = import.meta.env.PUBLIC_SERVER_URL;

export function buildApiUrl(path: string, serverUrl = publicServerUrl): URL {
  return buildServerUrl(path, serverUrl, false);
}

export function buildWebSocketUrl(
  roomId: string,
  serverUrl = publicServerUrl,
): URL {
  return buildServerUrl(`ws/${encodeURIComponent(roomId)}`, serverUrl, true);
}

function buildServerUrl(
  path: string,
  serverUrl: string,
  websocket: boolean,
): URL {
  let base: URL;
  try {
    base = new URL(serverUrl);
  } catch {
    throw new TypeError("PUBLIC_SERVER_URL must be an absolute HTTP(S) URL");
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new TypeError("PUBLIC_SERVER_URL must use HTTP or HTTPS");
  }

  base.pathname = `${base.pathname.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  base.search = "";
  base.hash = "";
  if (websocket) base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  return base;
}
