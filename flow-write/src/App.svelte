<script>
  import { onMount } from 'svelte';
  import NavBar from './lib/NavBar.svelte';
  import FlowEditor from './lib/FlowEditor.svelte';
  import ApiTest from './lib/ApiTest.svelte';
  import FloatingBall from './lib/FloatingBall.svelte';
  import { saveSetting, loadSetting, SETTINGS_KEYS } from './lib/db/settings';

  let activePage = $state('flow');
  let isLoaded = $state(false);

  onMount(async () => {
    activePage = await loadSetting(SETTINGS_KEYS.PREFERENCES_ACTIVE_PAGE, 'flow');
    isLoaded = true;
  });

  $effect(() => {
    if (!isLoaded) return;
    saveSetting(SETTINGS_KEYS.PREFERENCES_ACTIVE_PAGE, activePage);
  });
</script>

<div class="app">
  <div class="navbar">
    <NavBar bind:activePage />
  </div>
  <div class="content">
    {#if activePage === 'flow'}
      <FlowEditor />
    {:else}
      <ApiTest />
    {/if}
  </div>
</div>

<FloatingBall />

<style>
  :global(html) {
    margin: 0;
    padding: 0;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
  }

  .app {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }

  .navbar {
    flex: 0 0 auto;
  }

  .content {
    flex: 1 1 auto;
    overflow: hidden;
  }
</style>
