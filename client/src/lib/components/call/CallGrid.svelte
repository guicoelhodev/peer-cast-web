<script lang="ts">
	import CallTile from './CallTile.svelte';
	import type { CallParticipant } from './types';

	let { local, participants = [], focusedId = $bindable<string | null>(null), onFocusChange, onRemoteVolumeChange, onRemoteMuteChange }: {
		local: CallParticipant;
		participants?: readonly CallParticipant[];
		focusedId?: string | null;
		onFocusChange?: (id: string | null) => void;
		onRemoteVolumeChange?: (id: string, volume: number) => void;
		onRemoteMuteChange?: (id: string, muted: boolean) => void;
	} = $props();

	let tiles = $derived([{ ...local, id: local.id || 'local' }, ...participants.filter((participant) => participant.id !== local.id).slice(0, 8)]);
	let visibleTiles = $derived(focusedId ? tiles.filter((participant) => participant.id === focusedId) : tiles);

	function toggleFocus(id: string) {
		focusedId = focusedId === id ? null : id;
		onFocusChange?.(focusedId);
	}
</script>

<section class:focused={Boolean(focusedId)} class={`call-grid count-${Math.min(tiles.length, 9)}`} aria-label="Call participants">
	{#each visibleTiles as participant (participant.id)}
		<CallTile {participant} local={participant.id === local.id} focused={Boolean(focusedId)} onFocus={() => toggleFocus(participant.id)} onVolumeChange={(volume) => onRemoteVolumeChange?.(participant.id, volume)} onMuteChange={(muted) => onRemoteMuteChange?.(participant.id, muted)} />
	{/each}
</section>

<style>
	.call-grid { display: grid; width: 100%; min-width: 0; min-height:0; flex:1; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; align-content: center; }.call-grid.count-1, .call-grid.focused { grid-template-columns: minmax(0, 1fr); }.call-grid.focused { max-width: 100%; }.call-grid.count-1 { max-width: 70rem; }.call-grid.count-2 { max-width: 70rem; }
	@media (min-width: 40rem) { .call-grid { gap: 0.75rem; }.call-grid.count-5, .call-grid.count-6, .call-grid.count-7, .call-grid.count-8, .call-grid.count-9 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	@media (max-width:767px) { .call-grid { grid-template-columns:minmax(0,1fr) !important; grid-auto-rows:minmax(13rem,1fr); align-content:start; overflow-y:auto; }.call-grid :global(.tile) { min-height:13rem; } }
</style>
