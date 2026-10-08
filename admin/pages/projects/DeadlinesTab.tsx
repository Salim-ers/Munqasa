import { useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Flag } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/Feedback";
import type { Deadline, Project } from "../../lib/types";
import { DeadlineFormDialog } from "../agenda/DeadlineFormDialog";
import { DeadlineRow, SubmissionRow } from "../agenda/DeadlineRow";

export function DeadlinesTab({ project, deadlines }: { project: Project; deadlines: Deadline[] }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Deadline | null | undefined>(undefined);
  const pending = deadlines.filter((d) => !d.doneAt);
  const done = deadlines.filter((d) => d.doneAt);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["project", project.id] });

  return (
    <Card className="overflow-hidden">
      <div className="p-5 pb-4">
        <CardHeader
          title="Échéances"
          subtitle="Visites, questions, jalons internes. Les rappels arrivent dans les notifications."
          action={
            <Button size="sm" icon={<CalendarPlus className="size-3.5" />} onClick={() => setEditing(null)}>
              Ajouter
            </Button>
          }
        />
      </div>
      {!project.submissionDeadline && deadlines.length === 0 ? (
        <EmptyState icon={<Flag className="size-5" />} title="Aucune échéance" text="Fixez la date de remise dans la fiche de l’affaire et ajoutez les autres échéances du dossier." />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {project.submissionDeadline ? <SubmissionRow item={{ id: project.id, reference: project.reference, name: project.name, dueAt: project.submissionDeadline }} hideProject /> : null}
          {pending.map((d) => (
            <DeadlineRow key={d.id} deadline={d} onEdit={() => setEditing(d)} onChanged={refresh} hideProject />
          ))}
          {done.map((d) => (
            <DeadlineRow key={d.id} deadline={d} onEdit={() => setEditing(d)} onChanged={refresh} hideProject />
          ))}
        </ul>
      )}
      <DeadlineFormDialog open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)} deadline={editing} projectId={project.id} />
    </Card>
  );
}
