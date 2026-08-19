<script lang="ts">
	import Icon from '@iconify/svelte';

	let { roomId = null, name = $bindable(''), busy = false, error = '', onCreate, onJoin }: {
		roomId?: string | null;
		name?: string;
		busy?: boolean;
		error?: string;
		onCreate: () => void;
		onJoin: () => void;
	} = $props();
</script>

<main class="lobby grid min-h-dvh grid-cols-1 bg-background lg:grid-cols-[18rem_minmax(0,1fr)]">
	<aside class="lobby-sidebar flex min-h-0 flex-col border-b border-slate-800 bg-slate-900/82 lg:border-r lg:border-b-0" aria-label="Application navigation">
		<div class="brand flex h-12 items-center justify-between border-b border-slate-800 px-3 lg:px-4"><strong class="text-sm tracking-[.04em]">PeerCast</strong><span class="rounded bg-emerald-500/16 px-2 py-[.2rem] text-[.625rem] font-bold tracking-[.1em] text-emerald-300">CLIENT</span></div>
		<div class="side-content hidden p-3 lg:block"><p class="side-label m-0 text-[.65rem] font-bold uppercase tracking-[.14em] text-slate-500">Connection</p><div class="side-card mt-2 rounded-lg bg-slate-800/55 p-3"><span class="status font-mono text-[.7rem] text-emerald-300">● ready</span><p class="mt-2 mb-0 text-[.7rem] leading-5 text-slate-400">Create a private room or open an invite to connect directly.</p></div></div>
		<div class="side-user mt-auto hidden items-center gap-2.5 border-t border-slate-800 p-3 lg:flex"><i class="grid aspect-square w-8 place-items-center rounded-full bg-slate-700 text-slate-400 not-italic">?</i><div class="min-w-0"><b class="block max-w-48 overflow-hidden text-ellipsis whitespace-nowrap text-xs">{name || 'Not connected'}</b><small class="mt-[.15rem] block max-w-48 overflow-hidden text-ellipsis whitespace-nowrap text-[.65rem] text-slate-500">Direct peer to peer</small></div></div>
	</aside>
	<div class="lobby-main flex min-h-0 min-w-0 flex-col"><header class="lobby-header flex h-12 items-center border-b border-slate-800 bg-slate-900/45 px-3 lg:px-4"><h2 class="m-0 text-sm">{roomId ? 'Join room' : 'New room'}</h2></header><section class="m-4 mx-auto w-[calc(100%-2rem)] max-w-[30rem] rounded-xl border border-slate-800 bg-slate-900/68 p-5 sm:p-8 lg:my-auto">
		<div class="empty-icon grid w-14 place-items-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 p-3 text-cyan-300" aria-hidden="true"><Icon icon="mdi:video-outline" class="size-8" /></div>
		<p class="eyebrow mt-5 mb-0 text-[.65rem] font-bold uppercase tracking-[.14em] text-slate-500">PEERCAST / DIRECT ROOM</p><h1 class="mt-2 mb-0 text-2xl">{roomId ? 'Join the room' : 'Start a private call'}</h1><p class="copy mt-2 mb-0 text-sm leading-6 text-slate-400">{roomId ? 'Choose a name to enter this invite-only room.' : 'Create a room and share its link. Audio and video stay peer to peer.'}</p>
		<label class="mt-6 block text-xs font-medium text-slate-300">Name<input class="mt-2 block w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400" bind:value={name} maxlength="50" autocomplete="name" placeholder="Your display name" onkeydown={(event) => event.key === 'Enter' && (roomId ? onJoin() : onCreate())} /></label>
		{#if error}<p class="error mt-3 mb-0 text-xs text-red-300" role="alert">{error}</p>{/if}
		<button class="mt-5 min-h-11 w-full rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-cyan-950 hover:bg-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50" type="button" onclick={roomId ? onJoin : onCreate} disabled={busy || !name.trim()}>{busy ? 'Connecting…' : roomId ? 'Join room' : 'Create room'}</button>
		{#if roomId}<p class="room mt-4 mb-0 text-center text-xs text-slate-500">Room <code class="text-cyan-300">{roomId}</code></p>{/if}
	</section></div>
</main>
