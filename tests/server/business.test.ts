/**
 * Socle métier (étape B) sur une vraie base PostgreSQL (PGlite) et un stockage local temporaire :
 * clients, prospects, affaires, lots, échéances, fichiers, entités, réglages, notifications,
 * tâche planifiée. Chaque requête passe par l'API complète (session, double authentification, origine).
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { schema } from "../../server/db/index.js";
import { purgeAbandonedUploads } from "../../server/http/routes/jobs.js";
import { generateDeadlineReminders } from "../../server/services/notifications.js";
import { AiBudgetError, assertBudget, estimateCostUsd } from "../../server/services/openai.js";
import { nextReference } from "../../server/services/references.js";
import { adminSession, CRON_SECRET, setupTestServer, TestBrowser } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestServer>>;
let admin: TestBrowser;
const year = new Date().getFullYear();
const DAY = 24 * 3600 * 1000;

beforeAll(async () => {
  ctx = await setupTestServer();
  admin = (await adminSession(ctx.app)).browser;
});

const enc = (text: string) => new TextEncoder().encode(text);
const PDF = enc("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01,
  0x00, 0x18, 0xdd, 0x8d, 0xb0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
const DXF = enc("  0\nSECTION\n  2\nHEADER\n  0\nENDSEC\n  0\nEOF\n");

describe("autorisations", () => {
  const routes = [
    "/api/admin/clients",
    "/api/admin/prospects",
    "/api/admin/projects",
    "/api/admin/deadlines",
    "/api/admin/files",
    "/api/admin/company/profiles",
    "/api/admin/settings/ia",
    "/api/admin/notifications",
    "/api/admin/ai/spend",
    "/api/admin/system/status",
    "/api/admin/system/export",
  ];

  it("refuse toutes les routes métier sans session (401)", async () => {
    const visitor = new TestBrowser(ctx.app, "192.0.2.10");
    for (const path of routes) expect((await visitor.request(path)).status, path).toBe(401);
    expect((await visitor.request("/api/admin/clients", { body: { name: "x" } })).status).toBe(401);
  });

  it("refuse les écritures venant d'un autre site ou sans origine (403)", async () => {
    const payload = { name: "Client test", sector: "prive", country: "MA" };
    const foreign = await admin.request("/api/admin/clients", { body: payload, origin: "https://site-malveillant.example" });
    expect(foreign.status).toBe(403);
    const none = await admin.request("/api/admin/clients", { body: payload, origin: null });
    expect(none.status).toBe(403);
    expect(await ctx.db.select().from(schema.client)).toHaveLength(0);
  });
});

let clientId = "";

describe("clients", () => {
  it("valide les champs et renvoie les erreurs par champ", async () => {
    const res = await admin.request("/api/admin/clients", { body: { name: "  ", sector: "inconnu", country: "MA", email: "pas-un-email" } });
    expect(res.status).toBe(400);
    expect(Object.keys(res.json.fields)).toEqual(expect.arrayContaining(["name", "sector", "email"]));
  });

  it("crée, recherche, modifie partiellement, archive et restaure", async () => {
    const created = await admin.request("/api/admin/clients", {
      body: { name: "Client test A", sector: "prive", country: "MA", city: "Casablanca", email: "Contact@Exemple.TEST", legalIds: { ice: "000000000000000" } },
    });
    expect(created.status).toBe(201);
    clientId = created.json.client.id;
    expect(created.json.client.email).toBe("contact@exemple.test");

    const patched = await admin.request(`/api/admin/clients/${clientId}`, { method: "PATCH", body: { phone: "+212 5 00 00 00 00" } });
    expect(patched.status).toBe(200);
    // Les champs non envoyés restent intacts.
    expect(patched.json.client.legalIds).toEqual({ ice: "000000000000000" });
    expect(patched.json.client.city).toBe("Casablanca");

    const found = await admin.request("/api/admin/clients?q=test%20a");
    expect(found.json.items.map((c: { id: string }) => c.id)).toEqual([clientId]);
    expect(found.json.items[0].projectCount).toBe(0);

    await admin.request(`/api/admin/clients/${clientId}/archive`, { body: {} });
    expect((await admin.request("/api/admin/clients")).json.total).toBe(0);
    expect((await admin.request("/api/admin/clients?archives=1")).json.total).toBe(1);
    await admin.request(`/api/admin/clients/${clientId}/restore`, { body: {} });
    expect((await admin.request("/api/admin/clients")).json.total).toBe(1);
    expect((await admin.request("/api/admin/clients/options")).json.items).toHaveLength(1);
  });

  it("répond 404 pour un identifiant inconnu ou mal formé", async () => {
    expect((await admin.request(`/api/admin/clients/${crypto.randomUUID()}`)).status).toBe(404);
    expect((await admin.request("/api/admin/clients/abc")).status).toBe(404);
  });
});

describe("prospects", () => {
  it("garde le statut lors d'une modification partielle puis convertit en client", async () => {
    const created = await admin.request("/api/admin/prospects", {
      body: { name: "Contact prospect", company: "Entreprise prospect", country: "FR", city: "Lyon", email: "contact@prospect.test", status: "qualifie" },
    });
    expect(created.status).toBe(201);
    const id = created.json.prospect.id;
    const patched = await admin.request(`/api/admin/prospects/${id}`, { method: "PATCH", body: { notes: "Rencontré au salon." } });
    expect(patched.json.prospect.status).toBe("qualifie");

    const converted = await admin.request(`/api/admin/prospects/${id}/convert`, { body: { sector: "public" } });
    expect(converted.status).toBe(201);
    const [client] = await ctx.db.select().from(schema.client).where(eq(schema.client.id, converted.json.clientId));
    expect(client).toMatchObject({ name: "Entreprise prospect", contactName: "Contact prospect", sector: "public", country: "FR", city: "Lyon", notes: "Rencontré au salon." });
    const again = await admin.request(`/api/admin/prospects/${id}/convert`, { body: {} });
    expect(again.json.clientId).toBe(converted.json.clientId);
    expect((await admin.request("/api/admin/prospects?statut=converti")).json.total).toBe(1);
    // La conversion est définitive.
    expect((await admin.request(`/api/admin/prospects/${id}`, { method: "PATCH", body: { status: "nouveau" } })).status).toBe(409);
    const other = await admin.request("/api/admin/prospects", { body: { name: "Autre contact", country: "MA" } });
    expect((await admin.request(`/api/admin/prospects/${other.json.prospect.id}`, { method: "PATCH", body: { status: "converti" } })).status).toBe(409);
  });
});

let projectA = "";
let projectB = "";
// Remise à midi (heure du Maroc) dans deux jours : le décompte en jours ne dépend pas de l'heure du test.
const moroccoToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(new Date());
const deadlineA = new Date(Date.parse(`${moroccoToday}T11:00:00Z`) + 2 * DAY).toISOString();

describe("affaires", () => {
  it("exige les champs obligatoires", async () => {
    const res = await admin.request("/api/admin/projects", { body: { name: "" } });
    expect(res.status).toBe(400);
    expect(Object.keys(res.json.fields)).toEqual(expect.arrayContaining(["name", "country", "marketType", "sector", "currency"]));
  });

  it("refuse un client inexistant", async () => {
    const res = await admin.request("/api/admin/projects", {
      body: { name: "Affaire orpheline", clientId: crypto.randomUUID(), country: "MA", marketType: "appel_offres_ouvert", sector: "prive", currency: "MAD" },
    });
    expect(res.status).toBe(404);
  });

  it("attribue des références successives et conserve les montants en décimal exact", async () => {
    const a = await admin.request("/api/admin/projects", {
      body: {
        name: "Affaire test A",
        clientId,
        country: "MA",
        city: "Rabat",
        marketType: "appel_offres_ouvert",
        sector: "prive",
        designPhase: "apd",
        currency: "MAD",
        submissionDeadline: deadlineA,
        manualEstimate: "1 250 000,50",
      },
    });
    expect(a.status).toBe(201);
    projectA = a.json.project.id;
    expect(a.json.project.reference).toBe(`TAL-${year}-0001`);
    expect(a.json.project.manualEstimate).toBe("1250000.50");
    expect(a.json.project.status).toBe("brouillon");

    const b = await admin.request("/api/admin/projects", {
      body: { name: "Affaire test B", country: "FR", marketType: "consultation_privee", sector: "public", currency: "EUR" },
    });
    expect(b.status, JSON.stringify(b.json)).toBe(201);
    projectB = b.json.project.id;
    expect(b.json.project.reference).toBe(`TAL-${year}-0002`);
    expect(b.json.project.designPhase).toBe("dce");
  });

  it("ne modifie que les champs envoyés", async () => {
    const res = await admin.request(`/api/admin/projects/${projectA}`, { method: "PATCH", body: { name: "Affaire test A (révisée)" } });
    expect(res.status).toBe(200);
    expect(res.json.project).toMatchObject({ name: "Affaire test A (révisée)", designPhase: "apd", clientId, manualEstimate: "1250000.50", city: "Rabat" });
    expect(new Date(res.json.project.submissionDeadline).toISOString()).toBe(deadlineA);
  });

  it("filtre, recherche et trie la liste", async () => {
    const all = await admin.request("/api/admin/projects?sort=reference&dir=asc");
    expect(all.json.items.map((p: { reference: string }) => p.reference)).toEqual([`TAL-${year}-0001`, `TAL-${year}-0002`]);
    const fr = await admin.request("/api/admin/projects?pays=FR");
    expect(fr.json.items.map((p: { id: string }) => p.id)).toEqual([projectB]);
    const byClient = await admin.request("/api/admin/projects?q=client%20test");
    expect(byClient.json.items.map((p: { id: string }) => p.id)).toEqual([projectA]);
    expect(byClient.json.items[0].clientName).toBe("Client test A");
  });

  it("gère les lots (unicité du code, modification, suppression)", async () => {
    const lot = await admin.request(`/api/admin/projects/${projectA}/lots`, { body: { code: "02", name: "Gros œuvre", tradeFamily: "gros_oeuvre" } });
    expect(lot.status).toBe(201);
    expect((await admin.request(`/api/admin/projects/${projectA}/lots`, { body: { code: "02", name: "Doublon", tradeFamily: "gros_oeuvre" } })).status).toBe(409);
    expect((await admin.request(`/api/admin/projects/${projectA}/lots`, { body: { code: "03", name: "Inconnu", tradeFamily: "famille_inventee" } })).status).toBe(400);
    const other = await admin.request(`/api/admin/projects/${projectA}/lots`, { body: { code: "01", name: "Terrassements", tradeFamily: "preparation_terrassement" } });
    expect(other.json.lot.position).toBe(2);
    const renamed = await admin.request(`/api/admin/projects/${projectA}/lots/${lot.json.lot.id}`, { method: "PATCH", body: { name: "Gros œuvre, maçonnerie" } });
    expect(renamed.json.lot).toMatchObject({ code: "02", name: "Gros œuvre, maçonnerie", tradeFamily: "gros_oeuvre" });
    expect((await admin.request(`/api/admin/projects/${projectA}/lots/${other.json.lot.id}`, { method: "DELETE" })).status).toBe(200);

    const detail = await admin.request(`/api/admin/projects/${projectA}`);
    expect(detail.json.lots.map((l: { code: string }) => l.code)).toEqual(["02"]);
    expect(detail.json.client.name).toBe("Client test A");
    expect(detail.json.openIssues).toBe(0);
  });

  it("archive puis réactive une affaire", async () => {
    const archived = await admin.request(`/api/admin/projects/${projectB}`, { method: "PATCH", body: { status: "archive" } });
    expect(archived.json.project.archivedAt).toBeTruthy();
    expect((await admin.request("/api/admin/projects")).json.items.map((p: { id: string }) => p.id)).toEqual([projectA]);
    expect((await admin.request("/api/admin/projects?archives=1")).json.total).toBe(2);
    const reopened = await admin.request(`/api/admin/projects/${projectB}`, { method: "PATCH", body: { status: "chiffrage" } });
    expect(reopened.json.project.archivedAt).toBeNull();
    expect(reopened.json.project.name).toBe("Affaire test B");
  });

  it("retrace l'historique de l'affaire", async () => {
    const history = await admin.request(`/api/admin/projects/${projectA}/history`);
    const actions = history.json.entries.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["affaire.creation", "affaire.modification", "affaire.lot_ajoute", "affaire.lot_modifie", "affaire.lot_supprime"]));
    expect(history.json.entries.every((e: { actorUserId: string | null }) => e.actorUserId)).toBe(true);
  });

  it("compte les affaires de chaque client", async () => {
    const clients = (await admin.request("/api/admin/clients")).json.items;
    expect(clients.find((c: { id: string }) => c.id === clientId).projectCount).toBe(1);
    const lots = (await admin.request("/api/admin/projects?q=groupe")).json.items;
    expect(lots.length === 0 || typeof lots[0].lotCount === "number").toBe(true);
  });

  it("ne délivre jamais deux fois la même référence", async () => {
    const refs = await Promise.all(Array.from({ length: 20 }, () => nextReference(ctx.db, "quote", "DEV")));
    expect(new Set(refs).size).toBe(20);
    expect(refs).toContain(`DEV-${year}-0020`);
  });
});

describe("agenda", () => {
  let deadlineId = "";

  it("crée une échéance rattachée à une affaire et la liste avec les remises", async () => {
    expect((await admin.request("/api/admin/deadlines", { body: { title: "Date invalide", dueAt: "demain" } })).status).toBe(400);
    const created = await admin.request("/api/admin/deadlines", {
      body: { projectId: projectA, title: "Visite de site", kind: "visite", dueAt: new Date(Date.now() + 5 * DAY).toISOString() },
    });
    expect(created.status).toBe(201);
    deadlineId = created.json.deadline.id;
    const list = await admin.request("/api/admin/deadlines");
    expect(list.json.items.map((d: { id: string }) => d.id)).toContain(deadlineId);
    expect(list.json.items[0].projectReference).toBe(`TAL-${year}-0001`);
    expect(list.json.submissions.map((s: { id: string }) => s.id)).toContain(projectA);
  });

  it("modifie partiellement, marque comme faite, rouvre et supprime", async () => {
    const patched = await admin.request(`/api/admin/deadlines/${deadlineId}`, { method: "PATCH", body: { title: "Visite de site obligatoire" } });
    expect(patched.json.deadline.kind).toBe("visite");
    await admin.request(`/api/admin/deadlines/${deadlineId}/done`, { body: {} });
    expect((await admin.request("/api/admin/deadlines")).json.items).toHaveLength(0);
    expect((await admin.request("/api/admin/deadlines?faites=1")).json.items).toHaveLength(1);
    await admin.request(`/api/admin/deadlines/${deadlineId}/done`, { body: { done: false } });
    expect((await admin.request("/api/admin/deadlines")).json.items).toHaveLength(1);

    const history = await admin.request(`/api/admin/projects/${projectA}/history`);
    expect(history.json.entries.map((e: { action: string }) => e.action)).toEqual(expect.arrayContaining(["echeance.creation", "echeance.terminee", "echeance.rouverte"]));
    expect((await admin.request(`/api/admin/deadlines/${deadlineId}`, { method: "DELETE" })).status).toBe(200);
    expect((await admin.request(`/api/admin/deadlines/${deadlineId}`, { method: "DELETE" })).status).toBe(404);
  });
});

describe("fichiers", () => {
  async function requestUpload(fileName: string, size: number, projectId: string | null = projectA, kind = "plan") {
    return admin.request("/api/admin/files/upload-url", { body: { projectId, kind, fileName, sizeBytes: size, contentType: "" } });
  }

  async function upload(fileName: string, bytes: Uint8Array<ArrayBuffer>, projectId: string | null = projectA, kind = "plan") {
    const req = await requestUpload(fileName, bytes.byteLength, projectId, kind);
    expect(req.status, JSON.stringify(req.json)).toBe(201);
    expect(req.json.upload.direct).toBe(false);
    const put = await admin.request(req.json.upload.url, { method: "PUT", raw: bytes, headers: { "content-type": "application/octet-stream" } });
    expect(put.status, JSON.stringify(put.json)).toBe(200);
    const done = await admin.request(`/api/admin/files/${req.json.file.id}/complete`, { body: {} });
    return { id: req.json.file.id as string, key: req.json.file.storageKey as string, ...done };
  }

  const stored = (key: string) => existsSync(join(process.env.LOCAL_STORAGE_DIR!, key));
  let pdfId = "";

  it("refuse les formats non admis et les tailles excessives", async () => {
    const exe = await requestUpload("installeur.exe", 100);
    expect(exe.status).toBe(400);
    expect(exe.json.fields.fileName).toBeTruthy();
    expect((await requestUpload("plan.pdf", 600 * 1024 * 1024)).status).toBe(400);
    expect((await requestUpload("plan.pdf", 100, crypto.randomUUID())).status).toBe(404);
  });

  it("vérifie le type réel, calcule l'empreinte et signale les doublons", async () => {
    const pdf = await upload("Plan RDC indice A.pdf", PDF);
    expect(pdf.status).toBe(200);
    pdfId = pdf.id;
    expect(pdf.json.file).toMatchObject({ status: "verifie", mimeType: "application/pdf", sha256: createHash("sha256").update(PDF).digest("hex") });
    expect(pdf.json.duplicateOf).toBeNull();
    expect(pdf.key.startsWith(`affaires/${projectA}/${pdf.id}/`)).toBe(true);

    const copy = await upload("Plan RDC copie.pdf", PDF);
    expect(copy.json.duplicateOf).toBe("Plan RDC indice A.pdf");

    const dxf = await upload("Coupe AA.dxf", DXF);
    expect(dxf.json.file).toMatchObject({ status: "verifie", mimeType: "image/vnd.dxf" });

    const png = await upload("Façade.png", PNG);
    expect(png.json.file.mimeType).toBe("image/png");
  });

  it("refuse un contenu qui ne correspond pas à l'extension et l'efface du stockage", async () => {
    const fake = await upload("faux-plan.pdf", PNG);
    expect(fake.status).toBe(422);
    expect(fake.json.file.status).toBe("rejete");
    expect(fake.json.file.error).toMatch(/ne correspond pas/);
    expect(stored(fake.key)).toBe(false);
    expect((await admin.request(`/api/admin/files/${fake.id}/download`)).status).toBe(404);
  });

  it("refuse un envoi dont la taille diffère de l'annonce", async () => {
    const req = await requestUpload("tronque.pdf", PDF.byteLength + 10);
    const put = await admin.request(req.json.upload.url, { method: "PUT", raw: PDF, headers: { "content-type": "application/octet-stream" } });
    expect(put.status).toBe(409);
  });

  it("télécharge le fichier à l'identique, puis le supprime réellement", async () => {
    const download = await admin.request(`/api/admin/files/${pdfId}/download`);
    expect(download.status).toBe(200);
    expect(Buffer.from(download.bytes).equals(Buffer.from(PDF))).toBe(true);
    expect(download.headers.get("content-disposition")).toContain("attachment");
    expect(download.headers.get("content-disposition")).toContain(encodeURIComponent("Plan RDC indice A.pdf"));
    expect(download.headers.get("x-content-type-options")).toBe("nosniff");

    const detail = await admin.request(`/api/admin/projects/${projectA}`);
    expect(detail.json.fileCounts).toEqual([{ kind: "plan", count: 4 }]);

    const [row] = await ctx.db.select().from(schema.sourceFile).where(eq(schema.sourceFile.id, pdfId));
    expect(stored(row!.storageKey)).toBe(true);
    expect((await admin.request(`/api/admin/files/${pdfId}`, { method: "DELETE" })).status).toBe(200);
    expect(stored(row!.storageKey)).toBe(false);
    expect((await admin.request(`/api/admin/files/${pdfId}/download`)).status).toBe(404);
    const list = await admin.request(`/api/admin/files?affaire=${projectA}`);
    expect(list.json.items.map((f: { id: string }) => f.id)).not.toContain(pdfId);
  });

  it("nettoie les envois abandonnés depuis plus de 24 heures", async () => {
    const req = await requestUpload("jamais-envoye.pdf", PDF.byteLength);
    expect(await purgeAbandonedUploads(ctx.db)).toBe(0);
    // Celui-ci, et l'envoi tronqué refusé plus haut, restés « en attente ».
    const pending = await ctx.db.select().from(schema.sourceFile).where(eq(schema.sourceFile.status, "en_attente"));
    expect(pending.map((f) => f.originalName).sort()).toEqual(["jamais-envoye.pdf", "tronque.pdf"]);
    expect(await purgeAbandonedUploads(ctx.db, new Date(Date.now() + 25 * 3600 * 1000))).toBe(2);
    const [row] = await ctx.db.select().from(schema.sourceFile).where(eq(schema.sourceFile.id, req.json.file.id));
    expect(row).toMatchObject({ status: "rejete", error: "Envoi non terminé." });
    expect(row!.deletedAt).toBeTruthy();
  });

  it("classe les documents sans affaire dans la bibliothèque", async () => {
    const txt = await upload("Notes de lecture.txt", enc("Remarques sur le dossier.\n"), null, "document_technique");
    expect(txt.json.file.status).toBe("verifie");
    expect(txt.key.startsWith("bibliotheque/")).toBe(true);
    const library = await admin.request("/api/admin/files?bibliotheque=1");
    expect(library.json.items.map((f: { id: string }) => f.id)).toEqual([txt.id]);
  });

  it("journalise les téléversements, refus, téléchargements et suppressions", async () => {
    const history = await admin.request(`/api/admin/projects/${projectA}/history`);
    expect(history.json.entries.map((e: { action: string }) => e.action)).toEqual(
      expect.arrayContaining(["fichier.televerse", "fichier.refuse", "fichier.telechargement", "fichier.suppression"]),
    );
  });
});

describe("entités émettrices", () => {
  it("désigne la première entité par défaut et permet d'en changer", async () => {
    const ma = await admin.request("/api/admin/company/profiles", {
      body: { label: "Maroc", legalName: "Raison sociale de test", country: "MA", defaultCurrency: "MAD", legalIds: { ice: "000000000000000" } },
    });
    expect(ma.status).toBe(201);
    expect(ma.json.profile.isDefault).toBe(true);
    const fr = await admin.request("/api/admin/company/profiles", { body: { label: "France", legalName: "Raison sociale de test FR", country: "FR", defaultCurrency: "EUR" } });
    expect(fr.json.profile.isDefault).toBe(false);

    await admin.request(`/api/admin/company/profiles/${fr.json.profile.id}/default`, { body: {} });
    // Une entité inconnue ne modifie rien (transaction annulée).
    expect((await admin.request(`/api/admin/company/profiles/${crypto.randomUUID()}/default`, { body: {} })).status).toBe(404);
    const list = await admin.request("/api/admin/company/profiles");
    expect(list.json.items.map((p: { label: string; isDefault: boolean }) => [p.label, p.isDefault])).toEqual([
      ["France", true],
      ["Maroc", false],
    ]);

    const patched = await admin.request(`/api/admin/company/profiles/${ma.json.profile.id}`, { method: "PATCH", body: { phone: "+212 5 00 00 00 00" } });
    expect(patched.json.profile.legalIds).toEqual({ ice: "000000000000000" });
  });
});

describe("réglages et IA", () => {
  it("renvoie les valeurs par défaut, refuse une valeur invalide, enregistre une valeur valide", async () => {
    const initial = await admin.request("/api/admin/settings/ia");
    expect(initial.json.value).toMatchObject({ generationModel: "", pricing: {}, storeResponses: false });
    expect((await admin.request("/api/admin/settings/inconnu")).status).toBe(404);

    const invalid = await admin.request("/api/admin/settings/ia", { method: "PUT", body: { monthlyBudgetUsd: "beaucoup" } });
    expect(invalid.status).toBe(400);
    expect(invalid.json.fields.monthlyBudgetUsd).toBeTruthy();

    const saved = await admin.request("/api/admin/settings/ia", {
      method: "PUT",
      body: { generationModel: "modele-de-test", extractionModel: "", monthlyBudgetUsd: "50", pricing: { "modele-de-test": { input: "1.25", output: "10" } }, storeResponses: false },
    });
    expect(saved.status).toBe(200);
    expect((await admin.request("/api/admin/settings/ia")).json.value.pricing["modele-de-test"]).toEqual({ input: "1.25", cachedInput: "", output: "10" });
  });

  it("estime le coût d'après le barème saisi, jamais sans barème", async () => {
    expect(await estimateCostUsd("modele-de-test", { input: 1_000_000, cachedInput: 200_000, output: 100_000 })).toBe("2.25");
    expect(await estimateCostUsd("modele-sans-bareme", { input: 1000, cachedInput: 0, output: 1000 })).toBeNull();
  });

  it("signale l'absence de clé OpenAI sans appel externe", async () => {
    expect((await admin.request("/api/admin/ai/models")).json).toEqual({ configured: false, models: [] });
    const test = await admin.request("/api/admin/ai/test", { body: {} });
    expect(test.status).toBe(503);
    expect(test.json.error).toBe("openai_non_configure");
  });

  it("applique le plafond mensuel de dépense", async () => {
    expect((await admin.request("/api/admin/ai/spend")).json).toEqual({ monthUsd: "0", budgetUsd: "50" });
    await ctx.db.insert(schema.aiUsageRecord).values({ model: "modele-de-test", inputTokens: 1, outputTokens: 1, costUsd: "50.00" });
    await expect(assertBudget()).rejects.toBeInstanceOf(AiBudgetError);
    await ctx.db.delete(schema.aiUsageRecord);
    await expect(assertBudget()).resolves.toBeUndefined();
  });

  it("utilise le seuil d'ancienneté des prix des réglages d'alerte", async () => {
    const saved = await admin.request("/api/admin/settings/alertes", { method: "PUT", body: { stalePriceMonths: 6, deadlineReminderDays: [7, 3, 1] } });
    expect(saved.status).toBe(200);
    const dashboard = await admin.request("/api/admin/dashboard");
    expect(dashboard.json.alerts.stalePriceMonths).toBe(6);
    expect(dashboard.json.projects.open).toBe(2);
    expect(dashboard.json.projects.byTrade).toEqual([{ trade: "gros_oeuvre", count: 1 }]);
    expect(dashboard.json.projects.estimates).toEqual([{ currency: "MAD", total: "1250000.50", projects: 1 }]);
  });
});

describe("rappels et tâche planifiée", () => {
  it("refuse la tâche planifiée sans le secret", async () => {
    const visitor = new TestBrowser(ctx.app, "192.0.2.20");
    expect((await visitor.request("/api/jobs/cron")).status).toBe(403);
    expect((await visitor.request("/api/jobs/cron", { headers: { authorization: "Bearer mauvais-secret" } })).status).toBe(403);
  });

  it("crée chaque rappel une seule fois par palier", async () => {
    const cron = new TestBrowser(ctx.app, "192.0.2.21");
    const first = await cron.request("/api/jobs/cron", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
    expect(first.status).toBe(200);
    // Remise de l'affaire A dans deux jours : palier J-3.
    expect(first.json.reminders).toBe(1);
    const second = await cron.request("/api/jobs/cron", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
    expect(second.json.reminders).toBe(0);

    const list = await admin.request("/api/admin/notifications");
    expect(list.json.unread).toBe(1);
    const [n] = list.json.items;
    expect(n.title).toBe(`Remise TAL-${year}-0001, Affaire test A (révisée) : dans 2 jours`);
    expect(n.body).toMatch(/^Échéance le .+ \(heure du Maroc\)\.$/);
    expect(n.link).toBe(`/administration/affaires/${projectA}`);
  });

  it("passe au palier suivant quand l'échéance approche", async () => {
    const tomorrow = new Date(new Date(deadlineA).getTime() - DAY);
    expect(await generateDeadlineReminders(ctx.db, tomorrow)).toBe(1);
    expect(await generateDeadlineReminders(ctx.db, tomorrow)).toBe(0);
    const sameDay = new Date(new Date(deadlineA).getTime() - 3600 * 1000 * 0.5);
    expect(await generateDeadlineReminders(ctx.db, sameDay)).toBe(1);
    const titles = (await ctx.db.select().from(schema.notification)).map((n) => n.title);
    expect(titles.some((t) => t.endsWith(": demain"))).toBe(true);
    expect(titles.some((t) => t.endsWith(": aujourd’hui"))).toBe(true);
  });

  it("marque les notifications comme lues", async () => {
    const list = await admin.request("/api/admin/notifications");
    await admin.request(`/api/admin/notifications/${list.json.items[0].id}/read`, { body: {} });
    expect((await admin.request("/api/admin/notifications")).json.unread).toBe(list.json.unread - 1);
    await admin.request("/api/admin/notifications/read-all", { body: {} });
    expect((await admin.request("/api/admin/notifications")).json.unread).toBe(0);
  });
});

describe("supervision et sauvegarde", () => {
  it("teste les connexions sans jamais exposer de secret", async () => {
    const status = await admin.request("/api/admin/system/status");
    expect(status.json).toMatchObject({ environment: "developpement", database: "locale", openai: false, storage: "local", cron: true });
    const test = await admin.request("/api/admin/system/connections/test", { body: {} });
    expect(test.json.database.ok).toBe(true);
    expect(test.json.storage.ok).toBe(true);
    expect(test.json.openai).toMatchObject({ ok: false, error: "Clé non configurée." });
    expect(JSON.stringify(test.json)).not.toContain(CRON_SECRET);
  });

  it("exporte les données métier, jamais les données d'authentification", async () => {
    const res = await admin.request("/api/admin/system/export");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="talab-sauvegarde-/);
    expect(res.json.format).toBe("talab-intelligence/export");
    expect(res.json.tables.project).toHaveLength(2);
    expect(res.json.tables.client).toHaveLength(2);
    for (const secret of ["user", "session", "account", "verification", "two_factor", "passkey", "rate_limit"]) expect(res.json.tables[secret]).toBeUndefined();
    const text = new TextDecoder().decode(res.bytes);
    expect(text).not.toMatch(/"password"/);
  });

  it("filtre le journal", async () => {
    const security = await admin.request("/api/admin/system/audit?filtre=securite");
    expect(security.json.entries.length).toBeGreaterThan(0);
    expect(security.json.entries.every((e: { action: string }) => /^(connexion|deconnexion|securite|sessions|compte|acces)\./.test(e.action))).toBe(true);
    const files = await admin.request("/api/admin/system/audit?action=fichier.");
    expect(files.json.entries.every((e: { action: string }) => e.action.startsWith("fichier."))).toBe(true);
    const byEntity = await admin.request(`/api/admin/system/audit?entite=${clientId}`);
    expect(byEntity.json.entries.map((e: { action: string }) => e.action)).toEqual(expect.arrayContaining(["client.creation", "client.archivage", "client.restauration"]));
  });
});
