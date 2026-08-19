<script lang="ts">
	import { MAX_CHAT_MESSAGE_LENGTH } from '../../types/signaling';

	let {
		connected,
		onSend
	}: {
		connected: boolean;
		onSend: (text: string) => void;
	} = $props();

	let draft = $state('');

	function trimToRunes(value: string) {
		return [...value].slice(0, MAX_CHAT_MESSAGE_LENGTH).join('');
	}

	function updateDraft(event: Event) {
		draft = trimToRunes((event.currentTarget as HTMLTextAreaElement).value);
	}

	function send() {
		const text = draft.trim();
		if (!connected || !text) return;
		onSend(text);
		draft = '';
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			send();
		}
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		send();
	}
</script>

<form onsubmit={handleSubmit}>
	<label for="chat-message">Message the room</label>
	<textarea
		id="chat-message"
		value={draft}
		oninput={updateDraft}
		onkeydown={handleKeydown}
		placeholder="Message the room"
		aria-describedby="chat-character-count chat-connection-state"
		disabled={!connected}
	></textarea>
	<div class="footer">
		<span id="chat-connection-state" role="status">{connected ? 'Connected' : 'Chat unavailable while disconnected'}</span>
		<span id="chat-character-count">{[...draft].length}/{MAX_CHAT_MESSAGE_LENGTH}</span>
		<button type="submit" disabled={!connected || !draft.trim()} aria-label="Send message">Send</button>
	</div>
</form>

<style>
	form { border-top:1px solid #1e293b; padding:.75rem; }
	label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
	textarea { width:100%; min-height:4.5rem; resize:vertical; border:1px solid #334155; border-radius:.5rem; padding:.5rem .75rem; background:#1e293b; color:#f1f5f9; font-size:.75rem; outline:none; }
	textarea:focus { border-color: #22d3ee; }
	textarea:disabled { cursor: not-allowed; opacity: 0.6; }
	.footer { display:flex; align-items:center; gap:.5rem; margin-top:.5rem; color:#64748b; font-size:.625rem; }
	.footer span:first-child { flex: 1; }
	button { min-height:2rem; border:0; border-radius:.5rem; padding:.375rem .625rem; background:#22d3ee; color:#083344; font-size:.75rem; font-weight:600; }
	button:hover:not(:disabled) { background: #67e8f9; }
	button:disabled { cursor: not-allowed; opacity: 0.5; }
	@media (max-width: 360px) { .footer { flex-wrap: wrap; } .footer span:first-child { flex-basis: 100%; } }
</style>
