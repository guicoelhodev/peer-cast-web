<script lang="ts">
  let {
    track,
    muted = false,
    volume = 1,
  }: { track: MediaStreamTrack; muted?: boolean; volume?: number } = $props();
  let media = $state<HTMLAudioElement>();

  $effect(() => {
    const audio = media;
    if (!audio) return;
    const stream = new MediaStream([track]);
    audio.srcObject = stream;
    const playback = audio.play?.();
    if (playback) void playback.catch(() => undefined);
    return () => {
      audio.pause();
      if (audio.srcObject === stream) audio.srcObject = null;
    };
  });

  $effect(() => {
    const audio = media;
    if (!audio) return;
    audio.muted = muted;
    audio.volume = volume;
    const playback = !muted ? audio.play?.() : undefined;
    if (playback) void playback.catch(() => undefined);
  });
</script>

<audio class="hidden" bind:this={media} autoplay playsinline></audio>
