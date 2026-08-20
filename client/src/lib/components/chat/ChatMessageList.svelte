<script lang="ts">
  import { limitChatHistory, type ChatMessage } from "./types";
  let {
    messages = [],
    embedded = false,
  }: { messages?: readonly ChatMessage[]; embedded?: boolean } = $props();
  const formatTime = (sentAt: string) =>
    new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(sentAt));
</script>

<div
  class={`messages min-h-0 flex-1 overflow-y-auto ${embedded ? "p-0 max-md:flex-initial" : "p-3"}`}
  aria-live="polite"
  aria-label="Messages"
>
  {#if messages.length === 0}
    <p class="empty mt-5 mb-0 text-center text-xs text-slate-500">
      No messages yet. Say hello to the room.
    </p>
  {:else}
    {#each limitChatHistory(messages) as message (message.id)}
      <article
        class:own={message.isOwn}
        class={`message mb-3 flex flex-col ${message.isOwn ? "items-end" : "items-start"}`}
      >
        <div class="meta mb-1 flex gap-1.5 text-[.625rem] text-slate-500">
          <span
            >{message.displayName ??
              (message.isOwn ? "You" : "Participant")}</span
          ><time datetime={message.sentAt}>{formatTime(message.sentAt)}</time>
        </div>
        <p
          class={`m-0 max-w-full wrap-anywhere rounded-xl px-3 py-2 text-xs leading-[1.45] whitespace-pre-wrap ${message.isOwn ? "bg-cyan-400 text-cyan-950" : "bg-slate-800 text-slate-200"}`}
        >
          {message.text}
        </p>
      </article>
    {/each}
  {/if}
</div>
