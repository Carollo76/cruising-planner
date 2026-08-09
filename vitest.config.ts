import { defineConfig } from 'vitest/config';

/**
 * Kept separate from vite.config.ts on purpose.
 *
 * Vitest bundles its own Vite copy, whose plugin types conflict with the Vite 8 used for
 * the app build. The unit tests cover pure logic — time handling, gate matching, current
 * projection, solver scoring — and need none of the React, Tailwind or PWA plugins, so
 * there is nothing to gain from sharing a config and a type conflict to lose.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Passage planning is timezone-sensitive by nature. Pin the boat's zone so tests
    // assert real DST behaviour rather than whatever the machine is set to.
    env: { TZ: 'America/New_York' },
  },
});
