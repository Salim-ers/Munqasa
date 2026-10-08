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
