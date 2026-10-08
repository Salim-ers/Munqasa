/** Schémas partagés : mêmes règles pour les formulaires et le serveur, messages en français. */
import { describe, expect, it } from "vitest";
import { clientInput, deadlineInput, projectInput, uploadRequest } from "../../shared/schemas.js";

const project = { name: "Affaire", country: "MA", marketType: "concours", sector: "public", currency: "MAD" } as const;

function messages(result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } }) {
  return Object.fromEntries((result.error?.issues ?? []).map((i) => [i.path.join("."), i.message]));
}

describe("schémas partagés", () => {
  it("renvoie des messages lisibles en français", () => {
    expect(messages(clientInput.safeParse({ name: " ", sector: "x", country: "MA", email: "pas-un-email" }))).toEqual({
      name: "Champ obligatoire.",
      sector: "Choisissez une valeur dans la liste.",
      email: "Adresse e-mail invalide.",
    });
    expect(messages(deadlineInput.safeParse({ title: "Visite", dueAt: "" }))).toEqual({ dueAt: "Indiquez la date et l’heure." });
  });

  it("normalise les montants saisis à la française, sans flottant", () => {
    const ok = projectInput.parse({ ...project, manualEstimate: "1 250 000,50" });
    expect(ok.manualEstimate).toBe("1250000.50");
    expect(projectInput.parse({ ...project, manualEstimate: "" }).manualEstimate).toBeNull();
    expect(messages(projectInput.safeParse({ ...project, manualEstimate: "12,345" }))).toEqual({ manualEstimate: "Montant invalide (2 décimales au plus)." });
    expect(messages(projectInput.safeParse({ ...project, manualEstimate: "-5" }))).toEqual({ manualEstimate: "Montant invalide (2 décimales au plus)." });
  });

  it("convertit les champs vides en null et les dates locales en ISO", () => {
    const ok = projectInput.parse({ ...project, city: "", submissionDeadline: "2026-10-12T10:00" });
    expect(ok.city).toBeNull();
    expect(ok.submissionDeadline).toBe(new Date("2026-10-12T10:00").toISOString());
    expect(clientInput.parse({ name: "Client", sector: "prive", country: "FR", legalIds: { siret: " 123 ", tva: "" } }).legalIds).toEqual({ siret: "123" });
  });

  it("assainit le type de fichier annoncé par le navigateur", () => {
    const base = { kind: "plan", fileName: "plan.dwg", sizeBytes: 10 } as const;
    expect(uploadRequest.parse({ ...base, contentType: "" }).contentType).toBe("application/octet-stream");
    expect(uploadRequest.parse({ ...base, contentType: "Application/PDF" }).contentType).toBe("application/pdf");
    expect(uploadRequest.parse({ ...base, contentType: "text/html\r\nx-injection: 1" }).contentType).toBe("application/octet-stream");
  });
});
