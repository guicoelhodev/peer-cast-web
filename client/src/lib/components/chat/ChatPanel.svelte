<script lang="ts">
	import ChatComposer from './ChatComposer.svelte';
	import ChatMessageList from './ChatMessageList.svelte';
	import type { ChatMessage } from './types';

	let {
		open,
		messages = [],
		connected,
		onOpenChange,
		onSend
	}: {
		open: boolean;
		messages?: readonly ChatMessage[];
		connected: boolean;
		onOpenChange: (open: boolean) => void;
		onSend: (text: string) => void;
	} = $props();
</script>

{#if open}
	<section class="chat-panel" aria-label="Room chat">
		<header>
			<div><span aria-hidden="true">CHAT</span><h2>Room chat</h2></div>
			<button type="button" onclick={() => onOpenChange(false)} aria-label="Close chat">×</button>
		</header>
		<ChatMessageList {messages} />
		<ChatComposer {connected} {onSend} />
	</section>
{/if}

<style>
	.chat-panel { display: flex; width:min(20rem,100%); min-height:0; flex-direction:column; overflow:hidden; border:1px solid #1e293b; border-radius:.75rem; background:rgb(15 23 42 /.92); }.chat-panel header { display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #1e293b; padding:.625rem .75rem; }.chat-panel header div { display:flex; align-items:center; gap:.5rem; color:#67e8f9; }.chat-panel header div span { font-size:.6rem; font-weight:700; letter-spacing:.1em; }.chat-panel h2 { margin:0; color:#e2e8f0; font-size:.875rem; }.chat-panel header button { display:grid; min-width:2rem; min-height:2rem; place-items:center; border:0; border-radius:.35rem; background:transparent; color:#94a3b8; font-size:1.25rem; line-height:1; }.chat-panel header button:hover,.chat-panel header button:focus-visible { background:#1e293b; color:#f8fafc; }
	@media (max-width:767px) { .chat-panel { position:fixed; z-index:30; inset:3rem 0 0; width:auto; border-radius:0; padding-bottom:env(safe-area-inset-bottom); } }
</style>
