<script lang="ts">
  import Icon from "@iconify/svelte";

  let {
    roomId = null,
    name = $bindable(""),
    busy = false,
    error = "",
    onCreate,
    onJoin,
  }: {
    roomId?: string | null;
    name?: string;
    busy?: boolean;
    error?: string;
    onCreate: () => void;
    onJoin: () => void;
  } = $props();
  let roomCopied = $state(false);
  let copyResetTimer: ReturnType<typeof setTimeout>;

  async function copyRoomId() {
    if (!roomId) return;
    await navigator.clipboard.writeText(roomId);
    roomCopied = true;
    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => (roomCopied = false), 500);
  }
</script>

<main
  class="lobby grid min-h-dvh place-items-center overflow-hidden bg-background p-3"
>
  <section
    class="relative w-full max-w-[30rem] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/68 px-4 py-5 text-center sm:px-6 sm:py-6"
  >
    <Icon
      icon="mdi:video-outline"
      class="pointer-events-none absolute -top-4 -right-6 size-48 rotate-12 text-cyan-300/8 sm:size-56"
      aria-hidden="true"
    />
    <div
      class="relative z-10 mx-auto grid size-12 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
    >
      <Icon icon="mdi:video" class="size-6" aria-hidden="true" />
    </div>
    <p
      class="relative z-10 mt-4 mb-0 text-[.65rem] font-semibold uppercase tracking-[.18em] text-slate-500"
    >
      PeerCast / Direct Room
    </p>
    <h1 class="relative z-10 mt-2 mb-0 text-xl font-medium text-slate-100">
      {roomId ? "Entrar na sala" : "Criar uma sala"}
    </h1>
    <p
      class="relative z-10 mx-auto mt-2 mb-0 max-w-sm text-sm leading-5 text-slate-400"
    >
      {roomId
        ? "Escolha um nome para entrar nesta sala privada."
        : "Escolha um nome para criar uma sala privada e compartilhar o convite."}
    </p>

    <label class="sr-only" for="display-name">Name</label>
    <div class="relative z-10 mt-5">
      <Icon
        icon="mdi:account-outline"
        class="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      />
      <input
        id="display-name"
        class="block min-h-11 w-full rounded-xl border border-slate-700 bg-slate-800 py-2 pr-3 pl-12 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400"
        bind:value={name}
        maxlength="50"
        autocomplete="name"
        placeholder="Seu nome"
        aria-label="Name"
        onkeydown={(event) =>
          event.key === "Enter" && (roomId ? onJoin() : onCreate())}
      />
    </div>
    {#if error}<p
        class="error relative z-10 mt-3 mb-0 text-sm text-red-300"
        role="alert"
      >
        {error}
      </p>{/if}
    <button
      class="relative z-10 mt-5 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-cyan-400 px-3 py-2 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
      type="button"
      aria-label={roomId ? "Join room" : "Create room"}
      onclick={roomId ? onJoin : onCreate}
      disabled={busy || !name.trim()}
    >
      <span
        >{busy ? "Conectando…" : roomId ? "Entrar na sala" : "Criar sala"}</span
      >
      {#if !busy}<Icon
          icon="mdi:arrow-right"
          class="size-5"
          aria-hidden="true"
        />{/if}
    </button>

    {#if roomId}
      <div
        class="room relative z-10 mx-auto mt-5 flex w-fit max-w-full items-center gap-1.5 rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-[.68rem] text-slate-500"
      >
        <span class="size-2 shrink-0 rounded-full bg-cyan-200"></span>
        <span>Room:</span>
        <code class="max-w-72 truncate text-slate-400">{roomId}</code>
        <button
          class="grid size-7 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-700/60 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-cyan-300"
          type="button"
          onclick={copyRoomId}
          aria-label="Copy room ID"
          title={roomCopied ? "Copied" : "Copy room ID"}
          ><Icon
            icon={roomCopied ? "mdi:check" : "mdi:content-copy"}
            class="size-4"
          /></button
        >
      </div>
    {/if}
  </section>
</main>
