/** Libellés du journal d'audit et résumé lisible des détails enregistrés. */
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "../../shared/enums";
import { formatBytes } from "./format";

export const ACTION_LABELS: Record<string, string> = {
  // Connexion et sécurité
  "connexion.mot_de_passe.reussite": "Connexion par mot de passe",
  "connexion.mot_de_passe.second_facteur_requis": "Mot de passe correct, second facteur demandé",
  "connexion.mot_de_passe.echec": "Échec de connexion (mot de passe)",
  "connexion.second_facteur.reussite": "Second facteur validé",
  "connexion.second_facteur.echec": "Second facteur refusé",
  "connexion.code_de_secours.reussite": "Connexion par code de secours",
  "connexion.code_de_secours.echec": "Code de secours refusé",
  "connexion.passkey.reussite": "Connexion par passkey",
  "connexion.passkey.echec": "Passkey refusée",
  "deconnexion.reussite": "Déconnexion",
  "sessions.revocation_toutes.reussite": "Toutes les sessions fermées",
  "sessions.revocation_autres.reussite": "Autres sessions fermées",
  "sessions.revocation.reussite": "Session fermée",
  "sessions.revoquees_en_ligne_de_commande": "Sessions fermées en ligne de commande",
  "securite.2fa_activation_demandee.reussite": "Activation de la double authentification",
  "securite.2fa_desactivation.reussite": "Double authentification désactivée",
  "securite.codes_de_secours_regeneres.reussite": "Codes de secours régénérés",
  "securite.passkey_ajoutee.reussite": "Passkey ajoutée",
  "securite.passkey_supprimee.reussite": "Passkey supprimée",
  "securite.mot_de_passe_modifie.reussite": "Mot de passe modifié",
  "securite.mot_de_passe_modifie.echec": "Échec de modification du mot de passe",
  "acces.refuse": "Accès refusé",
  "compte.creation_refusee": "Création de compte refusée",
  "compte.cree_en_ligne_de_commande": "Compte créé en ligne de commande",
  "compte.mot_de_passe_reinitialise_en_ligne_de_commande": "Mot de passe réinitialisé en ligne de commande",
  "compte.2fa_reinitialisee_en_ligne_de_commande": "Double authentification réinitialisée en ligne de commande",
  "compte.cree_au_deploiement": "Compte créé au déploiement",
  "compte.mot_de_passe_initial_au_deploiement": "Mot de passe initial mis à jour au déploiement",
  // Affaires
  "affaire.creation": "Affaire créée",
  "affaire.modification": "Affaire modifiée",
  "affaire.changement_statut": "Statut modifié",
  "affaire.lot_ajoute": "Lot ajouté",
  "affaire.lot_modifie": "Lot modifié",
  "affaire.lot_supprime": "Lot supprimé",
  "echeance.creation": "Échéance ajoutée",
  "echeance.modification": "Échéance modifiée",
  "echeance.terminee": "Échéance terminée",
  "echeance.rouverte": "Échéance rouverte",
  "echeance.suppression": "Échéance supprimée",
  "fichier.televerse": "Fichier téléversé",
  "fichier.refuse": "Fichier refusé",
  "fichier.telechargement": "Fichier téléchargé",
  "fichier.suppression": "Fichier supprimé",
  // Clients et prospects
  "client.creation": "Client créé",
  "client.modification": "Client modifié",
  "client.archivage": "Client archivé",
  "client.restauration": "Client restauré",
  "prospect.creation": "Prospect créé",
  "prospect.modification": "Prospect modifié",
  "prospect.conversion": "Prospect converti en client",
  // Réglages et système
  "entreprise.creation": "Entité émettrice créée",
  "entreprise.modification": "Entité émettrice modifiée",
  "entreprise.entite_par_defaut": "Entité par défaut modifiée",
  "reglages.ia": "Paramètres IA modifiés",
  "reglages.identite_documentaire": "Identité documentaire modifiée",
  "reglages.alertes": "Réglages d’alerte modifiés",
  "ia.test_connexion": "Essai de l’API OpenAI",
  "systeme.test_connexions": "Essai des connexions",
  "systeme.export_donnees": "Sauvegarde exportée",
  "systeme.tache_planifiee": "Tâche planifiée exécutée",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** Noms de champs lisibles (modifications enregistrées au journal). */
const FIELD_LABELS: Record<string, string> = {
  name: "intitulé",
  clientId: "client",
  country: "pays",
  city: "ville",
  siteAddress: "adresse du site",
  marketType: "type de marché",
  sector: "secteur",
  worksNature: "nature des travaux",
  designPhase: "phase",
  currency: "devise",
  submissionDeadline: "date de remise",
  startDate: "démarrage",
  description: "description",
  hypotheses: "hypothèses",
  constraints: "contraintes",
  manualEstimate: "estimation",
  status: "statut",
  legalForm: "forme juridique",
  address: "adresse",
  contactName: "interlocuteur",
  email: "e-mail",
  phone: "téléphone",
  legalIds: "identifiants légaux",
  notes: "notes",
  company: "entreprise",
  source: "origine",
  label: "nom court",
  legalName: "raison sociale",
  tradeName: "nom commercial",
  postalCode: "code postal",
  website: "site web",
  defaultCurrency: "devise par défaut",
  defaultVatRate: "taux de TVA",
  quoteLegalMentions: "mentions légales",
  paymentTerms: "conditions de paiement",
};

/** Résumé des détails d'une entrée (fichier, lot, statut, champs modifiés…). */
export function describeDetails(details: Record<string, unknown> | null | undefined): string {
  if (!details) return "";
  const parts: string[] = [];
  const d = details as Record<string, unknown>;
  if (typeof d.reference === "string") parts.push(d.reference);
  if (typeof d.nom === "string") parts.push(d.nom);
  if (typeof d.lot === "string") parts.push(`Lot ${d.lot}`);
  if (typeof d.titre === "string") parts.push(d.titre);
  if (typeof d.fichier === "string") parts.push(d.fichier);
  if (typeof d.taille === "number") parts.push(formatBytes(d.taille));
  if (typeof d.motif === "string") parts.push(d.motif);
  if (typeof d.entite === "string") parts.push(d.entite);
  if (typeof d.statut === "string") parts.push(`Nouveau statut : ${PROJECT_STATUS_LABELS[d.statut as ProjectStatus] ?? d.statut}`);
  else if (Array.isArray(d.champs) && d.champs.length) parts.push(`Champs : ${d.champs.map((c) => FIELD_LABELS[String(c)] ?? String(c)).join(", ")}`);
  if (typeof d.rappels === "number") parts.push(`${d.rappels} rappel${d.rappels > 1 ? "s" : ""} créé${d.rappels > 1 ? "s" : ""}`);
  if (typeof d.envoisAbandonnes === "number" && d.envoisAbandonnes > 0) parts.push(`${d.envoisAbandonnes} envoi${d.envoisAbandonnes > 1 ? "s" : ""} abandonné${d.envoisAbandonnes > 1 ? "s" : ""} nettoyé${d.envoisAbandonnes > 1 ? "s" : ""}`);
  if (typeof d.tables === "number") parts.push(`${d.tables} tables`);
  return parts.join(", ");
}
