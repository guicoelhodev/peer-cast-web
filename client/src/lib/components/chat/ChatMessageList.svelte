<script lang="ts">
	import { limitChatHistory, type ChatMessage } from './types';

	let { messages = [] }: { messages?: readonly ChatMessage[] } = $props();

	const formatTime = (sentAt: string) =>
		new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(sentAt));
</script>

<div class="messages" aria-live="polite" aria-label="Messages">
	{#if messages.length === 0}
		<p class="empty">No messages yet. Say hello to the room.</p>
	{:else}
		{#each limitChatHistory(messages) as message (message.id)}
			<article class:own={message.isOwn} class="message">
				<div class="meta">
					<span>{message.displayName ?? (message.isOwn ? 'You' : 'Participant')}</span>
					<time datetime={message.sentAt}>{formatTime(message.sentAt)}</time>
				</div>
				<p>{message.text}</p>
			</article>
		{/each}
	{/if}
</div>

<style>
	.messages { flex:1; min-height:0; overflow-y:auto; padding:.75rem; }
	.empty { margin:1.25rem 0 0; color:#64748b; font-size:.75rem; text-align:center; }
	.message { display: flex; flex-direction: column; align-items: flex-start; margin-bottom: 0.75rem; }
	.message.own { align-items: flex-end; }
	.meta { display:flex; gap:.375rem; margin:0 0 .25rem; color:#64748b; font-size:.625rem; }
	.message p { max-width:100%; margin:0; overflow-wrap:anywhere; border-radius:.75rem; padding:.5rem .75rem; background:#1e293b; color:#e2e8f0; font-size:.75rem; line-height:1.45; white-space:pre-wrap; }
	.message.own p { background:#22d3ee; color:#083344; }
</style>
