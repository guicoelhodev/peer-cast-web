<script lang="ts">
	import type { CallQualityOption } from './types';

	let { microphoneMuted, videoState = 'off', quality, qualityOptions = [], onToggleMicrophone, onToggleCamera, onToggleScreen, onLeave, onQualityChange }: {
		microphoneMuted: boolean;
		videoState?: 'camera' | 'screen' | 'off';
		quality?: string;
		qualityOptions?: readonly CallQualityOption[];
		onToggleMicrophone: () => void;
		onToggleCamera: () => void;
		onToggleScreen: () => void;
		onLeave: () => void;
		onQualityChange?: (quality: string) => void;
	} = $props();
</script>

<nav class="call-controls" aria-label="Call controls">
	<button type="button" class:active={!microphoneMuted} aria-pressed={!microphoneMuted} aria-label={microphoneMuted ? 'Turn on microphone' : 'Mute microphone'} onclick={onToggleMicrophone}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0m5 5v4m-3 0h6"/></svg><span>Mic</span></button>
	<button type="button" class:active={videoState === 'camera'} aria-pressed={videoState === 'camera'} aria-label={videoState === 'camera' ? 'Turn off camera' : 'Turn on camera'} onclick={onToggleCamera}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h6A2.5 2.5 0 0 1 15 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-6A2.5 2.5 0 0 1 4 16.5v-9ZM15 10l5-3v10l-5-3"/></svg><span>Camera</span></button>
	<button type="button" class:screen={videoState === 'screen'} aria-pressed={videoState === 'screen'} aria-label={videoState === 'screen' ? 'Stop sharing screen' : 'Share screen'} onclick={onToggleScreen}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5h16v11H4zM9 20h6m-3-4v4"/></svg><span>Share</span></button>
	{#if qualityOptions.length}<label class="quality"><span>Quality</span><select aria-label="Video quality" value={quality} onchange={(event) => onQualityChange?.(event.currentTarget.value)}>{#each qualityOptions as option (option.id)}<option value={option.id}>{option.label}</option>{/each}</select></label>{/if}
	<button type="button" class="leave" aria-label="Leave call" onclick={onLeave}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 4l4 4-2 2a12 12 0 0 0 7 7l2-2 4 4-2 2c-1 1-3 1-4 0C8 17 5 14 3 10c-1-2-1-3 0-4l2-2Z"/></svg><span>Leave</span></button>
</nav>

<style>
	.call-controls { display:grid; width:100%; min-width:0; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.4rem; }.call-controls button,.quality select { min-height:2.75rem; border:1px solid #334155; border-radius:.45rem; background:#1e293b; color:#cbd5e1; }.call-controls button { display:flex; min-width:0; align-items:center; justify-content:center; gap:.3rem; padding:.45rem .3rem; font-size:.68rem; cursor:pointer; }.call-controls svg { width:1rem; height:1rem; flex:none; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }.call-controls button:hover,.call-controls button:focus-visible { border-color:#22d3ee; color:#e0f2fe; outline:0; }.call-controls button.active { border-color:rgb(52 211 153 /.55); background:rgb(6 78 59 /.35); color:#a7f3d0; }.call-controls button.screen { border-color:rgb(168 85 247 /.55); background:rgb(88 28 135 /.28); color:#ddd6fe; }.call-controls .leave { border-color:rgb(239 68 68 /.45); background:rgb(127 29 29 /.42); color:#fecaca; }.quality { display:grid; grid-column:1 / -1; gap:.25rem; color:#94a3b8; font-size:.65rem; }.quality select { width:100%; padding:0 .4rem; font-size:.68rem; } @media (max-width:767px) { .call-controls { grid-template-columns:repeat(4,minmax(0,1fr)); }.call-controls .leave { grid-column:auto; }.quality { grid-column:1 / -1; } } @media (max-width:22rem) { .call-controls button span:last-child { display:none; } }
</style>
