/** Valeurs des tests de bout en bout (compte et secrets fictifs, propres à la base de test jetable). */
const port = 5199;

export const E2E = {
  port,
  baseUrl: `http://localhost:${port}`,
  email: "admin@talab.test",
  password: "Mot-de-passe-e2e-tres-long!",
  cronSecret: "secret-de-tache-planifiee-e2e-0123456789",
} as const;
