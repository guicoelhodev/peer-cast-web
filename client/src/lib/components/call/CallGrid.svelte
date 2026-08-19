<script lang="ts">
	import CallTile from './CallTile.svelte';
	import type { CallParticipant } from './types';
	let { local, participants = [], focusedId = $bindable<string | null>(null), onFocusChange, onRemoteVolumeChange, onRemoteMuteChange }: { local: CallParticipant; participants?: readonly CallParticipant[]; focusedId?: string | null; onFocusChange?: (id: string | null) => void; onRemoteVolumeChange?: (id: string, volume: number) => void; onRemoteMuteChange?: (id: string, muted: boolean) => void } = $props();
	let tiles = $derived([{ ...local, id: local.id || 'local' }, ...participants.filter((participant) => participant.id !== local.id).slice(0, 8)]);
	let visibleTiles = $derived(focusedId ? tiles.filter((participant) => participant.id === focusedId) : tiles);
	function toggleFocus(id: string) { focusedId = focusedId === id ? null : id; onFocusChange?.(focusedId); }
</script>

<section class:focused={Boolean(focusedId)} class={`call-grid grid min-h-0 w-full min-w-0 flex-1 content-center gap-3 max-md:!grid-cols-1 max-md:auto-rows-[minmax(13rem,1fr)] max-md:content-start max-md:overflow-y-auto ${focusedId || tiles.length === 1 ? 'grid-cols-1 max-w-[70rem]' : tiles.length >= 5 ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2 max-w-[70rem]'}`} aria-label="Call participants">
	{#each visibleTiles as participant (participant.id)}
		<CallTile {participant} local={participant.id === local.id} focused={Boolean(focusedId)} onFocus={() => toggleFocus(participant.id)} onVolumeChange={(volume) => onRemoteVolumeChange?.(participant.id, volume)} onMuteChange={(muted) => onRemoteMuteChange?.(participant.id, muted)} />
	{/each}
</section>
