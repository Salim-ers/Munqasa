/**
 * Parcours complet de l'administration dans un vrai navigateur : connexion et double authentification,
 * affaire (lots, échéances, documents, historique), clients, prospects, agenda, paramètres, système,
 * notifications, affichage téléphone. Aucune donnée n'est simulée : tout passe par l'API.
 */
import { createHmac } from "node:crypto";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { E2E } from "./constants.ts";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108020000009077" + "53de0000000c4944415408d763f8cfc0000003010100" + "18dd8db00000000049454e44ae426082", "hex");

function totp(secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret.replace(/\s|=/g, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

/** Date locale au format des champs datetime-local, dans n jours à 10 h. */
function localInput(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
}

test.describe.serial("administration", () => {
  let context: BrowserContext;
  let page: Page;
  const problems: string[] = [];
  let projectUrl = "";

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    page = await context.newPage();
    page.on("pageerror", (error) => problems.push(`exception : ${error.message}`));
    page.on("console", (message) => {
      // Les réponses HTTP en erreur attendues (session absente, fichier refusé) sont journalisées par le navigateur.
      if (message.type() === "error" && !/Failed to load resource/.test(message.text())) problems.push(`console : ${message.text()}`);
    });
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("refuse l'accès sans session puis ouvre une session avec double authentification", async () => {
    await page.goto("/administration/dashboard");
    await expect(page).toHaveURL(/\/administration\/connexion/);
    expect((await page.request.get("/api/admin/projects")).status()).toBe(401);

    await page.getByLabel("Adresse e-mail").fill(E2E.email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(E2E.password);
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page).toHaveURL(/double-authentification/);

    await page.getByLabel("Confirmez votre mot de passe").fill(E2E.password);
    await page.getByRole("button", { name: /Continuer|Activer/ }).click();
    const secret = (await page.locator("p.font-mono").first().textContent())!.replace(/\s/g, "");
    await page.getByLabel("Code à 6 chiffres").fill(totp(secret));
    await expect(page.getByText("Vos codes de secours")).toBeVisible();
    await page.getByText("J’ai conservé mes codes de secours en lieu sûr").click();
    await page.getByRole("button", { name: "Accéder au tableau de bord" }).click();
    await expect(page).toHaveURL(/\/administration\/dashboard/);
    await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
  });

  test("crée une affaire depuis le tableau de bord", async () => {
    await page.getByRole("button", { name: "Nouvelle affaire" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Nouvelle affaire" });
    await dialog.getByRole("button", { name: /Créer l.affaire/ }).click();
    await expect(dialog.getByText("Champ obligatoire.")).toBeVisible();

    await dialog.getByLabel("Intitulé de l’affaire").fill("Construction d’un groupe scolaire");
    await dialog.getByLabel("Ville").fill("Rabat");
    await dialog.getByLabel("Date limite de remise").fill(localInput(2));
    await dialog.getByLabel(/Estimation/).fill("12 500 000,50");
    await dialog.getByLabel("Description").fill("Opération de test de bout en bout.");
    await dialog.getByRole("button", { name: /Créer l.affaire/ }).click();

    await expect(page).toHaveURL(/\/administration\/affaires\/[0-9a-f-]{36}$/);
    projectUrl = page.url();
    const year = new Date().getFullYear();
    await expect(page.getByText(`TAL-${year}-0001`).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Construction d’un groupe scolaire" })).toBeVisible();
    await expect(page.getByText(/12\s500\s000,50/).first()).toBeVisible();
  });

  test("ajoute un lot, une échéance, et change le statut", async () => {
    await page.getByRole("tab", { name: /Lots/ }).click();
    await page.getByRole("button", { name: "Ajouter un lot" }).click();
    const lot = page.getByRole("dialog", { name: "Nouveau lot" });
    await expect(lot.getByLabel("Code")).toHaveValue("01");
    await lot.getByLabel("Intitulé").fill("Gros œuvre");
    await lot.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByRole("tabpanel").getByText("Gros œuvre", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: /Échéances/ }).click();
    await page.getByRole("tabpanel").getByRole("button", { name: "Ajouter" }).click();
    const deadline = page.getByRole("dialog", { name: "Nouvelle échéance" });
    await deadline.getByLabel("Intitulé").fill("Visite des lieux obligatoire");
    await deadline.getByLabel("Type").selectOption("visite");
    await deadline.getByLabel("Date et heure").fill(localInput(5));
    await deadline.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByRole("tabpanel").getByText("Visite des lieux obligatoire")).toBeVisible();
    await expect(page.getByRole("tabpanel").getByText("Remise des offres").first()).toBeVisible();

    await page.getByLabel("Statut de l’affaire").selectOption("chiffrage");
    await expect(page.getByText("Statut : Chiffrage.")).toBeVisible();
  });

  test("téléverse un plan, refuse un faux PDF, télécharge le fichier à l'identique", async () => {
    await page.getByRole("tab", { name: /Documents/ }).click();
    const input = page.locator('input[type="file"]');
    await input.setInputFiles([{ name: "Plan RDC indice A.pdf", mimeType: "application/pdf", buffer: PDF }]);
    await expect(page.getByText("Vérifié").first()).toBeVisible();
    await expect(page.getByRole("tabpanel").getByText("Plan RDC indice A.pdf").first()).toBeVisible();

    await input.setInputFiles([{ name: "faux-plan.pdf", mimeType: "application/pdf", buffer: PNG }]);
    await expect(page.getByText(/ne correspond pas à l’extension/).first()).toBeVisible();

    await input.setInputFiles([{ name: "macro.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") }]);
    await expect(page.getByText("Format non accepté (.exe).")).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Télécharger Plan RDC indice A.pdf" }).click()]);
    expect(download.suggestedFilename()).toBe("Plan RDC indice A.pdf");
    const path = await download.path();
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(path).equals(PDF)).toBe(true);

    await page.getByRole("tab", { name: "Historique" }).click();
    for (const label of ["Affaire créée", "Lot ajouté", "Échéance ajoutée", "Statut modifié", "Fichier téléversé", "Fichier refusé", "Fichier téléchargé"]) {
      await expect(page.getByRole("tabpanel").getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test("lit les plans avec l'agent et valide le métré proposé", async () => {
    const { PDFDocument, StandardFonts } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage([842, 595]).drawText("Plan de fondations", { x: 50, y: 500, size: 18, font });
    const plan = Buffer.from(await pdf.save());

    await page.goto(`${projectUrl}?onglet=documents`);
    await page.locator('input[type="file"]').setInputFiles([{ name: "Fondations.pdf", mimeType: "application/pdf", buffer: plan }]);
    await expect(page.getByRole("tabpanel").getByText("Fondations.pdf").first()).toBeVisible();

    await page.getByRole("tab", { name: "Plans et métré" }).click();
    await page.getByRole("tabpanel").getByRole("button", { name: "Lancer la lecture" }).click();
    const dialog = page.getByRole("dialog", { name: "Lecture des plans et métré" });
    await expect(dialog.getByRole("checkbox", { name: /Fondations\.pdf/ })).toBeChecked();
    await expect(dialog.getByRole("button", { name: "Lancer la lecture" })).toBeDisabled();
    await dialog.getByText(/J’accepte que les pages sélectionnées soient transmises/).click();
    await dialog.getByRole("button", { name: "Lancer la lecture" }).click();

    await expect(page.getByText("Terminé").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Béton armé pour semelles filantes")).toBeVisible();
    await expect(page.getByText(/10,2 m3/).first()).toBeVisible();
    await page.getByRole("button", { name: "Valider" }).first().click();
    await expect(page.getByText("Vérifié").first()).toBeVisible();

    await page.goto("/administration/agents");
    await expect(page.getByText("Lecture des plans et métré").first()).toBeVisible();
    await expect(page.getByText("Mode simulation")).toBeVisible();
  });

  test("rédige un CCTP avec l'agent, le relit et l'exporte en Word", async () => {
    await page.goto("/administration/referentiel");
    await page.getByRole("button", { name: "Catalogue de départ" }).click();
    await expect(page.getByText(/référence\(s\) ajoutée\(s\), à vérifier/)).toBeVisible();
    const rps = page.getByRole("listitem").filter({ hasText: "RPS 2000" });
    await rps.getByRole("button", { name: "Vérifiée" }).click();
    await expect(rps.getByText("Vérifié", { exact: true })).toBeVisible();

    await page.goto(`${projectUrl}?onglet=cctp`);
    await page.getByRole("button", { name: "Rédiger un CCTP" }).click();
    const dialog = page.getByRole("dialog", { name: "Rédaction du CCTP" });
    await expect(dialog.getByRole("checkbox", { name: /RPS 2000/ })).toBeChecked();
    await dialog.getByText(/J’accepte que les informations de l’affaire/).click();
    await dialog.getByRole("button", { name: "Rédiger le CCTP" }).click();

    const document = page.getByRole("button", { name: /CCTP, lot 01 Gros œuvre/ });
    await expect(document).toBeVisible({ timeout: 30_000 });
    await document.click();
    await expect(page.getByRole("heading", { name: "1.1 Objet du présent CCTP" })).toBeVisible();
    await expect(page.getByText(/Les travaux sont exécutés conformément à/).first()).toBeVisible();
    await page.getByRole("button", { name: "Valider", exact: true }).first().click();
    await expect(page.getByText(/1 validé\(s\)/)).toBeVisible();

    await page.getByRole("button", { name: "Télécharger" }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Télécharger en Word" }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.docx$/);
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(await download.path()).subarray(0, 2).toString()).toBe("PK");
    await page.getByRole("button", { name: "Télécharger" }).click();
    const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Télécharger en PDF" }).click()]);
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
    expect(readFileSync(await pdf.path()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("établit la DPGF depuis le CCTP, la chiffre et l'exporte en Excel", async () => {
    await page.goto(`${projectUrl}?onglet=dpgf`);
    await page.getByRole("button", { name: "Établir une DPGF" }).click();
    const dialog = page.getByRole("dialog", { name: "DPGF depuis le CCTP" });
    await expect(dialog.getByLabel("CCTP source")).not.toHaveValue("");
    await dialog.getByLabel(/Taux de TVA/).fill("20");
    await dialog.getByText(/J’accepte que le CCTP et le métré/).click();
    await dialog.getByRole("button", { name: "Établir la DPGF" }).click();

    const document = page.getByRole("button", { name: /DPGF, lot 01 Gros œuvre/ });
    await expect(document).toBeVisible({ timeout: 30_000 });
    await document.click();
    const row = page.getByRole("row", { name: /Béton armé pour semelles filantes/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("Métré : 1 mesure(s), dont 1 vérifiée(s)")).toBeVisible();
    await row.getByRole("button", { name: /Prix unitaire/ }).click();
    await row.getByRole("textbox", { name: "Prix unitaire" }).fill("1250,5");
    await row.getByRole("textbox", { name: "Prix unitaire" }).press("Enter");
    await expect(row.getByText(/12\s755,10\sMAD/)).toBeVisible();
    await expect(page.getByText(/15\s306,12\sMAD/)).toBeVisible();

    await page.getByRole("button", { name: "Télécharger" }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "DPGF, Excel" }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
    await page.getByRole("button", { name: "Télécharger" }).click();
    const [bpu] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Bordereau des prix (BPU), PDF" }).click()]);
    expect(bpu.suggestedFilename()).toMatch(/BPU.*\.pdf$/);
  });

  test("importe des prix, établit les sous-détails avec l'agent et reporte le prix validé dans la DPGF", async () => {
    await page.goto("/administration/bibliotheque");
    await expect(page.getByText("Bibliothèque vide")).toBeVisible();
    await page.getByRole("button", { name: "Importer un fichier" }).first().click();
    const importer = page.getByRole("dialog", { name: "Importer des prix" });
    const csv = [
      "Désignation;Unité;Prix unitaire;Nature",
      "Béton C25/30 prêt à l’emploi pour semelles;m3;980,00;Matériau",
      "Acier HA FeE500 façonné pour béton armé;kg;14,50;Matériau",
      "Main-d’œuvre maçon qualifié, béton armé;h;65;Main-d’œuvre",
      ";m3;12;",
    ].join("\r\n");
    await importer.locator('input[type="file"]').setInputFiles({ name: "prix.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8") });
    await importer.getByRole("button", { name: "Importer 4 ligne(s)" }).click();
    await expect(importer.getByText("3 prix importé(s)")).toBeVisible();
    await expect(importer.getByText("Ligne 5 : désignation vide")).toBeVisible();
    await importer.getByRole("button", { name: "Fermer" }).last().click();
    await expect(page.getByRole("table", { name: "Prix de la bibliothèque" }).getByRole("row")).toHaveCount(4);
    await page.getByRole("button", { name: "Marquer Béton C25/30 prêt à l’emploi pour semelles comme vérifié" }).click();
    await expect(page.getByRole("row", { name: /Béton C25\/30/ }).getByText("Vérifié", { exact: true })).toBeVisible();

    await page.goto("/administration/parametres?onglet=chiffrage");
    await page.getByLabel("Frais généraux (%)").fill("10");
    await page.getByLabel("Aléas (%)").fill("2");
    await page.getByLabel("Taux de marge (%)").fill("8");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Réglages de chiffrage enregistrés pour les prochains sous-détails.")).toBeVisible();

    await page.goto("/administration/agents");
    await expect(page.getByText("3 prix utilisables, dont 1 vérifié.")).toBeVisible();

    await page.goto(`${projectUrl}?onglet=sousdetails`);
    await page.getByRole("button", { name: "Lancer l’agent" }).click();
    const launch = page.getByRole("dialog", { name: "Sous-détails de prix" });
    await launch.getByText(/J’accepte que les postes de la DPGF/).click();
    await launch.getByRole("button", { name: "Établir 2 sous-détail(s)" }).click();

    // Béton 1,05 × 980 × 1,05, acier 1,05 × 14,50 × 1,05, maçon 2,5 × 65 ; frais 12 % ; marge 8 %.
    const poste = page.getByRole("button", { name: /Béton armé pour semelles filantes/ });
    await expect(poste).toContainText(/1\s522,81\sMAD/, { timeout: 30_000 });
    await poste.click();
    const editor = page.getByRole("dialog", { name: /Béton armé pour semelles filantes/ });
    await expect(editor.getByText("Hypothèse", { exact: true })).toHaveCount(3);
    await editor.getByRole("button", { name: "Valider le sous-détail" }).click();
    await expect(page.getByText("Sous-détail validé et figé.")).toBeVisible();
    await editor.getByRole("button", { name: "Fermer" }).last().click();

    await page.getByRole("button", { name: "Reporter 1 prix validé(s)" }).click();
    await page.getByRole("dialog", { name: "Reporter les prix validés ?" }).getByRole("button", { name: "Reporter" }).click();
    await expect(page.getByText("1 prix reporté(s) dans la DPGF.")).toBeVisible();
    await page.getByRole("button", { name: "Télécharger les sous-détails" }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Télécharger en Excel" }).click()]);
    expect(download.suggestedFilename()).toMatch(/Sous-détails.*\.xlsx$/);

    await page.getByRole("link", { name: "Ouvrir la DPGF" }).click();
    const row = page.getByRole("row", { name: /Béton armé pour semelles filantes/ });
    await expect(row.getByText("Sous-détail validé")).toBeVisible();
    await expect(row.getByText(/15\s532,66\sMAD/)).toBeVisible();
  });

  test("crée un client puis une affaire qui lui est rattachée", async () => {
    await page.goto("/administration/clients");
    await page.getByRole("button", { name: "Nouveau client" }).click();
    const dialog = page.getByRole("dialog", { name: "Nouveau client" });
    await dialog.getByLabel("Nom ou raison sociale").fill("Maître d’ouvrage de test");
    await dialog.getByLabel("Secteur").selectOption("public");
    await dialog.getByLabel("Ville").fill("Casablanca");
    await dialog.getByLabel("ICE").fill("000000000000000");
    await dialog.getByRole("button", { name: "Créer le client" }).click();
    await expect(page).toHaveURL(/\/administration\/clients\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Maître d’ouvrage de test" })).toBeVisible();
    await expect(page.getByText("000000000000000")).toBeVisible();

    await page.getByRole("button", { name: "Nouvelle affaire" }).click();
    const project = page.getByRole("dialog", { name: "Nouvelle affaire" });
    await expect(project.getByLabel(/^Client/)).not.toHaveValue("");
    await project.getByLabel("Intitulé de l’affaire").fill("Réhabilitation d’un centre de santé");
    await project.getByRole("button", { name: /Créer l.affaire/ }).click();
    await expect(page.getByText("Maître d’ouvrage de test").first()).toBeVisible();
    await expect(page.getByText(`TAL-${new Date().getFullYear()}-0002`).first()).toBeVisible();
  });

  test("liste, recherche et filtre les affaires", async () => {
    await page.goto("/administration/affaires");
    await expect(page.getByRole("table", { name: "Affaires" }).getByRole("row")).toHaveCount(3);
    await page.getByLabel("Rechercher une affaire").fill("santé");
    await expect(page.getByRole("table", { name: "Affaires" }).getByRole("row")).toHaveCount(2);
    await expect(page).toHaveURL(/q=sant/);
    await page.getByLabel("Rechercher une affaire").fill("");
    await page.locator("#filtre-statut").selectOption("chiffrage");
    await expect(page.getByRole("table", { name: "Affaires" }).getByText("Construction d’un groupe scolaire")).toBeVisible();
    await expect(page.getByRole("table", { name: "Affaires" }).getByRole("row")).toHaveCount(2);
  });

  test("ajoute un prospect et le convertit en client", async () => {
    await page.goto("/administration/prospects");
    await page.getByRole("button", { name: "Nouveau prospect" }).click();
    const dialog = page.getByRole("dialog", { name: "Nouveau prospect" });
    await dialog.getByLabel("Nom du contact").fill("Contact commercial");
    await dialog.getByLabel("Entreprise ou organisme").fill("Promoteur de test");
    await dialog.getByRole("button", { name: "Ajouter" }).click();
    const row = page.getByRole("row", { name: /Promoteur de test/ });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Convertir en client" }).click();
    await page.getByRole("dialog", { name: "Convertir en client" }).getByRole("button", { name: "Créer le client" }).click();
    await expect(row.getByText("Converti en client")).toBeVisible();
  });

  test("affiche l'agenda et les rappels de la tâche planifiée", async () => {
    await page.goto("/administration/agenda");
    await expect(page.getByText("Visite des lieux obligatoire")).toBeVisible();
    await expect(page.getByText("Remise des offres").first()).toBeVisible();

    // Point de départ : tout est lu (les traitements précédents ont créé leurs propres notifications).
    expect((await page.request.post("/api/admin/notifications/read-all", { headers: { origin: E2E.baseUrl }, data: {} })).status()).toBe(200);
    const cron = await page.request.get("/api/jobs/cron", { headers: { authorization: `Bearer ${E2E.cronSecret}` } });
    expect(cron.status()).toBe(200);
    expect((await cron.json()).reminders).toBe(2);
    expect((await page.request.get("/api/jobs/cron")).status()).toBe(403);

    await page.reload();
    const bell = page.getByRole("button", { name: /Notifications, 2 non lues/ });
    await expect(bell).toBeVisible();
    await bell.click();
    await page.getByRole("button", { name: /Remise TAL-\d{4}-0001/ }).click();
    await expect(page).toHaveURL(projectUrl);
    await expect(page.getByRole("button", { name: /Notifications, 1 non lue$/ })).toBeVisible();
  });

  test("renseigne les paramètres", async () => {
    await page.goto("/administration/parametres");
    await page.getByRole("button", { name: "Ajouter une entité" }).click();
    const entity = page.getByRole("dialog", { name: "Nouvelle entité émettrice" });
    await entity.getByLabel("Nom court").fill("Entité Maroc");
    await entity.getByLabel("Raison sociale").fill("Raison sociale de test");
    await entity.getByLabel("Taux de TVA par défaut (%)").fill("20");
    await entity.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText("Par défaut", { exact: true })).toBeVisible();
    await expect(page.getByText("20 %", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Identité documentaire" }).click();
    await page.getByLabel("Texte de pied de page").fill("Talab Solutions, études et chiffrage");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Identité documentaire enregistrée.")).toBeVisible();

    await page.getByRole("tab", { name: "Intelligence artificielle" }).click();
    await expect(page.getByText(/La clé OpenAI n’est pas configurée/)).toBeVisible();

    await page.getByRole("tab", { name: "Alertes" }).click();
    await page.getByLabel("Ajouter un rappel (jours avant)").fill("10");
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(page.getByText("10 jours avant")).toBeVisible();
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Réglages d’alerte enregistrés.")).toBeVisible();
  });

  test("teste les connexions, exporte la sauvegarde, filtre le journal", async () => {
    await page.goto("/administration/systeme");
    await page.getByRole("button", { name: "Tester les connexions" }).click();
    await expect(page.getByText(/PostgreSQL local, \d+ ms/)).toBeVisible();
    await expect(page.getByText(/Dossier local, \d+ ms/)).toBeVisible();
    await expect(page.getByText("Clé non configurée.")).toBeVisible();

    await page.getByRole("tab", { name: "Sauvegarde" }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Télécharger la sauvegarde" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^talab-sauvegarde-.+\.json$/);
    const { readFileSync } = await import("node:fs");
    const backup = JSON.parse(readFileSync(await download.path(), "utf8"));
    expect(backup.tables.project).toHaveLength(2);
    expect(backup.tables.user).toBeUndefined();

    await page.getByRole("tab", { name: "Journal" }).click();
    await page.getByRole("radio", { name: "Fichiers" }).click();
    await expect(page.getByText("Fichier téléversé").first()).toBeVisible();
    await expect(page.getByText("Affaire créée")).toHaveCount(0);
  });

  test("charge une source publique de prix, examine la quarantaine et consulte une fiche", async () => {
    await page.goto("/administration/bibliotheque");
    await page.getByRole("button", { name: "Sources publiques" }).first().click();
    const sources = page.getByRole("dialog", { name: "Sources publiques de prix" });
    await sources.getByRole("button", { name: /Charger 74 références/ }).click();
    await expect(sources.getByText(/2 valeurs attendent votre décision/)).toBeVisible({ timeout: 60_000 });
    await sources.getByRole("button", { name: "Examiner" }).click();
    const review = page.getByRole("dialog", { name: "Valeurs en quarantaine" });
    await expect(review.getByText("Région Nouvelle-Calédonie, 2021").first()).toBeVisible();
    await review.getByText(/Tout sélectionner sur cette page/).click();
    await review.getByRole("button", { name: "Écarter la sélection" }).click();
    await expect(page.getByText("Valeurs écartées : la valeur publiée reste celle d’avant.")).toBeVisible();
    await expect(review.getByText("Plus rien en attente")).toBeVisible();
    await review.getByRole("button", { name: "Fermer" }).click();
    await expect(review).toBeHidden();
    await sources.getByRole("button", { name: "Fermer" }).click();
    await expect(sources).toBeHidden();

    await page.getByRole("radio", { name: "France, EUR" }).click();
    const ratio = page.getByRole("row", { name: /Prix de revient médian d’une opération de construction de logements sociaux, au m² de surface utile/ }).first();
    await expect(ratio).toBeVisible();
    await ratio.click();
    const fiche = page.getByRole("dialog", { name: /Prix de revient médian/ });
    await expect(fiche.getByText("Ratio d’opération", { exact: true })).toBeVisible();
    await expect(fiche.getByRole("link", { name: /Licence Ouverte/ })).toBeVisible();
    await fiche.getByRole("tab", { name: "Comparaison" }).click();
    await expect(fiche.getByText(/déclinaisons\. Ce prix est/)).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("rapproche les postes de la DPGF avec la bibliothèque, sans rien appliquer d'office", async () => {
    await page.goto(`${projectUrl}?onglet=dpgf`);
    await page.getByRole("button", { name: /DPGF, lot 01 Gros œuvre/ }).first().click();
    await page.getByRole("button", { name: "Prix de la bibliothèque" }).click();
    const dialog = page.getByRole("dialog", { name: "Prix de la bibliothèque" });
    await dialog.getByRole("radio", { name: "Tous les postes" }).click();
    // Bibliothèque marocaine sans prix d'ouvrage posé : chaque poste reste à chiffrer, et c'est dit.
    await expect(dialog.getByText("Prix non disponible dans la bibliothèque : à chiffrer par sous-détail ou par saisie.").first()).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Appliquer" })).toBeDisabled();
    await page.keyboard.press("Escape");
  });

  test("génère le dossier complet et affiche son niveau de validation", async () => {
    await page.goto(`${projectUrl}?onglet=dossier`);
    await expect(page.getByText("Niveau du dossier")).toBeVisible();
    await page.getByRole("button", { name: "Générer le dossier" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Générer le dossier" });
    await dialog.getByLabel("Taux de TVA de la DPGF, en %").fill("20");
    await dialog.getByText(/J’accepte que les pages des plans choisis/).click();
    await dialog.getByRole("button", { name: "Générer le dossier" }).click();
    await expect(page.getByText(/Dernier contrôle le/)).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText("Contrôle indépendant : Contrôles qualité et niveau de validation")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Niveau du dossier" }).or(page.getByText("Niveau du dossier")).first()).toBeVisible();
    await expect(page.getByText(/Reste à faire :/).first()).toBeVisible();
  });

  test("s'affiche sans débordement sur téléphone", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const project = new URL(projectUrl).pathname;
    const overflows: string[] = [];
    for (const path of [
      "/administration/dashboard",
      "/administration/affaires",
      project,
      `${project}?onglet=dossier`,
      `${project}?onglet=metre`,
      `${project}?onglet=cctp`,
      `${project}?onglet=dpgf`,
      `${project}?onglet=sousdetails`,
      "/administration/agents",
      "/administration/bibliotheque",
      "/administration/referentiel",
      "/administration/agenda",
      "/administration/parametres",
      "/administration/parametres?onglet=chiffrage",
      "/administration/systeme",
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) overflows.push(`${path} : ${overflow} px`);
    }
    expect(overflows).toEqual([]);
    await page.goto("/administration/affaires");
    await expect(page.getByRole("list", { name: "Affaires" }).getByText("Construction d’un groupe scolaire")).toBeVisible();
  });

  test("ne produit aucune erreur dans le navigateur", () => {
    expect(problems).toEqual([]);
  });
});
