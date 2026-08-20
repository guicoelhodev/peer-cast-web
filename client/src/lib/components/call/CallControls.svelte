<script lang="ts">
  import Icon from "@iconify/svelte";
  import type { CallQualityOption } from "./types";
  let {
    microphoneMuted,
    videoState = "off",
    quality,
    qualityOptions = [],
    mode = "all",
    onToggleMicrophone,
    onToggleCamera,
    onToggleScreen,
    onLeave,
    onQualityChange,
    onCopyInvite,
    inviteCopied = false,
  }: {
    microphoneMuted: boolean;
    videoState?: "camera" | "screen" | "off";
    quality?: string;
    qualityOptions?: readonly CallQualityOption[];
    mode?: "all" | "devices";
    onToggleMicrophone: () => void;
    onToggleCamera: () => void;
    onToggleScreen: () => void;
    onLeave: () => void;
    onQualityChange?: (quality: string) => void;
    onCopyInvite?: () => void;
    inviteCopied?: boolean;
  } = $props();
  let deviceClass = $derived(
    mode === "devices"
      ? "!size-12 !min-h-12 !min-w-12 !rounded-full !p-0 [&>span]:hidden [&>svg]:h-[1.15rem] [&>svg]:w-[1.15rem]"
      : "",
  );
  let qualityOpen = $state(false);

  function handleShare() {
    if (mode !== "devices" || videoState === "screen") {
      qualityOpen = false;
      onToggleScreen();
      return;
    }

    qualityOpen = !qualityOpen;
  }

  function selectQuality(event: Event) {
    const selectedQuality = (event.currentTarget as HTMLSelectElement).value;
    if (!selectedQuality) return;
    onQualityChange?.(selectedQuality);
    qualityOpen = false;
    onToggleScreen();
  }
</script>

<nav
  class:devices-only={mode === "devices"}
  class={`call-controls min-w-0 ${mode === "devices" ? "flex w-auto justify-center gap-2 rounded-full bg-slate-900/92 p-2" : "grid w-full grid-cols-3 gap-1.5 max-md:grid-cols-4"}`}
  aria-label="Call controls"
>
  <button
    class:active={!microphoneMuted}
    class={`flex min-w-20 items-center justify-center gap-1 rounded-lg border px-2.5 py-2 text-[.68rem] hover:border-cyan-400 hover:text-cyan-100 focus-visible:outline-none ${!microphoneMuted ? "border-emerald-400/55 bg-emerald-950/35 text-emerald-200" : "border-slate-700 bg-slate-800 text-slate-300"} ${deviceClass}`}
    type="button"
    aria-pressed={!microphoneMuted}
    aria-label={microphoneMuted ? "Turn on microphone" : "Mute microphone"}
    onclick={onToggleMicrophone}
    ><Icon
      icon={microphoneMuted ? "mdi:microphone-off" : "mdi:microphone"}
      class="size-4 flex-none"
    /><span class="max-[22rem]:hidden">Mic</span></button
  >
  <button
    class:active={videoState === "camera"}
    class={`flex min-w-20 items-center justify-center gap-1 rounded-lg border px-2.5 py-2 text-[.68rem] hover:border-cyan-400 hover:text-cyan-100 focus-visible:outline-none ${videoState === "camera" ? "border-emerald-400/55 bg-emerald-950/35 text-emerald-200" : "border-slate-700 bg-slate-800 text-slate-300"} ${deviceClass}`}
    type="button"
    aria-pressed={videoState === "camera"}
    aria-label={videoState === "camera" ? "Turn off camera" : "Turn on camera"}
    onclick={onToggleCamera}
    ><Icon
      icon={videoState === "camera" ? "mdi:video-off" : "mdi:video"}
      class="size-4 flex-none"
    /><span class="max-[22rem]:hidden">Camera</span></button
  >
  <div class="relative">
    {#if mode === "devices" && qualityOpen}
      <div
        class="absolute bottom-full left-1/2 z-20 mb-3 w-60 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-2xl shadow-black/40"
      >
        <label class="grid gap-2 text-xs font-medium text-slate-300"
          >Screen quality<select
            class="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs text-slate-200 outline-none focus:border-violet-400"
            aria-label="Video quality"
            value=""
            onchange={selectQuality}
            ><option value="" disabled>Select resolution</option
            >{#each qualityOptions as option (option.id)}<option
                value={option.id}>{option.label}</option
              >{/each}</select
          ></label
        >
      </div>
    {/if}
    <button
      class:screen={videoState === "screen"}
      class={`flex min-w-20 items-center justify-center gap-1 rounded-lg border px-2.5 py-2 text-[.68rem] hover:border-cyan-400 hover:text-cyan-100 focus-visible:outline-none ${videoState === "screen" ? "border-violet-500/55 bg-violet-950/28 text-violet-200" : "border-slate-700 bg-slate-800 text-slate-300"} ${deviceClass}`}
      type="button"
      aria-pressed={videoState === "screen"}
      aria-expanded={mode === "devices" ? qualityOpen : undefined}
      aria-haspopup={mode === "devices" && videoState !== "screen"
        ? "listbox"
        : undefined}
      aria-label={videoState === "screen"
        ? "Stop sharing screen"
        : "Share screen"}
      onclick={handleShare}
      ><Icon
        icon={videoState === "screen" ? "mdi:monitor-off" : "mdi:monitor-share"}
        class="size-4 flex-none"
      /><span class="max-[22rem]:hidden">Share</span></button
    >
  </div>
  <button
    class={`leave flex min-w-20 items-center justify-center gap-1 rounded-lg border border-red-500/45 bg-red-900/42 px-2.5 py-2 text-[.68rem] text-red-200 hover:border-cyan-400 hover:text-cyan-100 focus-visible:outline-none ${deviceClass}`}
    type="button"
    aria-label="Leave call"
    onclick={onLeave}
    ><Icon icon="mdi:phone-hangup" class="size-4 flex-none" /><span
      class="max-[22rem]:hidden">Leave</span
    ></button
  >
  {#if onCopyInvite}<button
      class={`flex min-w-20 items-center justify-center gap-1 rounded-lg border border-cyan-400/55 bg-cyan-950/35 px-2.5 py-2 text-[.68rem] text-cyan-200 hover:border-cyan-300 hover:text-cyan-100 focus-visible:outline-none ${deviceClass}`}
      type="button"
      onclick={onCopyInvite}
      aria-label={inviteCopied ? "Invite link copied" : "Copy invite link"}
      title={inviteCopied ? "Copied" : "Copy invite link"}
      ><Icon
        icon={inviteCopied ? "mdi:check" : "fluent-mdl2:add-friend"}
        class="size-4 flex-none"
      /><span class="max-[22rem]:hidden">Invite</span></button
    >{/if}
  {#if mode !== "devices" && qualityOptions.length}<label
      class="quality grid gap-1 text-[.65rem] text-slate-400"
      ><span>Quality</span><select
        class="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 text-[.68rem] text-slate-300"
        aria-label="Video quality"
        value={quality}
        onchange={(event) => onQualityChange?.(event.currentTarget.value)}
        >{#each qualityOptions as option (option.id)}<option value={option.id}
            >{option.label}</option
          >{/each}</select
      ></label
    >{/if}
</nav>
