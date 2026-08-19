import type { OfferSignal, SignalMessage } from "../types/signaling";
import type {
  LocalPeerState,
  Participant,
  PeerManager,
  PeerManagerOptions,
} from "./types";

type Peer = {
  pc: RTCPeerConnection;
  participant: Participant;
  pendingCandidates: RTCIceCandidateInit[];
  needsNegotiation: boolean;
  makingOffer: boolean;
  offerTask: Promise<void> | null;
};

const defaultStream = () => new MediaStream();

export function createPeerManager(options: PeerManagerOptions): PeerManager {
  const peers = new Map<string, Peer>();
  const localTracks = new Map<
    string,
    { track: MediaStreamTrack; stream: MediaStream }
  >();
  let localState: LocalPeerState = {
    displayName: options.displayName,
    isHost: options.isHost,
    microphoneMuted: options.microphoneMuted,
    videoState: options.videoState,
  };
  let disposed = false;

  const createConnection =
    options.createPeerConnection ??
    ((configuration?: RTCConfiguration) =>
      new RTCPeerConnection(configuration));
  const createStream = options.createMediaStream ?? defaultStream;

  function publish() {
    options.onParticipantsChange?.(
      [...peers.values()].map((peer) => peer.participant),
    );
  }

  function metadata(
    peer: Peer,
    signal: Partial<
      Pick<
        OfferSignal,
        "displayName" | "isHost" | "microphoneMuted" | "videoState"
      >
    >,
  ) {
    peer.participant.displayName =
      signal.displayName ?? peer.participant.displayName;
    peer.participant.isHost = signal.isHost ?? peer.participant.isHost;
    peer.participant.microphoneMuted =
      signal.microphoneMuted ?? peer.participant.microphoneMuted;
    peer.participant.videoState =
      signal.videoState ?? peer.participant.videoState;
  }

  function ensurePeer(
    peerId: string,
    participant: Partial<
      Omit<Participant, "peerId" | "stream" | "audioStream" | "connected">
    > = {},
  ) {
    let peer = peers.get(peerId);
    if (peer) {
      Object.assign(peer.participant, participant);
      publish();
      return peer;
    }
    const pc = createConnection(options.configuration);
    peer = {
      pc,
      pendingCandidates: [],
      needsNegotiation: false,
      makingOffer: false,
      offerTask: null,
      participant: {
        peerId,
        displayName: participant.displayName ?? "Participant",
        isHost: participant.isHost ?? false,
        microphoneMuted: participant.microphoneMuted ?? false,
        videoState: participant.videoState ?? "off",
        connected: false,
        stream: createStream(),
        audioStream: createStream(),
      },
    };
    pc.onicecandidate = ({ candidate }) => {
      if (!disposed && candidate)
        options.sendSignal({
          type: "ice",
          peerId: options.peerId,
          targetPeerId: peerId,
          candidate: candidate.toJSON(),
        });
    };
    pc.onconnectionstatechange = () => {
      if (!peers.has(peerId)) return;
      peer.participant.connected = pc.connectionState === "connected";
      if (pc.connectionState === "failed" || pc.connectionState === "closed")
        removeParticipant(peerId);
      else publish();
    };
    pc.ontrack = ({ track }) => {
      const stream =
        track.kind === "audio"
          ? peer.participant.audioStream
          : peer.participant.stream;
      if (!stream.getTracks().includes(track)) stream.addTrack(track);
      if (track.kind === "video" && peer.participant.videoState === "off")
        peer.participant.videoState = "camera";
      track.onended = () => {
        stream.removeTrack(track);
        publish();
      };
      publish();
    };
    peers.set(peerId, peer);
    addTracks(peer);
    publish();
    return peer;
  }

  function addTracks(peer: Peer) {
    let changed = false;
    for (const { track, stream } of localTracks.values()) {
      if (!peer.pc.getSenders().some((sender) => sender.track === track)) {
        peer.pc.addTrack(track, stream);
        changed = true;
      }
    }
    return changed;
  }

  async function sendOffer(peer: Peer) {
    if (disposed) return;
    peer.needsNegotiation = true;
    if (peer.makingOffer || peer.pc.signalingState !== "stable") return;
    peer.needsNegotiation = false;
    peer.makingOffer = true;
    const task = (async () => {
      try {
        const description = await peer.pc.createOffer();
        await peer.pc.setLocalDescription(description);
        options.sendSignal({
          type: "offer",
          peerId: options.peerId,
          targetPeerId: peer.participant.peerId,
          ...localState,
          description,
        });
      } finally {
        peer.makingOffer = false;
      }
    })();
    peer.offerTask = task;
    try {
      await task;
    } finally {
      if (peer.offerTask === task) peer.offerTask = null;
    }
  }

  async function flushCandidates(peer: Peer) {
    const candidates = peer.pendingCandidates.splice(0);
    for (const candidate of candidates)
      await peer.pc.addIceCandidate(candidate);
  }

  async function addParticipant(peerId: string, participant = {}) {
    if (disposed || peerId === options.peerId) return;
    const peer = ensurePeer(peerId, participant);
    if (localTracks.size > 0) await sendOffer(peer);
  }

  function removeParticipant(peerId: string) {
    const peer = peers.get(peerId);
    if (!peer) return;
    peers.delete(peerId);
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    publish();
  }

  async function handleSignal(message: SignalMessage) {
    if (disposed || message.peerId === options.peerId) return;
    if ("targetPeerId" in message && message.targetPeerId !== options.peerId)
      return;
    if (message.type === "participant-left")
      return removeParticipant(message.peerId);
    if (message.type === "ready")
      return addParticipant(message.peerId, message);
    if (message.type === "microphone-state") {
      const peer = peers.get(message.peerId);
      if (peer) {
        peer.participant.microphoneMuted = message.microphoneMuted;
        publish();
      }
      return;
    }
    if (message.type === "video-state") {
      const peer = peers.get(message.peerId);
      if (peer) {
        peer.participant.videoState = message.videoState;
        publish();
      }
      return;
    }
    if (message.type === "ice") {
      const peer = ensurePeer(message.peerId);
      if (peer.pc.remoteDescription)
        await peer.pc.addIceCandidate(message.candidate);
      else peer.pendingCandidates.push(message.candidate);
      return;
    }
    if (message.type === "offer") {
      const peer = ensurePeer(message.peerId);
      const polite = options.peerId.localeCompare(message.peerId) > 0;
      if (peer.makingOffer && !polite) return;
      if (peer.makingOffer) await peer.offerTask;
      if (peer.pc.signalingState !== "stable") {
        if (!polite) return;
        await peer.pc.setLocalDescription({ type: "rollback" });
      }
      metadata(peer, message);
      await peer.pc.setRemoteDescription(message.description);
      await flushCandidates(peer);
      const description = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(description);
      options.sendSignal({
        type: "answer",
        peerId: options.peerId,
        targetPeerId: message.peerId,
        ...localState,
        description,
      });
      if (peer.needsNegotiation) await sendOffer(peer);
      publish();
      return;
    }
    if (message.type === "answer") {
      const peer = peers.get(message.peerId);
      if (!peer) return;
      metadata(peer, message);
      await peer.pc.setRemoteDescription(message.description);
      await flushCandidates(peer);
      if (peer.needsNegotiation) await sendOffer(peer);
      publish();
    }
  }

  async function setLocalTracks(
    tracks: MediaStreamTrack[],
    stream?: MediaStream,
  ) {
    const fallbackStream = stream ?? createStream();
    localTracks.clear();
    for (const track of tracks) {
      let trackStream = fallbackStream;
      if (track.kind === "audio") {
        trackStream = createStream();
        trackStream.addTrack(track);
      }
      localTracks.set(track.id, { track, stream: trackStream });
    }
    for (const peer of peers.values()) {
      let changed = false;
      for (const sender of peer.pc.getSenders()) {
        if (sender.track && !localTracks.has(sender.track.id)) {
          peer.pc.removeTrack(sender);
          changed = true;
        }
      }
      changed = addTracks(peer) || changed;
      if (changed) await sendOffer(peer);
    }
  }

  async function addLocalTrack(
    track: MediaStreamTrack,
    stream = createStream(),
  ) {
    localTracks.set(track.id, { track, stream });
    for (const peer of peers.values())
      if (addTracks(peer)) await sendOffer(peer);
  }

  async function replaceLocalTrack(
    kind: MediaStreamTrack["kind"],
    track: MediaStreamTrack,
    stream = createStream(),
  ) {
    for (const [id, item] of localTracks)
      if (item.track.kind === kind) localTracks.delete(id);
    localTracks.set(track.id, { track, stream });
    for (const peer of peers.values()) {
      const sender = peer.pc
        .getSenders()
        .find((item) => item.track?.kind === kind);
      if (sender) await sender.replaceTrack(track);
      else {
        peer.pc.addTrack(track, stream);
        await sendOffer(peer);
      }
    }
  }

  async function removeLocalTracks(kind?: MediaStreamTrack["kind"]) {
    for (const [id, item] of localTracks)
      if (!kind || item.track.kind === kind) localTracks.delete(id);
    for (const peer of peers.values()) {
      let changed = false;
      for (const sender of peer.pc.getSenders())
        if (sender.track && (!kind || sender.track.kind === kind)) {
          peer.pc.removeTrack(sender);
          changed = true;
        }
      if (changed) await sendOffer(peer);
    }
  }

  return {
    get participants() {
      return [...peers.values()].map((peer) => peer.participant);
    },
    handleSignal,
    addParticipant,
    removeParticipant,
    setLocalState: (state) => {
      localState = { ...localState, ...state };
    },
    setLocalTracks,
    addLocalTrack,
    replaceLocalTrack,
    removeLocalTracks,
    renegotiate: async (peerId) => {
      if (peerId) {
        const peer = peers.get(peerId);
        if (peer) await sendOffer(peer);
      } else for (const peer of peers.values()) await sendOffer(peer);
    },
    rebuild: async () => {
      const participants = [...peers.values()].map((peer) => ({
        ...peer.participant,
      }));
      for (const peer of [...peers.keys()]) removeParticipant(peer);
      for (const participant of participants)
        await addParticipant(participant.peerId, participant);
    },
    cleanup: () => {
      disposed = true;
      for (const peerId of [...peers.keys()]) removeParticipant(peerId);
      localTracks.clear();
    },
  };
}
