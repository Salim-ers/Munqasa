import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { InlineError, Skeleton } from "../../components/ui/Feedback";
import { Checkbox } from "../../components/ui/Field";
import { api, errorMessage } from "../../lib/api";
import { formatNumber } from "../../lib/format";

type Country = "MA" | "FR";
interface DemoStatus {
  references: { catalog: number; present: number; verified: number };
  prices: { months: number; target: number; usable: Record<Country, number>; usableAtTarget: Record<Country, number> };
  projects: Array<{ country: Country; name: string; id: string | null; reference: string | null; lots: number }>;
}
interface DemoResult {
  references: { imported: number; updated: number; withdrawn: number; skipped: number };
  prices: { from: number; to: number } | null;
  projects: Array<{ country: Country; id: string; reference: string; created: boolean }>;
}

const KEY = ["demonstration"] as const;
const COUNTRY: Record<Country, string> = { MA: "Maroc", FR: "France" };

export function DemoTab() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: KEY, queryFn: ({ signal }) => api<{ status: DemoStatus }>("/demonstration", { signal }) });
  const [prices, setPrices] = useState(true);
  const s = status.data?.status;
  const pricesAdmitted = s ? s.prices.months >= s.prices.target : false;
  useEffect(() => {
    if (pricesAdmitted) setPrices(true);
  }, [pricesAdmitted]);

  const prepare = useMutation({
    mutationFn: () => api<{ result: DemoResult; status: DemoStatus }>("/demonstration", { body: { prices } }),
    onSuccess: ({ result, status: next }) => {
      queryClient.setQueryData(KEY, { status: next });
      for (const key of [["references"], ["projects"], ["settings", "alertes"], ["dashboard"]]) void queryClient.invalidateQueries({ queryKey: key });
      const created = result.projects.filter((p) => p.created).map((p) => p.reference);
      const parts = [
        result.references.imported + result.references.updated ? `${result.references.imported + result.references.updated} référence(s) vérifiée(s) ajoutée(s) au référentiel` : null,
        result.prices ? `prix publics de 2022 admis, ancienneté portée à ${result.prices.to} mois` : null,
        created.length ? `affaire(s) ${created.join(" et ")} créée(s)` : null,
      ].filter(Boolean);
      const text = parts.join(", ");
      toast.success(text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}.` : "La démonstration est déjà prête.");
    },
  });

  if (status.isLoading) return <Skeleton className="h-96" />;
  if (!s) return <InlineError>{errorMessage(status.error)}</InlineError>;

  const ready = s.references.verified === s.references.catalog && pricesAdmitted && s.projects.every((p) => p.id);
  return (
    <Card className="max-w-3xl p-5">
      <CardHeader title="Démonstration" subtitle="Essayer toute la chaîne sur des données réelles, sans valeur inventée." />
      <div className="mt-5 grid gap-6">
        {prepare.error ? <InlineError>{errorMessage(prepare.error)}</InlineError> : null}

        <section>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold text-ink-2">Référentiel vérifié</p>
            <Badge tone={s.references.verified === s.references.catalog ? "success" : "neutral"}>
              {formatNumber(s.references.verified)} sur {formatNumber(s.references.catalog)}
            </Badge>
          </div>
          <p className="mt-1 text-2xs leading-relaxed text-ink-3">
            DTU, normes NF et NM, Eurocodes, CCAG et textes parasismiques, thermiques et des marchés publics, en France et au Maroc. Chaque référence a été vérifiée sur sa source officielle, boutique AFNOR, Légifrance, IMANOR, Trésorerie générale du Royaume ou Bulletin officiel, et garde son lien. Une référence que vous avez saisie ou modifiée n’est jamais remplacée.{" "}
            <Link to="/administration/referentiel" className="font-semibold text-accent hover:underline">
              Ouvrir le référentiel
            </Link>
          </p>
        </section>

        <section>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold text-ink-2">Prix publics de 2022</p>
            <Badge tone={pricesAdmitted ? "success" : "neutral"}>{pricesAdmitted ? "Admis dans les chiffrages" : "Hors chiffrages automatiques"}</Badge>
          </div>
          <p className="mt-1 text-2xs leading-relaxed text-ink-3">
            Prix moyens de l’année 2022 des matériaux de construction, relevés ville par ville au Maroc et publiés par le ministère chargé de l’habitat sur data.gov.ma : ciment, sable, gravettes, aciers, agglomérés, hourdis, béton prêt à l’emploi, carreaux, menuiseries aluminium, tubes et appareils sanitaires. Avec une ancienneté admise de {s.prices.months} mois, {formatNumber(s.prices.usable.MA)} prix servent aux chiffrages au Maroc et {formatNumber(s.prices.usable.FR)} en France
            {pricesAdmitted ? "." : `, ${formatNumber(s.prices.usableAtTarget.MA)} au Maroc à ${s.prices.target} mois.`} Ils restent affichés « valeur 2022 » sur chaque poste et chaque sous-détail. Le seuil se règle à tout moment dans l’onglet Alertes.
          </p>
          <div className="mt-3">
            <Checkbox label={`Admettre les prix publics de 2022 dans les chiffrages automatiques, ancienneté admise portée à ${s.prices.target} mois`} checked={prices} disabled={pricesAdmitted} onChange={setPrices} />
          </div>
        </section>

        <section>
          <p className="text-xs font-semibold text-ink-2">Une affaire par pays</p>
          <p className="mt-1 text-2xs leading-relaxed text-ink-3">
            Lots Gros œuvre, Menuiseries extérieures, Carrelage et Plomberie, sans quantité ni prix saisis à votre place : déposez vos plans pour établir le métré, ou saisissez les quantités, puis générez le dossier. Les prix de main-d’œuvre viennent de vos taux saisis dans la bibliothèque.
          </p>
          <ul className="mt-3 grid gap-2">
            {s.projects.map((p) => (
              <li key={p.country} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium break-words text-ink">{p.name}</p>
                  <p className="text-2xs text-ink-3">{p.id ? `${p.reference}, ${COUNTRY[p.country]}, ${p.lots} lot(s)` : `${COUNTRY[p.country]}, à créer`}</p>
                </div>
                {p.id ? (
                  <Link to={`/administration/affaires/${p.id}`} className="text-xs font-semibold text-accent hover:underline">
                    Ouvrir l’affaire
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
          {ready ? <p className="mr-auto text-2xs text-ink-3">La démonstration est prête.</p> : null}
          <Button loading={prepare.isPending} disabled={ready} onClick={() => prepare.mutate()}>
            Préparer la démonstration
          </Button>
        </div>
      </div>
    </Card>
  );
}
