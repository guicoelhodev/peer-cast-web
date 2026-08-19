<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { createRoom } from "$lib/api/rooms";
  import { publicServerUrl } from "$lib/api/urls";
  import { limitChatHistory, type ChatMessage } from "$lib/components/chat";
  import { Lobby } from "$lib/components/lobby";
  import { RoomLayout } from "$lib/components/layout";
  import {
    createSignalingSession,
    type SignalingSession,
    type SignalingSessionState,
  } from "$lib/signaling/session.svelte";
  import type { SignalMessage, VideoState } from "$lib/types/signaling";
  import {
    createMediaSession,
    type LocalTracks,
    type MediaSession,
  } from "$lib/webrtc/media.svelte";
  import { createPeerManager } from "$lib/webrtc/peers.svelte";
  import type { PeerManager, Participant } from "$lib/webrtc/types";
  import {
    DEFAULT_QUALITY_PRESET_ID,
    QUALITY_PRESETS,
    type QualityPresetId,
  } from "$lib/webrtc/quality";

  const serverUrl = publicServerUrl;
  const qualityOptions = QUALITY_PRESETS.map((preset) => ({
    id: preset.id,
    label: `${preset.id} · ${preset.height}p ${preset.fps}fps`,
  }));
  let roomId: string | null = null;
  let displayName = "";
  let busy = false;
  let error = "";
  let status: SignalingSessionState = "idle";
  let peerId = "";
  let isHost = false;
  let session: SignalingSession | null = null;
  let peers: PeerManager | null = null;
  let media: MediaSession | null = null;
  let localStream: MediaStream | null = null;
  let participants: Participant[] = [];
  let messages: ChatMessage[] = [];
  let chatOpen = true;
  let unread = 0;
  let quality: QualityPresetId = DEFAULT_QUALITY_PRESET_ID;
  let microphoneMuted = false;
  let videoState: VideoState = "off";

  $: inviteUrl =
    roomId && typeof location !== "undefined"
      ? `${location.origin}/?room=${encodeURIComponent(roomId)}`
      : "";
  $: localParticipant = {
    id: peerId || "local",
    displayName: displayName || "You",
    stream: localStream,
    isHost,
    microphoneMuted,
    videoState,
    connected: status === "connected",
  };
  $: callParticipants = participants.map((participant) => ({
    ...participant,
    id: participant.peerId,
  }));
  $: if (chatOpen) unread = 0;

  onMount(() => {
    const requestedRoom = new URLSearchParams(location.search).get("room");
    roomId = requestedRoom || null;
    displayName = sessionStorage.getItem("peercast-display-name") ?? "";
  });

  onDestroy(cleanup);

  async function create(): Promise<void> {
    if (!validName()) return;
    busy = true;
    error = "";
    try {
      const room = await createRoom({ serverUrl });
      roomId = room.roomId;
      isHost = true;
      sessionStorage.setItem(hostKey(roomId), "1");
      updateRoomUrl(roomId);
      await enter();
    } catch (reason) {
      error =
        reason instanceof Error ? reason.message : "Could not create room";
    } finally {
      busy = false;
    }
  }

  async function join(): Promise<void> {
    if (!validName() || !roomId) return;
    isHost = sessionStorage.getItem(hostKey(roomId)) === "1";
    busy = true;
    error = "";
    try {
      await enter();
    } finally {
      busy = false;
    }
  }

  function validName(): boolean {
    displayName = displayName.trim();
    if (!displayName) {
      error = "Enter your name before continuing.";
      return false;
    }
    sessionStorage.setItem("peercast-display-name", displayName);
    return true;
  }

  async function enter(): Promise<void> {
    if (!roomId) return;
    cleanup();
    peerId = crypto.randomUUID();
    localStream = new MediaStream();
    media = createMediaSession();
    peers = createPeerManager({
      peerId,
      displayName,
      isHost,
      microphoneMuted,
      videoState,
      sendSignal: (message) => {
        session?.send(message);
      },
      onParticipantsChange: (next) => {
        participants = next;
      },
    });
    media.subscribeTracks((tracks) => {
      void applyTracks(tracks);
    });
    await media.startMicrophone();
    session = createSignalingSession({
      serverUrl,
      roomId,
      ready: { type: "ready", peerId, displayName, microphoneMuted },
      preflight,
      onStateChange: (next) => {
        status = next;
      },
      onReconnect: () => {
        void peers?.rebuild();
      },
      onError: () => {
        error = "Connection interrupted. Retrying…";
      },
      onMessage: (message) => {
        void handleMessage(message);
      },
    });
    status = "connecting";
    session.connect();
  }

  async function applyTracks(tracks: LocalTracks): Promise<void> {
    microphoneMuted = tracks.microphoneMuted;
    videoState = tracks.videoState;
    if (localStream) {
      for (const track of localStream.getTracks())
        localStream.removeTrack(track);
      for (const track of [
        tracks.videoTrack,
        tracks.microphoneTrack,
        tracks.screenAudioTrack,
      ])
        if (track) localStream.addTrack(track);
      localStream = localStream;
    }
    peers?.setLocalState({ microphoneMuted, videoState });
    await peers?.setLocalTracks(
      localStream?.getTracks() ?? [],
      localStream ?? undefined,
    );
    session?.send({ type: "microphone-state", peerId, microphoneMuted });
    session?.send({ type: "video-state", peerId, videoState });
    if (media?.error) error = media.error.message;
  }

  async function handleMessage(message: SignalMessage): Promise<void> {
    if (message.type === "chat-history") {
      messages = limitChatHistory(
        message.messages.map((item) => {
          const participant = participants.find(
            (participant) => participant.peerId === item.peerId,
          );
          return {
            id: item.messageId,
            peerId: item.peerId,
            text: item.text,
            sentAt: item.sentAt,
            isOwn: item.peerId === peerId,
            displayName: participant?.displayName,
          };
        }),
      );
      return;
    }
    if (message.type === "chat") {
      if (message.peerId === peerId) return;
      const participant = participants.find(
        (item) => item.peerId === message.peerId,
      );
      messages = limitChatHistory([
        ...messages,
        {
          id: message.messageId,
          peerId: message.peerId,
          text: message.text,
          sentAt: message.sentAt,
          isOwn: false,
          displayName: participant?.displayName,
        },
      ]);
      if (!chatOpen) unread++;
      return;
    }
    await peers?.handleSignal(message);
  }

  function sendChat(text: string): void {
    const id = crypto.randomUUID();
    const sentAt = new Date().toISOString();
    if (!session?.send({ type: "chat", peerId, messageId: id, text, sentAt }))
      return;
    messages = limitChatHistory([
      ...messages,
      { id, peerId, text, sentAt, isOwn: true, displayName },
    ]);
  }

  async function toggleMicrophone(): Promise<void> {
    if (!media) return;
    error = "";
    if (media.microphoneTrack) media.toggleMicrophoneMuted();
    else await media.startMicrophone();
  }
  async function toggleCamera(): Promise<void> {
    if (!media) return;
    error = "";
    if (media.videoState === "camera") await media.stopCamera();
    else await media.startCamera();
  }
  async function toggleScreen(): Promise<void> {
    if (!media) return;
    error = "";
    if (media.videoState === "screen") await media.stopScreenShare();
    else {
      await media.startScreenShare(quality);
      if (media.screenStream && !media.screenAudioTrack)
        error =
          "Screen sharing started without audio. Select a browser tab and enable Share tab audio.";
    }
  }
  async function changeQuality(value: string): Promise<void> {
    quality = value as QualityPresetId;
    await media?.applyQuality(quality);
  }

  async function copyInvite(): Promise<void> {
    try {
      await navigator.clipboard.writeText(inviteUrl);
    } catch {
      error = "Copy the invite link from the sidebar.";
    }
  }

  function leave(): void {
    cleanup();
    roomId = null;
    isHost = false;
    peerId = "";
    participants = [];
    messages = [];
    unread = 0;
    status = "idle";
    error = "";
    history.pushState({}, "", location.pathname);
  }

  function cleanup(): void {
    session?.dispose();
    session = null;
    peers?.cleanup();
    peers = null;
    media?.cleanup();
    media = null;
    localStream = null;
  }

  async function preflight(wsUrl: string): Promise<"ok" | "expired"> {
    const url = new URL(wsUrl);
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    try {
      return (await fetch(url, { method: "GET", mode: "cors" })).status === 404
        ? "expired"
        : "ok";
    } catch {
      return "ok";
    }
  }
  function updateRoomUrl(id: string): void {
    const url = new URL(location.href);
    url.search = "";
    url.searchParams.set("room", id);
    history.pushState({}, "", url);
  }
  function hostKey(id: string): string {
    return `peercast-host:${id}`;
  }
</script>

{#if roomId && !session}
  <Lobby
    {roomId}
    bind:name={displayName}
    {busy}
    {error}
    onCreate={create}
    onJoin={join}
  />
{:else if roomId}
  <RoomLayout
    {roomId}
    {inviteUrl}
    {status}
    participants={callParticipants}
    local={localParticipant}
    bind:chatOpen
    {unread}
    {messages}
    {microphoneMuted}
    {videoState}
    {quality}
    {qualityOptions}
    {error}
    onCopyInvite={copyInvite}
    onSendChat={sendChat}
    onToggleMicrophone={() => void toggleMicrophone()}
    onToggleCamera={() => void toggleCamera()}
    onToggleScreen={() => void toggleScreen()}
    onQualityChange={(value) => void changeQuality(value)}
    onLeave={leave}
  />
{:else}
  <Lobby
    bind:name={displayName}
    {busy}
    {error}
    onCreate={create}
    onJoin={join}
  />
{/if}
