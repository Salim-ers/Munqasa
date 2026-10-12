import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import type { QuoteLineKind, QuotePricingMode } from "../../../shared/enums";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { InlineError } from "../../components/ui/Feedback";
import { Field, SelectField, TextareaField } from "../../components/ui/Field";
import { Segmented } from "../../components/ui/Segmented";
import { api, ApiError } from "../../lib/api";
import { quoteError } from "../../lib/quotes";
import type { QuoteDetail, QuoteLine } from "../../lib/types";

interface Values {
  parentId: string;
  designation: string;
  description: string;
  unit: string;
  quantity: string;
  pricingMode: QuotePricingMode;
  unitPrice: string;
  supplyCost: string;
  laborCost: string;
  discountRate: string;
  vatRate: string;
  quantitySource: string;
}

const blank = (parentId: string): Values => ({ parentId, designation: "", description: "", unit: "", quantity: "", pricingMode: "direct", unitPrice: "", supplyCost: "", laborCost: "", discountRate: "", vatRate: "", quantitySource: "" });

/**
 * Ligne, section ou option d'un devis. Prix direct (prix de vente unitaire HT) ou décomposé : fourniture et
 * pose, auxquelles le serveur applique les coefficients du devis. Un champ vide reste vide, jamais zéro.
 */
export function QuoteLineDialog({
  quote,
  open,
  kind,
  line,
  defaultParentId,
  onOpenChange,
  onSaved,
}: {
  quote: QuoteDetail;
  open: boolean;
  kind: QuoteLineKind;
  line: QuoteLine | null;
  defaultParentId: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (detail: QuoteDetail) => void;
}) {
  const [values, setValues] = useState<Values>(blank(""));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setGeneral(null);
    setValues(
      line
        ? {
            parentId: line.parentId ?? "",
            designation: line.designation,
            description: line.description ?? "",
            unit: line.unit ?? "",
            quantity: line.quantity ? String(Number(line.quantity)) : "",
            pricingMode: line.pricingMode,
            unitPrice: line.unitPrice ? String(Number(line.unitPrice)) : "",
            supplyCost: line.supplyCost ? String(Number(line.supplyCost)) : "",
            laborCost: line.laborCost ? String(Number(line.laborCost)) : "",
            discountRate: line.discountRate ? String(Number(line.discountRate)) : "",
            vatRate: line.vatRate ? String(Number(line.vatRate)) : "",
            quantitySource: line.quantitySource ?? "",
          }
        : blank(defaultParentId ?? ""),
    );
  }, [open, line, defaultParentId]);
  const set = (key: keyof Values, value: string) => setValues((v) => ({ ...v, [key]: value }));
  const section = kind === "section";

  const save = useMutation({
    mutationFn: () => {
      const payload = section
        ? { designation: values.designation }
        : {
            designation: values.designation,
            description: values.description,
            unit: values.unit,
            quantity: values.quantity,
            pricingMode: values.pricingMode,
            unitPrice: values.pricingMode === "direct" ? values.unitPrice : "",
            supplyCost: values.pricingMode === "decompose" ? values.supplyCost : "",
            laborCost: values.pricingMode === "decompose" ? values.laborCost : "",
            discountRate: values.discountRate,
            vatRate: values.vatRate,
            quantitySource: values.quantitySource,
          };
      return line
        ? api<QuoteDetail>(`/quote-lines/${line.id}`, { method: "PATCH", body: payload })
        : api<QuoteDetail>(`/quotes/${quote.quote.id}/lines`, { body: { ...payload, kind, parentId: kind === "option" ? null : values.parentId || null } });
    },
    onSuccess: (detail) => {
      onOpenChange(false);
      onSaved(detail);
    },
    onError: (e) => {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      else setGeneral(quoteError(e));
    },
  });
  const sections = quote.lines.filter((l) => l.kind === "section" && l.id !== line?.id);
  const title = line ? (section ? "Modifier la section" : kind === "option" ? "Modifier l’option" : "Modifier la ligne") : section ? "Nouvelle section" : kind === "option" ? "Nouvelle option" : "Nouvelle ligne";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };
  const rates = quote.quote;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={
        section
          ? "Une section regroupe des lignes, par lot ou par nature de travaux ; son sous-total est calculé."
          : kind === "option"
            ? "Une option est chiffrée à part : elle n’entre pas dans le total du devis."
            : "Le montant est calculé par le serveur : quantité × prix unitaire arrondi au centime, remise de la ligne déduite."
      }
      size="lg"
      onSubmit={submit}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" loading={save.isPending}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {general ? <InlineError>{general}</InlineError> : null}
        <Field label={section ? "Intitulé de la section" : "Désignation"} value={values.designation} onChange={(e) => set("designation", e.target.value)} error={errors.designation} />
        {section ? null : (
          <>
            <TextareaField label="Description détaillée" optional rows={3} value={values.description} onChange={(e) => set("description", e.target.value)} error={errors.description} />
            {kind === "ligne" && sections.length && !line ? (
              <SelectField label="Section" optional placeholder="Aucune" options={sections.map((s) => ({ value: s.id, label: s.designation }))} value={values.parentId} onChange={(e) => set("parentId", e.target.value)} />
            ) : null}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Unité" optional placeholder="m², ml, u, forfait" value={values.unit} onChange={(e) => set("unit", e.target.value)} error={errors.unit} />
              <Field label="Quantité" optional inputMode="decimal" placeholder="À préciser" value={values.quantity} onChange={(e) => set("quantity", e.target.value)} error={errors.quantity} />
              <Field label="Provenance de la quantité" optional placeholder="Métré, plan, saisie" value={values.quantitySource} onChange={(e) => set("quantitySource", e.target.value)} error={errors.quantitySource} />
            </div>
            <Segmented
              value={values.pricingMode}
              onChange={(v) => set("pricingMode", v)}
              options={[
                { value: "direct", label: "Prix unitaire HT" },
                { value: "decompose", label: "Fourniture et pose" },
              ]}
              label="Mode de prix"
            />
            {values.pricingMode === "direct" ? (
              <Field label={`Prix unitaire HT, ${quote.quote.currency}`} optional inputMode="decimal" placeholder="À établir" value={values.unitPrice} onChange={(e) => set("unitPrice", e.target.value)} error={errors.unitPrice} hint="Prix de vente : les coefficients du devis ne s’y appliquent pas." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={`Fourniture, coût unitaire HT, ${quote.quote.currency}`} inputMode="decimal" value={values.supplyCost} onChange={(e) => set("supplyCost", e.target.value)} error={errors.supplyCost} />
                <Field label={`Pose, coût unitaire HT, ${quote.quote.currency}`} inputMode="decimal" value={values.laborCost} onChange={(e) => set("laborCost", e.target.value)} error={errors.laborCost} />
                <p className="text-2xs text-ink-3 sm:col-span-2">
                  {`Prix de vente calculé avec les coefficients du devis : frais de chantier ${rates.siteCostsRate ? `${Number(rates.siteCostsRate)} %` : "non renseignés"}, frais généraux ${rates.overheadRate ? `${Number(rates.overheadRate)} %` : "non renseignés"}, aléas ${rates.contingencyRate ? `${Number(rates.contingencyRate)} %` : "non renseignés"}, marge ${rates.marginRate ? Number(rates.marginRate) : "non renseignée"}.`}
                </p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Remise de la ligne, %" optional inputMode="decimal" value={values.discountRate} onChange={(e) => set("discountRate", e.target.value)} error={errors.discountRate} />
              {quote.quote.taxRegime === "normal" ? (
                <Field label="Taux de TVA, %" optional inputMode="decimal" placeholder={quote.quote.vatRate ? `${Number(quote.quote.vatRate)}, taux du devis` : "À préciser"} value={values.vatRate} onChange={(e) => set("vatRate", e.target.value)} error={errors.vatRate} />
              ) : null}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
