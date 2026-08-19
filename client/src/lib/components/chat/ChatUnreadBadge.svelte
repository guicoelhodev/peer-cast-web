<script lang="ts">
	let { count = 0 }: { count?: number } = $props();

	const label = (value: number) => `${value > 99 ? '99+' : value} unread chat message${value === 1 ? '' : 's'}`;
</script>

{#if count > 0}
	<span class="badge" aria-label={label(count)}>{count > 99 ? '99+' : count}</span>
{/if}

<style>
	.badge {
		display: inline-flex;
		min-width: 1rem;
		height: 1rem;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		padding: 0 0.25rem;
		background: #22d3ee;
		color: #18181b;
		font-size: 0.5625rem;
		font-weight: 700;
		line-height: 1;
	}
</style>
