<script lang="ts">
	import Icon from '@iconify/svelte';
	import ChatComposer from './ChatComposer.svelte';
	import ChatMessageList from './ChatMessageList.svelte';
	import type { ChatMessage } from './types';
	let { open, embedded = false, messages = [], connected, onOpenChange, onSend }: { open: boolean; embedded?: boolean; messages?: readonly ChatMessage[]; connected: boolean; onOpenChange: (open: boolean) => void; onSend: (text: string) => void } = $props();
</script>

{#if open}
	<section class={`chat-panel flex min-h-0 w-full flex-col overflow-hidden ${embedded ? 'h-full bg-transparent' : 'max-w-80 rounded-xl border border-slate-800 bg-slate-900/92 max-md:fixed max-md:inset-x-0 max-md:top-12 max-md:z-30 max-md:max-w-none max-md:rounded-none max-md:pb-[env(safe-area-inset-bottom)] md:my-3 md:mr-3'}`} aria-label="Room chat">
		{#if !embedded}<header class="flex items-center justify-between border-b border-slate-800 px-3 py-2.5"><div class="flex items-center gap-2 text-cyan-300"><Icon icon="mdi:message-text-outline" class="size-4" /><h2 class="m-0 text-sm text-slate-200">Room chat</h2></div><button class="grid min-h-8 min-w-8 place-items-center rounded-md bg-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-50 focus-visible:bg-slate-800 focus-visible:text-slate-50 focus-visible:outline-none" type="button" onclick={() => onOpenChange(false)} aria-label="Close chat"><Icon icon="mdi:close" class="size-5" /></button></header>{/if}
		<ChatMessageList {messages} {embedded} />
		<ChatComposer {connected} {onSend} {embedded} />
	</section>
{/if}
