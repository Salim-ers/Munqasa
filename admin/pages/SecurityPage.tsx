import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fingerprint, History, KeyRound, Laptop, LogOut, Monitor, Plus, ShieldCheck, Smartphone, Tablet, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { Field, PasswordField } from "../components/ui/Field";
import { EmptyState, InlineError, Skeleton } from "../components/ui/Feedback";
import { api } from "../lib/api";
import { authClient, authErrorMessage } from "../lib/auth-client";
import { formatDateTime, formatIp, formatRelative } from "../lib/format";
import { useMe } from "../lib/session";
import { actionLabel } from "../lib/audit";

interface AuditEntry {
  id: string;
  occurredAt: string;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
}

/** Appareil lisible à partir du navigateur déclaré (indicatif). */
function describeDevice(ua: string | null | undefined): { label: string; icon: ReactNode } {
  const s = ua ?? "";
  const browser = /Edg\//.test(s) ? "Edge" : /Firefox\//.test(s) ? "Firefox" : /Chrome\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "Navigateur";
  const os = /iPhone/.test(s) ? "iPhone" : /iPad/.test(s) ? "iPad" : /Android/.test(s) ? "Android" : /Mac OS X/.test(s) ? "macOS" : /Windows/.test(s) ? "Windows" : /Linux/.test(s) ? "Linux" : "";
  const icon = /iPhone|Android.*Mobile/.test(s) ? <Smartphone /> : /iPad|Tablet/.test(s) ? <Tablet /> : /Mac OS X|Windows|Linux/.test(s) ? <Laptop /> : <Monitor />;
  return { label: os ? `${browser}, ${os}` : browser, icon };
}


export function SecurityPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <p className="text-xs font-medium text-ink-3">Administration</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">Sécurité</h1>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="grid gap-4">
          <SessionsCard />
          <AuditCard />
        </div>
        <div className="grid gap-4">
          <SecondFactorCard />
          <PasskeysCard />
          <PasswordCard />
        </div>
      </div>
    </div>
  );
}

function SectionIcon({ children }: { children: ReactNode }) {
  return <span className="grid size-9 place-items-center rounded-xl bg-surface-2 text-ink-2 [&_svg]:size-[1.125rem] [&_svg]:stroke-[1.75]">{children}</span>;
}

function SessionsCard() {
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const [list, current] = await Promise.all([authClient.listSessions(), authClient.getSession()]);
      if (list.error) throw new Error(list.error.message);
      return { sessions: list.data ?? [], currentToken: current.data?.session.token };
    },
  });
  const revoke = useMutation({
    mutationFn: async (token: string) => {
      const res = await authClient.revokeSession({ token });
      if (res.error) throw new Error(authErrorMessage(res.error));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });
  const revokeOthers = useMutation({
    mutationFn: async () => {
      const res = await authClient.revokeOtherSessions();
      if (res.error) throw new Error(authErrorMessage(res.error));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <SectionIcon>
          <Laptop />
        </SectionIcon>
        <CardHeader className="flex-1" title="Sessions ouvertes" subtitle="Appareils connectés à votre compte" />
      </div>
      <div className="mt-4 grid gap-2">
        {sessions.isPending ? (
          [0, 1].map((i) => <Skeleton key={i} className="h-16" />)
        ) : sessions.isError ? (
          <InlineError>Les sessions n’ont pas pu être chargées.</InlineError>
        ) : (
          sessions.data.sessions
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((s) => {
              const device = describeDevice(s.userAgent);
              const current = s.token === sessions.data.currentToken;
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/60 p-3">
                  <span className="grid size-9 place-items-center rounded-lg bg-surface text-ink-2 [&_svg]:size-4">{device.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-xs font-semibold text-ink">
                      {device.label}
                      {current ? <Badge tone="success">Cet appareil</Badge> : null}
                    </p>
                    <p className="mt-0.5 truncate text-2xs text-ink-3">
                      {formatIp(s.ipAddress)}, ouverte {formatRelative(s.createdAt)}, expire {formatRelative(s.expiresAt)}
                    </p>
                  </div>
                  {current ? null : (
                    <Button variant="ghost" size="sm" loading={revoke.isPending && revoke.variables === s.token} onClick={() => revoke.mutate(s.token)} aria-label="Fermer cette session">
                      <LogOut className="size-3.5" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              );
            })
        )}
      </div>
      {revoke.error || revokeOthers.error ? <div className="mt-3"><InlineError>{(revoke.error ?? revokeOthers.error)?.message}</InlineError></div> : null}
      <Button className="mt-4" variant="secondary" size="sm" loading={revokeOthers.isPending} onClick={() => revokeOthers.mutate()} icon={<LogOut className="size-3.5" aria-hidden="true" />}>
        Fermer toutes les autres sessions
      </Button>
    </Card>
  );
}

function SecondFactorCard() {
  const me = useMe();
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function regenerate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await authClient.twoFactor.generateBackupCodes({ password });
    setBusy(false);
    setPassword("");
    if (res.error || !res.data) return setError(authErrorMessage(res.error));
    setCodes(res.data.backupCodes);
  }

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <SectionIcon>
          <ShieldCheck />
        </SectionIcon>
        <CardHeader
          className="flex-1"
          title="Double authentification"
          subtitle="Application d’authentification et codes de secours"
          action={me.data?.user.twoFactorEnabled ? <Badge tone="success" dot>Activée</Badge> : <Badge tone="warning" dot>Non activée</Badge>}
        />
      </div>
      {codes ? (
        <div className="mt-4">
          <p className="text-xs text-ink-2">Nouveaux codes de secours (les anciens ne fonctionnent plus) :</p>
          <ul className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-xs text-ink">
            {codes.map((c) => (
              <li key={c} className="rounded-lg bg-surface-2 px-2 py-1 text-center tracking-wider">
                {c}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={regenerate}>
          <PasswordField className="min-w-52 flex-1" label="Mot de passe" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" variant="secondary" loading={busy} disabled={!password}>
            Régénérer les codes de secours
          </Button>
        </form>
      )}
      {error ? <div className="mt-3"><InlineError>{error}</InlineError></div> : null}
    </Card>
  );
}

function PasskeysCard() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const passkeys = useQuery({
    queryKey: ["passkeys"],
    queryFn: async () => {
      const res = await authClient.passkey.listUserPasskeys();
      if (res.error) throw new Error(res.error.message);
      return res.data ?? [];
    },
  });
  const add = useMutation({
    mutationFn: async () => {
      const res = await authClient.passkey.addPasskey({ name: name.trim() || "Passkey" });
      if (res?.error) throw new Error("L’ajout de la passkey a été annulé ou refusé.");
    },
    onSuccess: () => {
      setName("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["passkeys"] });
    },
    onError: (e) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await authClient.passkey.deletePasskey({ id });
      if (res.error) throw new Error(authErrorMessage(res.error));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["passkeys"] }),
  });

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <SectionIcon>
          <Fingerprint />
        </SectionIcon>
        <CardHeader className="flex-1" title="Passkeys" subtitle="Connexion par empreinte, visage ou clé de sécurité" />
      </div>
      <div className="mt-4 grid gap-2">
        {passkeys.isPending ? (
          <Skeleton className="h-12" />
        ) : (passkeys.data ?? []).length === 0 ? (
          <p className="text-xs text-ink-3">Aucune passkey enregistrée.</p>
        ) : (
          (passkeys.data ?? []).map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
              <KeyRound className="size-4 text-ink-3" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-ink">{p.name ?? "Passkey"}</p>
                <p className="text-2xs text-ink-3">Ajoutée {p.createdAt ? formatRelative(p.createdAt) : ""}</p>
              </div>
              <Button variant="ghost" size="sm" loading={remove.isPending && remove.variables === p.id} onClick={() => remove.mutate(p.id)} aria-label={`Supprimer ${p.name ?? "la passkey"}`}>
                <Trash2 className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          ))
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <Field className="min-w-48 flex-1" label="Nom de l’appareil" placeholder="Ex. iPhone, ordinateur du bureau" value={name} onChange={(e) => setName(e.target.value)} />
        <Button variant="secondary" loading={add.isPending} onClick={() => add.mutate()} icon={<Plus className="size-4" aria-hidden="true" />}>
          Ajouter une passkey
        </Button>
      </div>
      {error ? <div className="mt-3"><InlineError>{error}</InlineError></div> : null}
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const mismatch = confirm.length > 0 && next !== confirm;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next.length < 12) return setMessage({ ok: false, text: "Le nouveau mot de passe doit compter au moins 12 caractères." });
    setBusy(true);
    const res = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
    setBusy(false);
    if (res.error) return setMessage({ ok: false, text: authErrorMessage(res.error) });
    setCurrent("");
    setNext("");
    setConfirm("");
    setMessage({ ok: true, text: "Mot de passe modifié. Les autres sessions ont été fermées." });
  }

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <SectionIcon>
          <KeyRound />
        </SectionIcon>
        <CardHeader className="flex-1" title="Mot de passe" subtitle="12 caractères au moins ; les autres sessions seront fermées" />
      </div>
      <form className="mt-4 grid gap-3" onSubmit={submit}>
        <PasswordField label="Mot de passe actuel" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <PasswordField label="Nouveau mot de passe" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <PasswordField label="Confirmation" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={mismatch ? "Les deux saisies diffèrent." : null} />
        {message ? (
          message.ok ? <p className="rounded-xl bg-success-soft px-3.5 py-2.5 text-xs font-medium text-success">{message.text}</p> : <InlineError>{message.text}</InlineError>
        ) : null}
        <Button type="submit" loading={busy} disabled={!current || !next || mismatch} className="justify-self-start">
          Modifier le mot de passe
        </Button>
      </form>
    </Card>
  );
}

function AuditCard() {
  const audit = useQuery({ queryKey: ["audit", "securite"], queryFn: ({ signal }) => api<{ entries: AuditEntry[] }>("/system/audit?filtre=securite&limit=40", { signal }) });
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <SectionIcon>
          <History />
        </SectionIcon>
        <CardHeader className="flex-1" title="Journal de sécurité" subtitle="Connexions, sessions et réglages, les plus récents d’abord" />
      </div>
      <div className="mt-4 max-h-[26rem] overflow-y-auto">
        {audit.isPending ? (
          <Skeleton className="h-40" />
        ) : (audit.data?.entries ?? []).length === 0 ? (
          <EmptyState title="Journal vide" />
        ) : (
          <ol className="grid">
            {audit.data!.entries.map((e) => {
              const failed = e.action.endsWith(".echec") || e.action.startsWith("acces.") || e.action === "compte.creation_refusee";
              return (
                <li key={e.id} className="flex items-start gap-3 border-b border-line py-2.5 last:border-0">
                  <span className={failed ? "mt-1.5 size-1.5 shrink-0 rounded-full bg-danger" : "mt-1.5 size-1.5 shrink-0 rounded-full bg-success"} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-ink">{actionLabel(e.action)}</p>
                    <p className="mt-0.5 truncate text-2xs text-ink-3">
                      {formatDateTime(e.occurredAt)}, {formatIp(e.ipAddress)}, {describeDevice(e.userAgent).label}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Card>
  );
}
