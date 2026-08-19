<script lang="ts">
	let { roomId = null, name = $bindable(''), busy = false, error = '', onCreate, onJoin }: {
		roomId?: string | null;
		name?: string;
		busy?: boolean;
		error?: string;
		onCreate: () => void;
		onJoin: () => void;
	} = $props();
</script>

<main class="lobby">
	<aside class="lobby-sidebar" aria-label="Application navigation">
		<div class="brand"><strong>PeerCast</strong><span>CLIENT</span></div>
		<div class="side-content"><p class="side-label">Connection</p><div class="side-card"><span class="status">● ready</span><p>Create a private room or open an invite to connect directly.</p></div></div>
		<div class="side-user"><i>?</i><div><b>{name || 'Not connected'}</b><small>Direct peer to peer</small></div></div>
	</aside>
	<div class="lobby-main"><header class="lobby-header"><h2>{roomId ? 'Join room' : 'New room'}</h2></header><section>
		<div class="empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h6A2.5 2.5 0 0 1 15 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-6A2.5 2.5 0 0 1 4 16.5v-9ZM15 10l5-3v10l-5-3"/></svg></div>
		<p class="eyebrow">PEERCAST / DIRECT ROOM</p><h1>{roomId ? 'Join the room' : 'Start a private call'}</h1><p class="copy">{roomId ? 'Choose a name to enter this invite-only room.' : 'Create a room and share its link. Audio and video stay peer to peer.'}</p>
		<label>Name<input bind:value={name} maxlength="50" autocomplete="name" placeholder="Your display name" onkeydown={(event) => event.key === 'Enter' && (roomId ? onJoin() : onCreate())} /></label>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<button type="button" onclick={roomId ? onJoin : onCreate} disabled={busy || !name.trim()}>{busy ? 'Connecting…' : roomId ? 'Join room' : 'Create room'}</button>
		{#if roomId}<p class="room">Room <code>{roomId}</code></p>{/if}
	</section></div>
</main>

<style>
	.lobby { display:grid; min-height:100dvh; grid-template-columns:18rem minmax(0,1fr); background:#020617; }.lobby-sidebar { display:flex; flex-direction:column; min-height:0; border-right:1px solid #1e293b; background:rgb(15 23 42 /.82); }.brand { display:flex; height:3rem; align-items:center; justify-content:space-between; border-bottom:1px solid #1e293b; padding:0 1rem; }.brand strong { font-size:.875rem; letter-spacing:.04em; }.brand span { border-radius:.25rem; padding:.2rem .45rem; background:rgb(16 185 129 /.16); color:#6ee7b7; font-size:.625rem; font-weight:700; letter-spacing:.1em; }.side-content { padding:.9rem; }.side-label,.eyebrow { margin:0; color:#64748b; font-size:.65rem; font-weight:700; letter-spacing:.14em; text-transform:uppercase; }.side-card { margin-top:.5rem; border-radius:.5rem; padding:.7rem; background:rgb(30 41 59 /.55); }.side-card p { margin:.45rem 0 0; color:#94a3b8; font-size:.7rem; line-height:1.5; }.status { color:#6ee7b7; font: .7rem ui-monospace, monospace; }.side-user { display:flex; gap:.6rem; align-items:center; margin-top:auto; border-top:1px solid #1e293b; padding:.75rem; }.side-user i { display:grid; width:2rem; aspect-ratio:1; place-items:center; border-radius:50%; background:#334155; color:#94a3b8; font-style:normal; }.side-user b,.side-user small { display:block; max-width:12rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.side-user b { font-size:.75rem; }.side-user small { margin-top:.15rem; color:#64748b; font-size:.65rem; }.lobby-main { display:flex; min-width:0; min-height:0; flex-direction:column; }.lobby-header { display:flex; height:3rem; align-items:center; border-bottom:1px solid #1e293b; padding:0 1rem; background:rgb(15 23 42 /.45); }.lobby-header h2 { margin:0; font-size:.875rem; }.lobby section { width:min(100% - 2rem,30rem); margin:auto; border:1px solid #1e293b; border-radius:.75rem; padding:clamp(1.25rem,4vw,2rem); background:rgb(15 23 42 /.68); }.empty-icon { display:grid; width:3.5rem; aspect-ratio:1; place-items:center; border-radius:.75rem; background:rgb(34 211 238 /.1); color:#67e8f9; }.empty-icon svg { width:1.8rem; fill:none; stroke:currentColor; stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round; }.eyebrow { margin-top:1.25rem; color:#67e8f9; } h1 { margin:.5rem 0; font-size:clamp(1.5rem,5vw,2rem); }.copy { margin:0; color:#94a3b8; font-size:.875rem; line-height:1.55; } label { display:grid; gap:.4rem; margin-top:1.5rem; color:#cbd5e1; font-size:.75rem; font-weight:600; } input { width:100%; min-width:0; border:1px solid #334155; border-radius:.5rem; padding:.7rem .75rem; background:#0f172a; color:#f1f5f9; } input:focus { border-color:#22d3ee; outline:0; } button { width:100%; min-height:2.75rem; margin-top:1rem; border:0; border-radius:.5rem; padding:.65rem 1rem; background:#22d3ee; color:#083344; font-size:.875rem; font-weight:700; cursor:pointer; } button:hover { background:#67e8f9; } button:disabled { cursor:not-allowed; opacity:.55; }.error { color:#fca5a5; font-size:.8rem; }.room { color:#94a3b8; font-size:.75rem; } code { color:#67e8f9; overflow-wrap:anywhere; }
	@media (max-width:1023px) { .lobby { grid-template-columns:1fr; }.lobby-sidebar { min-height:auto; border-right:0; border-bottom:1px solid #1e293b; }.side-content { display:none; }.side-user { display:none; }.brand { padding:0 .75rem; }.lobby section { margin:1rem auto; } } @media (max-width:320px) { .lobby section { width:calc(100% - 1rem); padding:1rem; } }
</style>
