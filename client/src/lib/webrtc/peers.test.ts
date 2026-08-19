import { describe, expect, it } from "vitest";
import { createPeerManager } from "./peers.svelte";

const localId = "123e4567-e89b-12d3-a456-426614174000";
const remoteId = "123e4567-e89b-12d3-a456-426614174001";

class MockStream {
  tracks: MediaStreamTrack[] = [];
  addTrack(track: MediaStreamTrack) {
    this.tracks.push(track);
  }
  removeTrack(track: MediaStreamTrack) {
    this.tracks = this.tracks.filter((item) => item !== track);
  }
  getTracks() {
    return this.tracks;
  }
}

class MockConnection {
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  signalingState: RTCSignalingState = "stable";
  connectionState: RTCPeerConnectionState = "new";
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  senders: RTCRtpSender[] = [];
  ice: RTCIceCandidateInit[] = [];
  closed = false;
  async createOffer() {
    return { type: "offer" as RTCSdpType, sdp: "offer" };
  }
  async createAnswer() {
    return { type: "answer" as RTCSdpType, sdp: "answer" };
  }
  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description;
  }
  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
  }
  async addIceCandidate(candidate: RTCIceCandidateInit) {
    this.ice.push(candidate);
  }
  addTrack(track: MediaStreamTrack) {
    const sender: {
      track: MediaStreamTrack | null;
      replaceTrack: (next: MediaStreamTrack | null) => Promise<void>;
    } = {
      track,
      replaceTrack: async (next) => {
        sender.track = next;
      },
    };
    this.senders.push(sender as RTCRtpSender);
    return sender as RTCRtpSender;
  }
  removeTrack(sender: RTCRtpSender) {
    this.senders = this.senders.filter((item) => item !== sender);
  }
  getSenders() {
    return this.senders;
  }
  close() {
    this.closed = true;
    this.connectionState = "closed";
  }
}

function setup() {
  const sent: SignalMessage[] = [];
  const connections: MockConnection[] = [];
  const manager = createPeerManager({
    peerId: localId,
    displayName: "Local",
    isHost: true,
    microphoneMuted: false,
    videoState: "camera",
    sendSignal: (message) => sent.push(message),
    createPeerConnection: () => {
      const connection = new MockConnection();
      connections.push(connection);
      return connection as unknown as RTCPeerConnection;
    },
    createMediaStream: () => new MockStream() as unknown as MediaStream,
  });
  return { manager, sent, connections };
}

type SignalMessage = import("../types/signaling").SignalMessage;

describe("peer manager", () => {
  it("creates directed offers after local media is available and answers offers", async () => {
    const { manager, sent, connections } = setup();
    await manager.handleSignal({
      type: "ready",
      peerId: remoteId,
      displayName: "Remote",
    });
    expect(sent).toEqual([]);
    await manager.addLocalTrack({
      id: "camera",
      kind: "video",
    } as MediaStreamTrack);
    expect(sent).toMatchObject([{ type: "offer", targetPeerId: remoteId }]);
    await manager.handleSignal({
      type: "answer",
      peerId: remoteId,
      targetPeerId: localId,
      description: { type: "answer", sdp: "answer" },
    });
    expect(connections[0].remoteDescription).toMatchObject({ type: "answer" });
    const receiver = setup();
    await receiver.manager.handleSignal({
      type: "offer",
      peerId: "023e4567-e89b-12d3-a456-426614174001",
      targetPeerId: localId,
      isHost: true,
      displayName: "Host",
      description: { type: "offer", sdp: "offer" },
    });
    expect(receiver.sent).toMatchObject([
      { type: "answer", targetPeerId: "023e4567-e89b-12d3-a456-426614174001" },
    ]);
  });

  it("filters directed ICE and queues it until the remote description exists", async () => {
    const { manager, connections } = setup();
    const initiatorId = "023e4567-e89b-12d3-a456-426614174001";
    await manager.handleSignal({
      type: "ice",
      peerId: initiatorId,
      targetPeerId: localId,
      candidate: { candidate: "candidate:1" },
    });
    expect(connections[0].ice).toEqual([]);
    await manager.handleSignal({
      type: "offer",
      peerId: initiatorId,
      targetPeerId: localId,
      description: { type: "offer", sdp: "offer" },
    });
    expect(connections[0].ice).toEqual([{ candidate: "candidate:1" }]);
    await manager.handleSignal({
      type: "ice",
      peerId: initiatorId,
      targetPeerId: initiatorId,
      candidate: { candidate: "ignored" },
    });
    expect(connections[0].ice).toHaveLength(1);
  });

  it("adds, replaces, removes tracks and cleans up departed peers", async () => {
    const { manager, sent, connections } = setup();
    await manager.addParticipant(remoteId);
    const camera = { id: "camera", kind: "video" } as MediaStreamTrack;
    const screen = { id: "screen", kind: "video" } as MediaStreamTrack;
    await manager.addLocalTrack(camera);
    expect(connections[0].getSenders()[0].track).toBe(camera);
    await manager.replaceLocalTrack("video", screen);
    expect(connections[0].getSenders()[0].track).toBe(screen);
    await manager.removeLocalTracks("video");
    expect(connections[0].getSenders()).toEqual([]);
    expect(sent.filter((message) => message.type === "offer")).toHaveLength(2);
    manager.removeParticipant(remoteId);
    expect(connections[0].closed).toBe(true);
    manager.cleanup();
  });

  it("serializes concurrent local track negotiations", async () => {
    const { manager, sent, connections } = setup();
    await manager.addParticipant(remoteId);
    let releaseOffer: () => void;
    const offerReady = new Promise<void>((resolve) => {
      releaseOffer = resolve;
    });
    let offerCalls = 0;
    connections[0].createOffer = async () => {
      offerCalls++;
      await offerReady;
      return { type: "offer", sdp: "offer" };
    };

    const first = manager.addLocalTrack({
      id: "camera",
      kind: "video",
    } as MediaStreamTrack);
    await Promise.resolve();
    const second = manager.addLocalTrack({
      id: "microphone",
      kind: "audio",
    } as MediaStreamTrack);
    expect(offerCalls).toBe(1);

    releaseOffer!();
    await Promise.all([first, second]);
    await manager.handleSignal({
      type: "answer",
      peerId: remoteId,
      targetPeerId: localId,
      description: { type: "answer", sdp: "answer" },
    });
    expect(offerCalls).toBe(2);
    expect(sent.filter((message) => message.type === "offer")).toHaveLength(2);
  });
});
