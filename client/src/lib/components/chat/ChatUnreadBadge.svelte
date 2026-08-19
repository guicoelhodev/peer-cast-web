<script lang="ts">
  let { count = 0 }: { count?: number } = $props();
  const label = (value: number) =>
    `${value > 99 ? "99+" : value} unread chat message${value === 1 ? "" : "s"}`;
</script>

{#if count > 0}
  <span
    class="badge inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-400 px-1 text-[.5625rem] leading-none font-bold text-zinc-900"
    aria-label={label(count)}>{count > 99 ? "99+" : count}</span
  >
{/if}
