<script lang="ts">
	import { trpc } from '$lib/trpc/client';
	import { toast } from '$lib/stores/toast.svelte';

	let { data } = $props();

	let enableDiscoteca = $state(data.state.enableDiscoteca);

	async function toggleDiscoteca() {
		const next = !enableDiscoteca;
		enableDiscoteca = next;
		try {
			await trpc().settings.setDiscotecaEnabled.mutate({ enabled: next });
			toast.success(next ? 'Discoteca ativada' : 'Discoteca desativada');
		} catch {
			enableDiscoteca = !next;
			toast.error('Falha ao atualizar a configuração');
		}
	}
</script>

<h1 class="text-ink mb-6 text-2xl font-bold">Configurações</h1>

<div class="border-line bg-panel max-w-md rounded-xl border p-5">
	<label class="text-ink flex items-center justify-between gap-4 text-sm font-medium">
		Ativar Discoteca
		<input type="checkbox" checked={enableDiscoteca} onchange={toggleDiscoteca} />
	</label>
	<p class="text-ink-dim mt-2 text-xs">
		Quando desativado, não é possível girar álbuns ou singles.
	</p>
</div>
