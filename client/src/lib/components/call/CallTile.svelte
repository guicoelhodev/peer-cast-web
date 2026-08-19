<script lang="ts">
  import Icon from "@iconify/svelte";
  import CallAudioTrack from "./CallAudioTrack.svelte";
  import CallAvatar from "./CallAvatar.svelte";
  import type { CallParticipant } from "./types";
  let {
    participant,
    local = false,
    focused = false,
    onFocus,
    onVolumeChange,
    onMuteChange,
  }: {
    participant: CallParticipant;
    local?: boolean;
    focused?: boolean;
    onFocus?: () => void;
    onVolumeChange?: (volume: number) => void;
    onMuteChange?: (muted: boolean) => void;
  } = $props();
  let media: HTMLVideoElement;
  let tile: HTMLElement;
  let fullscreenAvailable = $state(false);
  let videoAvailable = $state(false);
  let audioTracks = $state<MediaStreamTrack[]>([]);
  let isSpeaking = $state(false);
  let volume = $state(1);
  let remoteMuted = $state(false);
  $effect(() => {
    volume = Math.max(0, Math.min(1, participant.volume ?? 1));
    remoteMuted = Boolean(participant.muted);
  });
  $effect(() => {
    fullscreenAvailable =
      typeof document !== "undefined" &&
      typeof (tile as unknown as { requestFullscreen?: unknown } | undefined)
        ?.requestFullscreen === "function" &&
      typeof (document as unknown as { exitFullscreen?: unknown })
        .exitFullscreen === "function";
  });
  $effect(() => {
    const stream = participant.stream;
    let tracks: MediaStreamTrack[] = [];
    const removeTrackListeners = (track: MediaStreamTrack) => {
      if (typeof track.removeEventListener !== "function") return;
      track.removeEventListener("mute", update);
      track.removeEventListener("unmute", update);
      track.removeEventListener("ended", update);
    };
    const update = () => {
      for (const track of tracks) removeTrackListeners(track);
      tracks = stream?.getVideoTracks() ?? [];
      for (const track of tracks) {
        if (typeof track.addEventListener !== "function") continue;
        track.addEventListener("mute", update);
        track.addEventListener("unmute", update);
        track.addEventListener("ended", update);
      }
      videoAvailable = tracks.some(
        (track) => track.readyState === "live" && track.enabled,
      );
      if (media?.srcObject !== stream) media.srcObject = stream ?? null;
      const playback = videoAvailable && media ? media.play?.() : undefined;
      if (playback) void playback.catch(() => undefined);
    };
    update();
    if (typeof stream?.addEventListener === "function") {
      stream.addEventListener("addtrack", update);
      stream.addEventListener("removetrack", update);
    }
    return () => {
      if (typeof stream?.removeEventListener === "function") {
        stream.removeEventListener("addtrack", update);
        stream.removeEventListener("removetrack", update);
      }
      for (const track of tracks) removeTrackListeners(track);
    };
  });
  $effect(() => {
    const stream = participant.audioStream;
    const update = () => {
      audioTracks =
        stream
          ?.getAudioTracks()
          .filter((track) => track.readyState === "live") ?? [];
    };
    update();
    if (typeof stream?.addEventListener === "function") {
      stream.addEventListener("addtrack", update);
      stream.addEventListener("removetrack", update);
    }
    return () => {
      if (typeof stream?.removeEventListener === "function") {
        stream.removeEventListener("addtrack", update);
        stream.removeEventListener("removetrack", update);
      }
      audioTracks = [];
    };
  });
  $effect(() => {
    const stream = participant.audioStream ?? participant.stream;
    const microphoneMuted = participant.microphoneMuted;
    const fallbackSpeaking = Boolean(participant.speaking);
    let context: AudioContext | null = null;
    let frame = 0;
    let lastVoiceAt = Number.NEGATIVE_INFINITY;
    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      void context?.close();
      context = null;
    };
    const start = () => {
      stop();
      const track = stream
        ?.getAudioTracks?.()
        .find((item) => item.readyState === "live" && item.enabled);
      if (
        !stream ||
        !track ||
        microphoneMuted ||
        typeof AudioContext === "undefined"
      ) {
        isSpeaking = fallbackSpeaking;
        return;
      }
      context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.65;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const measure = (now: number) => {
        analyser.getByteTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) {
          const amplitude = (sample - 128) / 128;
          energy += amplitude * amplitude;
        }
        if (Math.sqrt(energy / samples.length) > 0.035) lastVoiceAt = now;
        isSpeaking = now - lastVoiceAt < 250;
        frame = requestAnimationFrame(measure);
      };
      frame = requestAnimationFrame(measure);
    };
    start();
    if (typeof stream?.addEventListener === "function") {
      stream.addEventListener("addtrack", start);
      stream.addEventListener("removetrack", start);
    }
    return () => {
      if (typeof stream?.removeEventListener === "function") {
        stream.removeEventListener("addtrack", start);
        stream.removeEventListener("removetrack", start);
      }
      stop();
    };
  });
  $effect(() => {
    if (!media) return;
    const stream = participant.stream ?? null;
    media.srcObject = stream;
    media.muted = true;
    const playback = stream ? media.play?.() : undefined;
    if (playback) void playback.catch(() => undefined);
    return () => {
      if (media.srcObject === stream) media.srcObject = null;
    };
  });
  function activateFocus(event?: MouseEvent) {
    if (
      event?.target instanceof Element &&
      event.target.closest("button, input, select, label")
    )
      return;
    onFocus?.();
  }
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activateFocus();
    }
  }
  async function toggleFullscreen(event: MouseEvent) {
    event.stopPropagation();
    if (!fullscreenAvailable) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await tile.requestFullscreen();
    } catch {}
  }
  function changeVolume(event: Event) {
    event.stopPropagation();
    volume = Number((event.currentTarget as HTMLInputElement).value);
    onVolumeChange?.(volume);
  }
  function toggleMute() {
    remoteMuted = !remoteMuted;
    onMuteChange?.(remoteMuted);
  }
</script>

<div
  bind:this={tile}
  class:focused
  class={`tile relative grid h-full min-h-0 min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 text-slate-100 outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 max-md:min-h-52 ${focused ? "min-h-[min(70dvh,38rem)]" : ""}`}
  role="button"
  tabindex="0"
  aria-label={`${focused ? "Return to grid from" : "Focus"} ${local ? "your" : participant.displayName + "'s"} video`}
  onclick={activateFocus}
  onkeydown={handleKeydown}
>
  <div
    class="meta absolute top-2 left-2 z-10 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1 rounded-lg border border-slate-700/85 bg-slate-950/74 px-2 py-1 text-xs backdrop-blur-sm"
  >
    <span class="name max-w-36 overflow-hidden text-ellipsis whitespace-nowrap"
      >{local ? "You" : participant.displayName}</span
    >{#if participant.isHost}<span
        class="badge host rounded px-1 py-[.1rem] text-[.625rem] text-emerald-200 bg-emerald-500/20"
        >Host</span
      >{/if}{#if participant.microphoneMuted}<span
        class="badge muted rounded bg-red-500/18 px-1 py-[.1rem] text-[.625rem] text-red-200"
        >Mic off</span
      >{/if}{#if participant.videoState === "screen"}<span
        class="badge screen rounded bg-violet-500/20 px-1 py-[.1rem] text-[.625rem] text-violet-200"
        >Screen</span
      >{/if}{#if participant.connected === false}<span
        class="badge offline rounded bg-red-500/18 px-1 py-[.1rem] text-[.625rem] text-red-200"
        >Connecting</span
      >{/if}
  </div>
  <div
    class="actions absolute top-2 right-2 z-10 rounded-lg border border-slate-700/85 bg-slate-950/74 backdrop-blur-sm"
  >
    {#if fullscreenAvailable}<button
        class="grid min-h-10 min-w-10 place-items-center rounded-lg text-slate-300 hover:bg-slate-700 focus-visible:bg-slate-700 focus-visible:outline-none"
        type="button"
        aria-label={`Fullscreen ${participant.displayName}`}
        onclick={toggleFullscreen}
        ><Icon icon="mdi:fullscreen" class="size-4" /></button
      >{/if}
  </div>
  {#if !local}<div
      class="audio-controls absolute right-3 bottom-3 z-10 flex w-11 flex-col items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-950/85 px-1.5 py-2 shadow-lg shadow-black/20 backdrop-blur-md"
    >
      <label class="flex h-20 w-full items-center justify-center"
        ><span class="sr-only">Volume for {participant.displayName}</span><input
          class="volume-slider"
          aria-label={`Volume for ${participant.displayName}`}
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          style={`--volume: ${volume * 100}%`}
          oninput={changeVolume}
        /></label
      ><button
        class="grid size-8 place-items-center rounded-full text-slate-300 transition hover:bg-slate-700/80 hover:text-cyan-200 focus-visible:bg-slate-700 focus-visible:outline-none"
        type="button"
        aria-label={`${remoteMuted ? "Unmute" : "Mute"} ${participant.displayName}`}
        aria-pressed={remoteMuted}
        onclick={toggleMute}
        ><Icon
          icon={remoteMuted || volume === 0
            ? "mdi:volume-off"
            : volume < 0.5
              ? "mdi:volume-medium"
              : "mdi:volume-high"}
          class="size-4"
        /></button
      >
    </div>{/if}
  {#if !videoAvailable}<div
      class="fallback absolute inset-0 grid place-items-center"
    >
      <CallAvatar
        name={participant.displayName}
        speaking={isSpeaking}
        {local}
      />
    </div>{/if}
  <video
    class:hidden={!videoAvailable}
    class="absolute inset-0 h-full min-h-0 w-full min-w-0 bg-black object-contain"
    bind:this={media}
    autoplay
    playsinline
    muted
    aria-label={`${participant.displayName} video`}
  ></video>
  {#if !local}{#each audioTracks as track (track.id)}
      <CallAudioTrack {track} muted={remoteMuted} {volume} />
    {/each}{/if}
  {#if isSpeaking}<span
      class={`speaking absolute right-2 z-10 rounded-full border border-emerald-400/50 bg-slate-950/74 px-2 py-[.2rem] text-[.625rem] text-emerald-200 backdrop-blur-sm ${local ? "bottom-2" : "bottom-13"}`}
      aria-label={`${participant.displayName} is speaking`}>Speaking</span
    >{/if}
</div>

<style>
  .volume-slider {
    width: 0.3rem;
    height: 4.5rem;
    appearance: none;
    border-radius: 999px;
    background: linear-gradient(
      to top,
      #22d3ee var(--volume),
      #334155 var(--volume)
    );
    cursor: pointer;
    writing-mode: vertical-lr;
    direction: rtl;
  }

  .volume-slider::-webkit-slider-thumb {
    width: 0.9rem;
    height: 0.9rem;
    appearance: none;
    border: 2px solid #0f172a;
    border-radius: 999px;
    background: #a5f3fc;
    box-shadow: 0 0 0 1px rgb(103 232 249 / 35%);
  }

  .volume-slider::-moz-range-thumb {
    width: 0.7rem;
    height: 0.7rem;
    border: 2px solid #0f172a;
    border-radius: 999px;
    background: #a5f3fc;
    box-shadow: 0 0 0 1px rgb(103 232 249 / 35%);
  }
</style>
