import { useSearchParams } from "react-router";
import { PageHeader } from "../../components/ui/PageHeader";
import { TabPanel, Tabs } from "../../components/ui/Tabs";
import { AiSettingsTab } from "./AiSettingsTab";
import { AlertsTab } from "./AlertsTab";
import { CompanyTab } from "./CompanyTab";
import { IdentityTab } from "./IdentityTab";

const TABS = ["entreprise", "identite", "ia", "alertes"] as const;
type Tab = (typeof TABS)[number];

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get("onglet") ?? "") ? (params.get("onglet") as Tab) : "entreprise";
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Paramètres" description="Entités émettrices des devis, présentation des documents, intelligence artificielle et alertes." />
      <Tabs
        value={tab}
        onValueChange={(v) => setParams(v === "entreprise" ? {} : { onglet: v }, { replace: true })}
        items={[
          { value: "entreprise", label: "Entreprise" },
          { value: "identite", label: "Identité documentaire" },
          { value: "ia", label: "Intelligence artificielle" },
          { value: "alertes", label: "Alertes" },
        ]}
      >
        <TabPanel value="entreprise">
          <CompanyTab />
        </TabPanel>
        <TabPanel value="identite">
          <IdentityTab />
        </TabPanel>
        <TabPanel value="ia">
          <AiSettingsTab />
        </TabPanel>
        <TabPanel value="alertes">
          <AlertsTab />
        </TabPanel>
      </Tabs>
    </div>
  );
}
