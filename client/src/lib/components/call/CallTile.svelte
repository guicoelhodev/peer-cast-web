<script lang="ts">
	import CallAvatar from './CallAvatar.svelte';
	import type { CallParticipant } from './types';

	let {
		participant,
		local = false,
		focused = false,
		onFocus,
		onVolumeChange,
		onMuteChange
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
	let volume = $derived(Math.max(0, Math.min(1, participant.volume ?? 1)));

	$effect(() => {
		fullscreenAvailable = typeof document !== 'undefined' && typeof (tile as unknown as { requestFullscreen?: unknown } | undefined)?.requestFullscreen === 'function' && typeof (document as unknown as { exitFullscreen?: unknown }).exitFullscreen === 'function';
	});

	$effect(() => {
		const stream = participant.stream;
		let tracks: MediaStreamTrack[] = [];
		const removeTrackListeners = (track: MediaStreamTrack) => {
			if (typeof track.removeEventListener !== 'function') return;
			track.removeEventListener('mute', update);
			track.removeEventListener('unmute', update);
			track.removeEventListener('ended', update);
		};
		const update = () => {
			for (const track of tracks) removeTrackListeners(track);
			tracks = stream?.getVideoTracks() ?? [];
			for (const track of tracks) {
				if (typeof track.addEventListener !== 'function') continue;
				track.addEventListener('mute', update);
				track.addEventListener('unmute', update);
				track.addEventListener('ended', update);
			}
			videoAvailable = participant.videoState !== 'off' && tracks.some((track) => track.readyState === 'live' && track.enabled);
			if (media?.srcObject !== stream) media.srcObject = stream ?? null;
			const playback = videoAvailable && media && !media.muted ? media.play?.() : undefined;
			if (playback) void playback.catch(() => undefined);
		};
		update();
		if (typeof stream?.addEventListener === 'function') {
			stream.addEventListener('addtrack', update);
			stream.addEventListener('removetrack', update);
		}
		return () => {
			if (typeof stream?.removeEventListener === 'function') {
				stream.removeEventListener('addtrack', update);
				stream.removeEventListener('removetrack', update);
			}
			for (const track of tracks) removeTrackListeners(track);
		};
	});

	$effect(() => {
		if (!media) return;
		const stream = participant.stream ?? null;
		media.srcObject = stream;
		media.muted = local || Boolean(participant.muted);
		media.volume = volume;
		const playback = stream && !media.muted ? media.play?.() : undefined;
		if (playback) void playback.catch(() => undefined);
		return () => {
			if (media.srcObject === stream) media.srcObject = null;
		};
	});

	function activateFocus(event?: MouseEvent) {
		if (event?.target instanceof Element && event.target.closest('button, input, select, label')) return;
		onFocus?.();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
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
		onVolumeChange?.(Number((event.currentTarget as HTMLInputElement).value));
	}
</script>

<div bind:this={tile} class:focused class="tile" role="button" tabindex="0" aria-label={`${focused ? 'Return to grid from' : 'Focus'} ${local ? 'your' : participant.displayName + "'s"} video`} onclick={activateFocus} onkeydown={handleKeydown}>
	<div class="meta">
		<span class="name">{local ? 'You' : participant.displayName}</span>
		{#if participant.isHost}<span class="badge host">Host</span>{/if}
		{#if participant.microphoneMuted}<span class="badge muted">Mic off</span>{/if}
		{#if participant.videoState === 'screen'}<span class="badge screen">Screen</span>{/if}
		{#if participant.connected === false}<span class="badge offline">Connecting</span>{/if}
	</div>

	<div class="actions">
		{#if fullscreenAvailable}<button type="button" aria-label={`Fullscreen ${participant.displayName}`} onclick={toggleFullscreen}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg></button>{/if}
	</div>

	{#if !local}
		<div class="audio-controls">
			<button type="button" aria-label={`${participant.muted ? 'Unmute' : 'Mute'} ${participant.displayName}`} aria-pressed={Boolean(participant.muted)} onclick={() => onMuteChange?.(!participant.muted)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 9v6h4l5 4V5L9 9H5Zm12 1 3 4m0-4-3 4"/></svg></button>
			<label><span class="sr-only">Volume for {participant.displayName}</span><input aria-label={`Volume for ${participant.displayName}`} type="range" min="0" max="1" step="0.01" value={volume} oninput={changeVolume} /></label>
		</div>
	{/if}

	{#if !videoAvailable}<div class="fallback"><CallAvatar name={participant.displayName} speaking={participant.speaking} {local} /></div>{/if}
	<video class:hidden={!videoAvailable} bind:this={media} autoplay playsinline muted={local} aria-label={`${participant.displayName} video`}></video>
	{#if participant.speaking}<span class="speaking" aria-label={`${participant.displayName} is speaking`}>Speaking</span>{/if}
</div>

<style>
	.tile { position: relative; display: grid; min-width: 0; min-height: 0; aspect-ratio: 16 / 9; overflow: hidden; border: 1px solid #1e293b; border-radius: 0.75rem; background: #0f172a; color: #f1f5f9; cursor: pointer; outline: none; }
	.tile:focus-visible { box-shadow: 0 0 0 2px #22d3ee; }
	.tile.focused { min-height: min(70dvh, 38rem); }
	video { width: 100%; height: 100%; background: #000; object-fit: contain; }
	video.hidden { visibility: hidden; }
	.meta, .actions, .audio-controls, .speaking { position: absolute; z-index: 1; border: 1px solid rgb(51 65 85 / .85); background: rgb(2 6 23 / .74); backdrop-filter: blur(8px); }
	.meta { top: 0.5rem; left: 0.5rem; display: flex; max-width: calc(100% - 1rem); flex-wrap: wrap; align-items: center; gap: 0.25rem; padding: 0.3rem 0.45rem; border-radius: 0.5rem; font-size: 0.75rem; }
	.name { overflow: hidden; max-width: 9rem; text-overflow: ellipsis; white-space: nowrap; }
	.badge { border-radius: 0.25rem; padding: 0.1rem 0.25rem; font-size: 0.625rem; }.host { color: #a7f3d0; background: rgb(16 185 129 / 0.2); }.muted, .offline { color: #fecaca; background: rgb(239 68 68 / 0.18); }.screen { color: #ddd6fe; background: rgb(139 92 246 / 0.2); }
	.actions { top: 0.5rem; right: 0.5rem; border-radius: 0.5rem; }.actions button, .audio-controls button { display:grid; min-width:2.5rem; min-height:2.5rem; place-items:center; border:0; border-radius:.45rem; background:transparent; color:#cbd5e1; cursor:pointer; }.actions svg,.audio-controls svg { width:1rem; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }.actions button:hover, .actions button:focus-visible, .audio-controls button:hover, .audio-controls button:focus-visible { background: #334155; outline: 0; }
	.audio-controls { right: 0.5rem; bottom: 0.5rem; display: flex; flex-direction:column-reverse; align-items: center; gap: 0.25rem; border-radius: 0.5rem; padding: 0.15rem; }.audio-controls input { width:.85rem; height:5rem; writing-mode:vertical-lr; direction:rtl; accent-color:#22d3ee; }
	.fallback { position: absolute; inset: 0; display: grid; place-items: center; }.speaking { right: 0.5rem; bottom: 0.5rem; border-color: rgb(52 211 153 / 0.5); border-radius: 999px; padding: 0.2rem 0.45rem; color: #a7f3d0; font-size: 0.625rem; }.audio-controls + .fallback ~ .speaking { bottom: 3.25rem; }
	.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
</style>
