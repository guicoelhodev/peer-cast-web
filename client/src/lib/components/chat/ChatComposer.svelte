<script lang="ts">
	import Icon from '@iconify/svelte';
	import { MAX_CHAT_MESSAGE_LENGTH } from '../../types/signaling';
	let { connected, onSend }: { connected: boolean; onSend: (text: string) => void } = $props();
	let draft = $state('');
	function trimToRunes(value: string) { return [...value].slice(0, MAX_CHAT_MESSAGE_LENGTH).join(''); }
	function updateDraft(event: Event) { draft = trimToRunes((event.currentTarget as HTMLTextAreaElement).value); }
	function send() { const text = draft.trim(); if (!connected || !text) return; onSend(text); draft = ''; }
	function handleKeydown(event: KeyboardEvent) { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); } }
	function handleSubmit(event: SubmitEvent) { event.preventDefault(); send(); }
</script>

<form class="border-t border-slate-800 p-3" onsubmit={handleSubmit}>
	<label class="sr-only" for="chat-message">Message the room</label>
	<textarea class="min-h-[4.5rem] w-full resize-y rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60" id="chat-message" value={draft} oninput={updateDraft} onkeydown={handleKeydown} placeholder="Message the room" aria-describedby="chat-character-count chat-connection-state" disabled={!connected}></textarea>
	<div class="footer mt-2 flex items-center gap-2 text-[.625rem] text-slate-500 max-[360px]:flex-wrap"><span class="flex-1 max-[360px]:basis-full" id="chat-connection-state" role="status">{connected ? 'Connected' : 'Chat unavailable while disconnected'}</span><span id="chat-character-count">{[...draft].length}/{MAX_CHAT_MESSAGE_LENGTH}</span><button class="grid size-8 place-items-center rounded-lg bg-cyan-400 text-cyan-950 hover:bg-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={!connected || !draft.trim()} aria-label="Send message"><Icon icon="mdi:send" class="size-4" /></button></div>
</form>
