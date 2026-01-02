<script>
  import { SvelteFlow } from '@xyflow/svelte';
  import NavBar from './lib/NavBar.svelte';
  import ApiTest from './lib/ApiTest.svelte';

  import '@xyflow/svelte/dist/style.css';

  let activePage = $state('flow');

  let nodes = $state.raw([
    { id: '1', position: { x: 0, y: 0 }, data: { label: '1' } },
    { id: '2', position: { x: 0, y: 100 }, data: { label: '2' } },
  ]);

  let edges = $state.raw([
    { id: 'e1-2', source: '1', target: '2' },
  ]);
</script>

<NavBar bind:activePage />

{#if activePage === 'flow'}
  <div style:width="100vw" style:height="calc(100vh - 56px)">
    <SvelteFlow bind:nodes bind:edges />
  </div>
{:else}
  <ApiTest />
{/if}
