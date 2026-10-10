import { ChevronDown, Download, FileSpreadsheet, FileText, FileType2, FolderArchive, Moon } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export type ExportFormat = "pdf" | "docx" | "xlsx" | "csv";
export type ExportKind = "cctp" | "dpgf" | "bpu" | "dqe" | "estimation" | "metre" | "analyse" | "controle" | "sous_details";

const FORMAT_LABEL: Record<ExportFormat, string> = { docx: "Word", xlsx: "Excel", pdf: "PDF", csv: "CSV" };
const FORMAT_ICON: Record<ExportFormat, ReactNode> = { docx: <FileText />, xlsx: <FileSpreadsheet />, pdf: <FileType2 />, csv: <FileSpreadsheet /> };

export const exportHref = (kind: ExportKind, id: string, format: ExportFormat, dark = false, params: Record<string, string> = {}) => {
  const query = new URLSearchParams({ ...params, ...(dark ? { theme: "sombre" } : {}) }).toString();
  return `/api/admin/exports/${kind}/${id}/${format}${query ? `?${query}` : ""}`;
};

export interface DownloadItem {
  label: string;
  href: string;
  icon?: ReactNode;
}

export interface DownloadGroup {
  title?: string;
  items: DownloadItem[];
}

/** Entrées d'un document : chaque format, puis la version sombre de présentation (PDF et Word). */
export function documentGroup(title: string | undefined, kind: ExportKind, id: string, formats: ExportFormat[], params: Record<string, string> = {}): DownloadGroup {
  return {
    title,
    items: formats.map((f) => ({ label: title ? `${title}, ${FORMAT_LABEL[f]}` : `Télécharger en ${FORMAT_LABEL[f]}`, href: exportHref(kind, id, f, false, params), icon: FORMAT_ICON[f] })),
  };
}

export function darkGroup(kind: ExportKind, id: string, formats: ExportFormat[], params: Record<string, string> = {}): DownloadGroup {
  const printable = formats.filter((f) => f === "pdf" || f === "docx");
  return {
    title: "Version sombre, pour présentation",
    items: printable.map((f) => ({ label: `${FORMAT_LABEL[f]}, version sombre`, href: exportHref(kind, id, f, true, params), icon: <Moon /> })),
  };
}

export const dossierGroup = (projectId: string): DownloadGroup => ({
  title: "Dossier complet",
  items: [
    { label: "Dossier complet (ZIP)", href: `/api/admin/exports/dossier/${projectId}`, icon: <FolderArchive /> },
    { label: "Dossier complet, version sombre (ZIP)", href: `/api/admin/exports/dossier/${projectId}?theme=sombre`, icon: <Moon /> },
  ],
});

/** Menu de téléchargement : chaque entrée est un vrai lien de téléchargement, servi par l'API. */
export function DownloadMenu({ groups, label = "Télécharger", size = "sm", align = "end" }: { groups: DownloadGroup[]; label?: string; size?: "sm" | "md"; align?: "start" | "end" }) {
  const visible = groups.filter((g) => g.items.length);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface font-semibold text-ink hover:bg-surface-2 data-[state=open]:bg-surface-2",
            size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-[0.8125rem]",
          )}
        >
          <Download className="size-3.5" aria-hidden="true" />
          {label}
          <ChevronDown className="size-3.5 text-ink-3" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} sideOffset={6} collisionPadding={12} className="z-50 max-h-[70vh] min-w-60 overflow-y-auto rounded-card border border-line bg-surface p-1.5 shadow-lift">
          {visible.map((group, gi) => (
            <DropdownMenu.Group key={gi}>
              {gi > 0 ? <DropdownMenu.Separator className="my-1.5 h-px bg-line" /> : null}
              {group.title ? <DropdownMenu.Label className="px-2.5 pt-1.5 pb-1 text-[0.625rem] font-semibold tracking-wide text-ink-3 uppercase">{group.title}</DropdownMenu.Label> : null}
              {group.items.map((item) => (
                <DropdownMenu.Item key={item.href} asChild>
                  <a
                    href={item.href}
                    download
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-ink outline-none data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-ink-3"
                  >
                    {item.icon}
                    {item.label}
                  </a>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Group>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
