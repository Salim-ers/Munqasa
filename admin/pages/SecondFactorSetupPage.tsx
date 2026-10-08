import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Download, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { renderSVG } from "uqr";
import { Button } from "../components/ui/Button";
import { Checkbox, PasswordField } from "../components/ui/Field";
import { InlineError } from "../components/ui/Feedback";
import { OtpInput } from "../components/ui/OtpInput";
import { AuthLayout } from "../layout/AuthLayout";
import { authClient, authErrorMessage } from "../lib/auth-client";
import { ME_KEY } from "../lib/session";

type Phase = "password" | "scan" | "codes";
const step = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -12 }, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } };

/** Activation obligatoire de la double authentification (première connexion ou après réinitialisation). */
export function SecondFactorSetupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("password");
  const [password, setPassword] = useState("");
  const [totpUri, setTotpUri] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const qr = useMemo(() => (totpUri ? `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(totpUri, { border: 1 }))}` : ""), [totpUri]);
  const secret = useMemo(() => (totpUri ? (new URL(totpUri).searchParams.get("secret") ?? "") : ""), [totpUri]);

  async function start(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await authClient.twoFactor.enable({ password });
    setBusy(false);
    setPassword("");
    if (res.error || !res.data) return setError(authErrorMessage(res.error));
    if (res.data.method !== "totp") return setError("Méthode de double authentification inattendue.");
    setTotpUri(res.data.totpURI);
    setBackupCodes(res.data.backupCodes);
    setPhase("scan");
  }

  async function verify(value = code) {
    setError(null);
    setBusy(true);
    const res = await authClient.twoFactor.verifyTotp({ code: value });
    setBusy(false);
    if (res.error) {
      setCode("");
      return setError(authErrorMessage(res.error));
    }
    setPhase("codes");
  }

  function downloadCodes() {
    const content = `Talab Solutions, codes de secours de la double authentification\nChaque code ne sert qu'une fois. Conservez ce fichier hors ligne.\n\n${backupCodes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "talab-codes-de-secours.txt" });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AuthLayout>
      <div className="mb-6 grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
        <ShieldCheck className="size-5" aria-hidden="true" />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {phase === "password" ? (
          <motion.div key="password" {...step}>
            <h2 className="text-2xl font-semibold tracking-tight text-ink">Activez la double authentification</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-3">
              Obligatoire pour accéder à l’espace d’administration. Il vous faudra une application d’authentification (par exemple celle de votre téléphone).
            </p>
            <form className="mt-8 grid gap-4" onSubmit={start}>
              <PasswordField label="Confirmez votre mot de passe" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              {error ? <InlineError>{error}</InlineError> : null}
              <Button type="submit" size="lg" loading={busy} disabled={!password}>
                Continuer
              </Button>
            </form>
          </motion.div>
        ) : phase === "scan" ? (
          <motion.div key="scan" {...step}>
            <h2 className="text-2xl font-semibold tracking-tight text-ink">Scannez ce code</h2>
            <p className="mt-1.5 text-sm text-ink-3">Avec votre application d’authentification, puis saisissez le code qu’elle affiche.</p>
            <div className="mt-6 flex items-center gap-5 rounded-card border border-line bg-surface p-4">
              <img src={qr} alt="QR code de la double authentification" className="size-36 shrink-0 rounded-lg bg-white p-1.5" />
              <div className="min-w-0">
                <p className="text-2xs font-semibold tracking-wide text-ink-3 uppercase">Saisie manuelle</p>
                <p className="mt-1.5 font-mono text-xs leading-relaxed break-all text-ink">{secret.match(/.{1,4}/g)?.join(" ")}</p>
              </div>
            </div>
            <form
              className="mt-6 grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void verify();
              }}
            >
              <OtpInput value={code} onChange={setCode} onComplete={(v) => void verify(v)} disabled={busy} />
              {error ? <InlineError>{error}</InlineError> : null}
              <Button type="submit" size="lg" loading={busy} disabled={code.length !== 6}>
                Vérifier
              </Button>
            </form>
          </motion.div>
        ) : (
          <motion.div key="codes" {...step}>
            <h2 className="text-2xl font-semibold tracking-tight text-ink">Vos codes de secours</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-3">
              Si vous perdez votre téléphone, chacun de ces codes permet une connexion, une seule fois. Ils ne seront plus affichés.
            </p>
            <ul className="mt-6 grid grid-cols-2 gap-2 rounded-card border border-line bg-surface p-4 font-mono text-xs text-ink">
              {backupCodes.map((c) => (
                <li key={c} className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-center tracking-wider">
                  {c}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" size="sm" icon={<Download className="size-3.5" aria-hidden="true" />} onClick={downloadCodes}>
                Télécharger
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
                onClick={async () => {
                  await navigator.clipboard.writeText(backupCodes.join("\n"));
                  setCopied(true);
                }}
              >
                {copied ? "Copiés" : "Copier"}
              </Button>
            </div>
            <div className="mt-6 grid gap-4">
              <Checkbox label="J’ai conservé mes codes de secours en lieu sûr" checked={saved} onChange={setSaved} />
              <Button
                size="lg"
                disabled={!saved}
                onClick={async () => {
                  await queryClient.invalidateQueries({ queryKey: ME_KEY });
                  navigate("/administration/dashboard", { replace: true });
                }}
              >
                Accéder au tableau de bord
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}
