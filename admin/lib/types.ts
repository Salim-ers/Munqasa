/** Formes des réponses de l'API d'administration (dates en ISO, montants en chaînes décimales). */
import type { Country, Currency, DeadlineKind, DesignPhase, FileKind, FileStatus, MarketType, NotificationKind, ProjectStatus, ProspectStatus, Sector } from "../../shared/enums";

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Client {
  id: string;
  name: string;
  sector: Sector;
  legalForm: string | null;
  country: Country;
  city: string | null;
  address: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  legalIds: Record<string, string>;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  projectCount?: number;
}

export interface Prospect {
  id: string;
  name: string;
  company: string | null;
  country: Country;
  city: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: ProspectStatus;
  notes: string | null;
  convertedClientId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  reference: string;
  name: string;
  clientId: string | null;
  country: Country;
  city: string | null;
  siteAddress: string | null;
  marketType: MarketType;
  sector: Sector;
  worksNature: string | null;
  designPhase: DesignPhase;
  currency: Currency;
  status: ProjectStatus;
  submissionDeadline: string | null;
  startDate: string | null;
  description: string | null;
  hypotheses: string | null;
  constraints: string | null;
  manualEstimate: string | null;
  archivedAt: string | null;
  lastOpenedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRow {
  id: string;
  reference: string;
  name: string;
  status: ProjectStatus;
  country: Country;
  city: string | null;
  currency: Currency;
  marketType: MarketType;
  sector: Sector;
  submissionDeadline: string | null;
  manualEstimate: string | null;
  updatedAt: string;
  clientId: string | null;
  clientName: string | null;
  lotCount: number;
}

export interface Lot {
  id: string;
  projectId: string;
  code: string;
  name: string;
  tradeFamily: string;
  position: number;
}

export interface Deadline {
  id: string;
  projectId: string | null;
  title: string;
  kind: DeadlineKind;
  dueAt: string;
  doneAt: string | null;
  notes: string | null;
  createdAt: string;
  projectReference?: string | null;
  projectName?: string | null;
}

export interface ProjectDetail {
  project: Project;
  client: Client | null;
  lots: Lot[];
  deadlines: Deadline[];
  fileCounts: Array<{ kind: FileKind; count: number }>;
  openIssues: number;
}

export interface SourceFile {
  id: string;
  projectId: string | null;
  kind: FileKind;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  status: FileStatus;
  error: string | null;
  uploadedAt: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  occurredAt: string;
  action: string;
  actorUserId: string | null;
  entityType: string | null;
  entityId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface CompanyProfile {
  id: string;
  label: string;
  legalName: string;
  tradeName: string | null;
  legalForm: string | null;
  country: Country;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  legalIds: Record<string, string>;
  defaultCurrency: Currency;
  defaultVatRate: string | null;
  quoteLegalMentions: string | null;
  paymentTerms: string | null;
  isDefault: boolean;
}

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  projectId: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface SystemStatus {
  environment: "production" | "developpement";
  database: "neon" | "locale";
  openai: boolean;
  storage: "s3" | "local" | "absent";
  cron: boolean;
  adminPassword: boolean;
}

/* ---------- Plans et métré ---------- */

export interface DrawingElement {
  category: string;
  designation: string;
  location: string | null;
  count: number | null;
  material: string | null;
  dimensions: Array<{ name: string; value: string; unit: string; source: "cote_lue" | "texte_lu" | "deduit" }>;
  confidence: "elevee" | "moyenne" | "faible";
  note: string | null;
}

export interface Drawing {
  id: string;
  sourceFileId: string;
  fileName: string;
  pageNumber: number;
  title: string | null;
  sheetNumber: string | null;
  kind: import("../../shared/enums").DrawingKind;
  level: string | null;
  scaleText: string | null;
  status: import("../../shared/enums").ValidationStatus;
  analysed: boolean;
  readable: boolean | null;
  elementCount: number;
  uncertainties: string[];
  notes: string[];
  elements: DrawingElement[];
}

export interface Measurement {
  id: string;
  workItemId: string | null;
  drawingId: string | null;
  zoneRef: string | null;
  label: string;
  method: import("../../shared/enums").MeasureMethod;
  formula: string | null;
  inputs: Record<string, string>;
  quantity: string | null;
  unit: string;
  source: import("../../shared/enums").MeasureSource;
  status: import("../../shared/enums").ValidationStatus;
  validatedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface WorkItem {
  id: string;
  lotId: string | null;
  code: string | null;
  designation: string;
  description: string | null;
  unit: string | null;
  location: string | null;
  attributes: Array<{ name: string; value: string; source: string }>;
  origin: "proposition_ia" | "saisie";
  jobId: string | null;
  measurements: Measurement[];
}

/* ---------- Référentiel, CCTP, contrôle qualité ---------- */

export interface TechnicalReference {
  id: string;
  scope: import("../../shared/enums").ReferenceScope;
  kind: import("../../shared/enums").ReferenceKind;
  code: string;
  title: string;
  version: string | null;
  publishedOn: string | null;
  domain: string | null;
  sourceUrl: string | null;
  verificationStatus: import("../../shared/enums").ValidationStatus;
  verifiedAt: string | null;
  notes: string | null;
  cited?: number;
}

export interface CctpBlock {
  type: "paragraphe" | "liste" | "exigence" | "note";
  text: string | null;
  items: string[];
  referenceIds: string[];
}

export interface CctpSection {
  id: string;
  documentId: string;
  parentId: string | null;
  position: number;
  number: string;
  title: string;
  kind: "chapitre" | "article";
  intent: string | null;
  content: CctpBlock[];
  referenceIds: string[];
  workItemId: string | null;
  status: import("../../shared/enums").SectionStatus;
  validatedAt: string | null;
}

export interface CctpDocumentSummary {
  id: string;
  projectId: string;
  lotId: string | null;
  title: string;
  detailLevel: string;
  status: import("../../shared/enums").DocumentStatus;
  currentVersion: number;
  referenceIds: string[];
  createdAt: string;
  updatedAt: string;
  articles?: number;
  validatedArticles?: number;
  openIssues?: number;
}

export interface QualityIssue {
  id: string;
  severity: import("../../shared/enums").IssueSeverity;
  category: string;
  message: string;
  targets: Array<{ type: string; id: string }>;
  status: "ouverte" | "resolue" | "ignoree";
  resolutionNote: string | null;
  createdAt: string;
}

export interface DocumentVersionRow {
  id: string;
  version: number;
  note: string | null;
  validated: boolean;
  createdAt: string;
}

export interface CctpDetail {
  document: CctpDocumentSummary;
  sections: CctpSection[];
  references: TechnicalReference[];
  issues: QualityIssue[];
  versions: DocumentVersionRow[];
  lot: Lot | null;
  workItems: Array<{ id: string; code: string | null; designation: string }>;
}

/* ---------- DPGF ---------- */

export interface DpgfSummary {
  id: string;
  projectId: string;
  lotId: string | null;
  cctpDocumentId: string | null;
  title: string;
  currency: import("../../shared/enums").Currency;
  vatRate: string | null;
  status: import("../../shared/enums").DocumentStatus;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  postes?: number;
  priced?: number;
  totalHt?: string;
  openIssues?: number;
}

export interface DpgfLine {
  id: string;
  dpgfId: string;
  parentId: string | null;
  position: number;
  kind: "chapitre" | "sous_chapitre" | "poste";
  code: string | null;
  cctpRef: string | null;
  cctpSectionId: string | null;
  workItemId: string | null;
  designation: string;
  description: string | null;
  unit: string | null;
  quantity: string | null;
  unitPrice: string | null;
  amount: string | null;
  quantitySource: string | null;
  priceSource: string | null;
  priceItemId: string | null;
  status: import("../../shared/enums").LineStatus;
}

export interface DpgfTotals {
  subtotals: Record<string, string>;
  totalHt: string;
  vat: string | null;
  totalTtc: string | null;
  postes: number;
  priced: number;
}

export interface DpgfDetail {
  dpgf: DpgfSummary;
  lines: DpgfLine[];
  totals: DpgfTotals;
  issues: QualityIssue[];
  versions: DocumentVersionRow[];
  cctp: { id: string; title: string } | null;
  lot: Lot | null;
}

/* ---------- Bibliothèque de prix et sous-détails ---------- */

export interface PriceItem {
  id: string;
  code: string | null;
  designation: string;
  kind: import("../../shared/enums").PriceKind;
  unit: string;
  unitPrice: string;
  currency: Currency;
  country: Country;
  region: string | null;
  city: string | null;
  tradeFamily: string | null;
  subFamily: string | null;
  origin: import("../../shared/enums").PriceOrigin;
  supplierId: string | null;
  supplierName?: string | null;
  sourceRef: string | null;
  priceDate: string;
  verificationStatus: import("../../shared/enums").ValidationStatus;
  commercialConditions: string | null;
  attributes: Record<string, string>;
  description: string | null;
  priceScope: import("../../shared/enums").PriceScope | null;
  taxBasis: import("../../shared/enums").TaxBasis | null;
  vatRate: string | null;
  valueStatus: import("../../shared/enums").PriceValueStatus;
  reliability: import("../../shared/enums").Reliability | null;
  sourceId: string | null;
  sourceName?: string | null;
  sourceKey?: string | null;
  sourcePublisher?: string | null;
  externalKey: string | null;
  groupKey: string | null;
  sourceUrl: string | null;
  license: string | null;
  period: string | null;
  priceMin: string | null;
  priceMax: string | null;
  sampleSize: number | null;
  aggregation: string | null;
  series: Record<string, number> | null;
  verifiedAt: string | null;
  importBatchId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PriceHistoryEntry {
  id: string;
  unitPrice: string;
  currency: Currency;
  priceDate: string;
  origin: import("../../shared/enums").PriceOrigin;
  note: string | null;
  batchLabel?: string | null;
  recordedAt: string;
}

export interface PriceBatch {
  id: string;
  sourceId: string | null;
  sourceName?: string | null;
  sourceKey?: string | null;
  label: string;
  trigger: string;
  status: import("../../shared/enums").PriceBatchStatus;
  stats: import("../../shared/prices").BatchStats;
  message: string | null;
  publishedAt: string | null;
  revertedAt: string | null;
  createdAt: string;
}

export interface PriceBatchRow {
  id: string;
  batchId: string;
  externalKey: string;
  action: "nouveau" | "modifie";
  decision: import("../../shared/enums").PriceRowDecision;
  reason: string | null;
  payload: import("../../shared/prices").SourceRecord;
  previous: import("../../shared/prices").PreviousValue | null;
  priceItemId: string | null;
}

export interface PriceSourceInfo {
  id: string;
  key: string;
  name: string;
  publisher: string;
  country: Country;
  homepage: string;
  license: string;
  licenseUrl: string | null;
  description: string | null;
  method: string | null;
  coverage: string | null;
  autoPublish: boolean;
  maxVariation: string;
  refreshDays: number;
  enabled: boolean;
  lastCheckedAt: string | null;
  lastChangedAt: string | null;
  references: number;
  pending: number;
  lastBatch: PriceBatch | null;
  snapshot: { generatedAt: string; references: number } | null;
  job: import("./jobs").Job | null;
}

export interface LibraryFacets {
  regions: string[];
  cities: Array<{ city: string; region: string | null }>;
  families: Array<string | null>;
  sources: Array<{ key: string; name: string; country: Country; n: number }>;
}

export interface Supplier {
  id: string;
  name: string;
  country: Country;
  city: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

export interface BreakdownComponent {
  id: string;
  breakdownId: string;
  position: number;
  category: import("../../shared/enums").ComponentCategory;
  designation: string;
  unit: string;
  quantity: string;
  unitCost: string | null;
  lossRate: string | null;
  isHypothesis: boolean;
  priceItemId: string | null;
  sourceNote: string | null;
}

export interface BreakdownResult {
  complete: boolean;
  componentTotals: Array<string | null>;
  debourseSec: string;
  fraisChantier: string;
  debourseTotal: string;
  overhead: string;
  contingency: string;
  prixDeRevient: string;
  margin: string;
  prixDeVente: string | null;
}

export interface Breakdown {
  id: string;
  projectId: string;
  dpgfLineId: string | null;
  designation: string;
  unit: string;
  currency: Currency;
  overheadRate: string | null;
  overheadBase: import("../../shared/enums").RateBase;
  contingencyRate: string | null;
  contingencyBase: import("../../shared/enums").RateBase;
  marginRate: string | null;
  marginMode: import("../../shared/enums").MarginMode;
  computedUnitPrice: string | null;
  locked: boolean;
  status: import("../../shared/enums").DocumentStatus;
  notes: string | null;
  updatedAt: string;
  components: BreakdownComponent[];
  result: BreakdownResult | { error: string };
}

export interface BreakdownList {
  dpgf: DpgfSummary;
  postes: Array<{ line: DpgfLine; breakdown: Breakdown | null }>;
  issues: QualityIssue[];
}
