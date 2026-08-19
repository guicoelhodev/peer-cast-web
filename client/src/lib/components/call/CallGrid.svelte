<script lang="ts">
  import Icon from "@iconify/svelte";
  import CallTile from "./CallTile.svelte";
  import type { CallParticipant } from "./types";
  let {
    local,
    participants = [],
    focusedId = $bindable<string | null>(null),
    onFocusChange,
    onRemoteVolumeChange,
    onRemoteMuteChange,
  }: {
    local: CallParticipant;
    participants?: readonly CallParticipant[];
    focusedId?: string | null;
    onFocusChange?: (id: string | null) => void;
    onRemoteVolumeChange?: (id: string, volume: number) => void;
    onRemoteMuteChange?: (id: string, muted: boolean) => void;
  } = $props();
  let tiles = $derived([
    { ...local, id: local.id || "local" },
    ...participants.filter((participant) => participant.id !== local.id),
  ]);
  let overflowCount = $derived(tiles.length > 9 ? tiles.length - 8 : 0);
  let gridTiles = $derived(overflowCount > 0 ? tiles.slice(0, 8) : tiles);
  let visibleTiles = $derived(
    focusedId
      ? gridTiles.filter((participant) => participant.id === focusedId)
      : gridTiles,
  );
  let slotCount = $derived(
    focusedId ? 1 : gridTiles.length + (overflowCount > 0 ? 1 : 0),
  );
  let layoutClass = $derived(
    focusedId || slotCount === 1
      ? "grid-cols-1 grid-rows-1"
      : slotCount === 2
        ? "grid-cols-1 grid-rows-2"
        : slotCount <= 4
          ? "grid-cols-2 grid-rows-2"
          : "grid-cols-3 grid-rows-3",
  );
  function toggleFocus(id: string) {
    focusedId = focusedId === id ? null : id;
    onFocusChange?.(focusedId);
  }
</script>

<section
  class:focused={Boolean(focusedId)}
  class={`call-grid count-${slotCount} grid min-h-0 w-full min-w-0 flex-1 gap-3 max-md:!grid-cols-1 max-md:!grid-rows-none max-md:auto-rows-[minmax(13rem,1fr)] max-md:content-start max-md:overflow-y-auto ${layoutClass}`}
  aria-label="Call participants"
>
  {#each visibleTiles as participant (participant.id)}
    <CallTile
      {participant}
      local={participant.id === local.id}
      focused={Boolean(focusedId)}
      onFocus={() => toggleFocus(participant.id)}
      onVolumeChange={(volume) =>
        onRemoteVolumeChange?.(participant.id, volume)}
      onMuteChange={(muted) => onRemoteMuteChange?.(participant.id, muted)}
    />
  {/each}
  {#if overflowCount > 0 && !focusedId}
    <div
      class="tile grid min-h-0 min-w-0 place-items-center overflow-hidden rounded-xl border border-slate-800 bg-slate-900 text-slate-300 max-md:min-h-52"
      role="status"
      aria-label={`${overflowCount} more participants`}
    >
      <div class="flex flex-col items-center gap-2 text-center">
        <div
          class="grid size-14 place-items-center rounded-full bg-cyan-400/10 text-cyan-300"
        >
          <Icon icon="mdi:account-multiple" class="size-7" />
        </div>
        <strong class="text-2xl font-semibold text-slate-100"
          >+{overflowCount}</strong
        >
        <span class="text-xs text-slate-500">participants</span>
      </div>
    </div>
  {/if}
</section>
