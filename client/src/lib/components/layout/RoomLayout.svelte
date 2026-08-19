<script lang="ts">
	import Icon from '@iconify/svelte';
	import { CallControls, CallGrid, type CallParticipant, type CallQualityOption } from '../call';
	import { ChatPanel, type ChatMessage } from '../chat';
	let { roomId, inviteUrl, status, participants, local, chatOpen = $bindable(false), unread = 0, messages = [], microphoneMuted, videoState, quality, qualityOptions, error = '', onCopyInvite, onSendChat, onToggleMicrophone, onToggleCamera, onToggleScreen, onQualityChange, onLeave }: { roomId: string; inviteUrl: string; status: string; participants: readonly CallParticipant[]; local: CallParticipant; chatOpen?: boolean; unread?: number; messages?: readonly ChatMessage[]; microphoneMuted: boolean; videoState: 'camera' | 'screen' | 'off'; quality: string; qualityOptions: readonly CallQualityOption[]; error?: string; onCopyInvite: () => void; onSendChat: (text: string) => void; onToggleMicrophone: () => void; onToggleCamera: () => void; onToggleScreen: () => void; onQualityChange: (quality: string) => void; onLeave: () => void } = $props();
	let inviteCopied = $state(false);
	let copyResetTimer: ReturnType<typeof setTimeout>;

	function copyInvite() {
		onCopyInvite();
		inviteCopied = true;
		clearTimeout(copyResetTimer);
		copyResetTimer = setTimeout(() => inviteCopied = false, 500);
	}
</script>

<main class="room-shell grid min-h-dvh grid-cols-1 overflow-visible bg-background lg:h-dvh lg:grid-cols-[18rem_minmax(0,1fr)] lg:overflow-hidden">
	<aside class="app-sidebar order-2 flex min-h-0 flex-col border-t border-slate-800 bg-slate-900/78 lg:order-none lg:border-t-0 lg:border-r" aria-label="Application navigation">
		<div class="brand flex h-12 items-center border-b border-slate-800 px-4"><strong class="text-sm tracking-[.04em]">PeerCast</strong></div>
		<div class="sidebar-content flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-3">
			<div><p class="side-label mb-2 text-[.625rem] font-bold uppercase tracking-[.14em] text-slate-500">Connection</p><div class="connection grid gap-1.5 rounded-lg bg-slate-800/58 p-2.5"><span class="status font-mono text-[.7rem] text-emerald-300">● {status}</span><span class="room-id break-all font-mono text-[.62rem] text-cyan-300">ROOM / {roomId}</span></div></div>
			<div class="shrink-0"><p class="side-label mb-2 text-[.625rem] font-bold uppercase tracking-[.14em] text-slate-500">Participants ({participants.length + 1})</p><ul class="m-0 max-h-32 list-none overflow-y-auto p-0"><li class="flex min-w-0 items-center gap-1.5 border-b border-slate-800/70 py-2 text-xs text-slate-300"><i class="local-dot h-1.5 w-1.5 flex-none rounded-full bg-cyan-400"></i><span class="overflow-hidden text-ellipsis whitespace-nowrap">{local.displayName} (you)</span>{#if local.isHost}<em class="ml-auto text-[.62rem] not-italic text-emerald-300">Host</em>{/if}</li>{#each participants as participant (participant.id)}<li class="flex min-w-0 items-center gap-1.5 border-b border-slate-800/70 py-2 text-xs text-slate-300"><i class="h-1.5 w-1.5 flex-none rounded-full bg-purple-500"></i><span class="overflow-hidden text-ellipsis whitespace-nowrap">{participant.displayName}</span>{#if participant.isHost}<em class="ml-auto text-[.62rem] not-italic text-emerald-300">Host</em>{/if}</li>{/each}</ul></div>
			<div class="h-96 min-h-0 lg:h-auto lg:flex-1"><ChatPanel open={true} embedded {messages} connected={status === 'connected'} onOpenChange={() => {}} onSend={onSendChat} /></div>
		</div>
	</aside>
	<div class="room-main flex min-h-[75dvh] min-w-0 flex-col lg:min-h-0"><section class="stage flex min-h-0 flex-1 flex-col overflow-auto p-2 lg:p-3"><CallGrid {local} {participants} />{#if error}<p class="error mt-3 mb-0 text-xs text-red-300" role="alert">{error}</p>{/if}<div class="stage-controls mt-3 flex justify-center"><CallControls mode="devices" {microphoneMuted} {videoState} {quality} {qualityOptions} onToggleMicrophone={onToggleMicrophone} onToggleCamera={onToggleCamera} onToggleScreen={onToggleScreen} onQualityChange={onQualityChange} onLeave={onLeave} /></div></section></div>
	<input class="sr-only" readonly value={inviteUrl} aria-label="Invite link" tabindex="-1" />
	<button class="fixed right-5 bottom-5 z-40 grid size-14 cursor-pointer place-items-center rounded-full bg-cyan-400 text-cyan-950 transition hover:scale-105 hover:bg-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 active:scale-95" type="button" onclick={copyInvite} aria-label={inviteCopied ? 'Invite link copied' : 'Copy invite link'} title={inviteCopied ? 'Copied' : 'Copy invite link'}><Icon icon={inviteCopied ? 'mdi:check' : 'fluent-mdl2:add-friend'} class="size-6" /></button>
</main>
