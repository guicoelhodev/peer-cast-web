<script lang="ts">
	let { name, speaking = false, local = false }: { name: string; speaking?: boolean; local?: boolean } = $props();
	const initials = (value: string) => Array.from(value.trim()).slice(0, 2).join('').toLocaleUpperCase() || '?';
</script>

<div class:local class:speaking class={`avatar grid w-[clamp(3.5rem,18vw,5rem)] aspect-square place-items-center rounded-full border border-violet-300/35 bg-violet-500/16 text-[clamp(1.125rem,5vw,1.5rem)] font-[650] tracking-[.04em] text-violet-200 transition-[box-shadow,transform] duration-150 ${local ? 'border-cyan-300/35 bg-cyan-500/16 text-cyan-100' : ''} ${speaking ? 'scale-[1.03] shadow-[0_0_0_3px_#34d399,0_0_0_6px_rgb(16_185_129_/_0.2)]' : ''}`} aria-label={`${name} avatar`} role="img">
	{initials(name)}
</div>
