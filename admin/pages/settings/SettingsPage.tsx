import { useSearchParams } from "react-router";
import { PageHeader } from "../../components/ui/PageHeader";
import { TabPanel, Tabs } from "../../components/ui/Tabs";
import { AiSettingsTab } from "./AiSettingsTab";
import { AlertsTab } from "./AlertsTab";
import { CompanyTab } from "./CompanyTab";
import { DemoTab } from "./DemoTab";
import { IdentityTab } from "./IdentityTab";
import { LotsCatalogTab } from "./LotsCatalogTab";
import { PricingTab } from "./PricingTab";

const TABS = ["entreprise", "identite", "lots", "ia", "chiffrage", "alertes", "demonstration"] as const;
type Tab = (typeof TABS)[number];

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get("onglet") ?? "") ? (params.get("onglet") as Tab) : "entreprise";
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Paramètres" description="Entités émettrices des devis, présentation des documents, nomenclatures de lots, intelligence artificielle, chiffrage, alertes et démonstration." />
      <Tabs
        value={tab}
        onValueChange={(v) => setParams(v === "entreprise" ? {} : { onglet: v }, { replace: true })}
        items={[
          { value: "entreprise", label: "Entreprise" },
          { value: "identite", label: "Identité documentaire" },
          { value: "lots", label: "Lots" },
          { value: "ia", label: "Intelligence artificielle" },
          { value: "chiffrage", label: "Chiffrage" },
          { value: "alertes", label: "Alertes" },
          { value: "demonstration", label: "Démonstration" },
        ]}
      >
        <TabPanel value="entreprise">
          <CompanyTab />
        </TabPanel>
        <TabPanel value="identite">
          <IdentityTab />
        </TabPanel>
        <TabPanel value="lots">
          <LotsCatalogTab />
        </TabPanel>
        <TabPanel value="ia">
          <AiSettingsTab />
        </TabPanel>
        <TabPanel value="chiffrage">
          <PricingTab />
        </TabPanel>
        <TabPanel value="alertes">
          <AlertsTab />
        </TabPanel>
        <TabPanel value="demonstration">
          <DemoTab />
        </TabPanel>
      </Tabs>
    </div>
  );
}
