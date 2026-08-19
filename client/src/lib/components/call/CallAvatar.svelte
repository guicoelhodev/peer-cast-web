<script lang="ts">
	let { name, speaking = false, local = false }: { name: string; speaking?: boolean; local?: boolean } = $props();

	const initials = (value: string) => Array.from(value.trim()).slice(0, 2).join('').toLocaleUpperCase() || '?';
</script>

<div class:local class:speaking class="avatar" aria-label={`${name} avatar`} role="img">
	{initials(name)}
</div>

<style>
	.avatar { display: grid; width: clamp(3.5rem, 18vw, 5rem); aspect-ratio: 1; place-items: center; border: 1px solid rgb(196 181 253 / .35); border-radius: 999px; background: rgb(139 92 246 / .16); color: #ddd6fe; font-size: clamp(1.125rem, 5vw, 1.5rem); font-weight: 650; letter-spacing: 0.04em; transition: box-shadow 150ms ease, transform 150ms ease; }
	.avatar.local { border-color: rgb(103 232 249 / .35); background: rgb(6 182 212 / .16); color: #cffafe; }
	.avatar.speaking { box-shadow: 0 0 0 3px #34d399, 0 0 0 6px rgb(16 185 129 / 0.2); transform: scale(1.03); }
</style>
