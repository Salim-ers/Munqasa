/** Tests unitaires et d'intégration du serveur (base PGlite en mémoire, aucun service externe). */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/server/**/*.test.ts", "tests/shared/**/*.test.ts", "tests/samples/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
  },
});
