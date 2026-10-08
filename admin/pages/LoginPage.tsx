import { useQueryClient } from "@tanstack/react-query";
import { Fingerprint, KeyRound, LockKeyhole } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { Button } from "../components/ui/Button";
import { Checkbox, Field, PasswordField } from "../components/ui/Field";
import { InlineError } from "../components/ui/Feedback";
import { OtpInput } from "../components/ui/OtpInput";
import { AuthLayout } from "../layout/AuthLayout";
import { authClient, authErrorMessage } from "../lib/auth-client";
import { api, ApiError } from "../lib/api";
import { FullScreenLoader, ME_KEY, type Me, SetupRequired, useMe } from "../lib/session";

type Step = "password" | "totp" | "backup";

/** Ne redirige qu'à l'intérieur de l'administration (aucune redirection ouverte). */
function safeReturn(raw: string | null): string {
  if (raw && raw.startsWith("/administration/") && !raw.startsWith("/administration/connexion") && !raw.includes("//")) return raw;
  return "/administration/dashboard";
}

const step = { initial: { opacity: 0, x: 16 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -16 }, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } };

export function LoginPage() {
  const me = useMe();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "password" | "passkey" | "code">(null);
  const target = safeReturn(params.get("retour"));

  if (me.isPending) return <FullScreenLoader label="Vérification de la session" />;
  if (me.data) return <Navigate to={me.data.secondFactorRequired ? "/administration/securite/double-authentification" : target} replace />;
  if (me.error instanceof ApiError && me.error.code === "configuration_incomplete") return <SetupRequired />;

  async function enterApp() {
    await queryClient.invalidateQueries({ queryKey: ME_KEY });
    const next = await queryClient.fetchQuery({ queryKey: ME_KEY, queryFn: () => api<Me>("/me") });
    navigate(next.secondFactorRequired ? "/administration/securite/double-authentification" : target, { replace: true });
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("password");
    const res = await authClient.signIn.email({ email: email.trim(), password });
    setBusy(null);
    if (res.error) return setError(authErrorMessage(res.error));
    if (res.data && "twoFactorRedirect" in res.data && res.data.twoFactorRedirect) {
      setPassword("");
      setCurrent("totp");
      return;
    }
    await enterApp();
  }

  async function submitCode(value = code) {
    setError(null);
    setBusy("code");
    const res =
      current === "backup"
        ? await authClient.twoFactor.verifyBackupCode({ code: value.trim(), trustDevice })
        : await authClient.twoFactor.verifyTotp({ code: value, trustDevice });
    setBusy(null);
    if (res.error) {
      setCode("");
      return setError(authErrorMessage(res.error));
    }
    await enterApp();
  }

  async function passkeySignIn() {
    setError(null);
    setBusy("passkey");
    const res = await authClient.signIn.passkey();
    setBusy(null);
    if (res?.error) return setError(res.error.status === 429 ? authErrorMessage(res.error) : "La connexion par passkey a été annulée ou refusée.");
    await enterApp();
  }

  return (
    <AuthLayout>
      <AnimatePresence mode="wait" initial={false}>
        {current === "password" ? (
          <motion.div key="password" {...step}>
            <h2 className="text-2xl font-semibold tracking-tight text-ink">Connexion</h2>
            <p className="mt-1.5 text-sm text-ink-3">Espace d’administration Talab Solutions.</p>
            <form className="mt-8 grid gap-4" onSubmit={submitPassword} noValidate>
              <Field label="Adresse e-mail" type="email" autoComplete="username webauthn" required value={email} onChange={(e) => setEmail(e.target.value)} />
              <PasswordField label="Mot de passe" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              {error ? <InlineError>{error}</InlineError> : null}
              <Button type="submit" size="lg" loading={busy === "password"} disabled={!email || !password || busy !== null} icon={<LockKeyhole className="size-4" aria-hidden="true" />}>
                Se connecter
              </Button>
            </form>
            <div className="my-6 flex items-center gap-3 text-2xs font-medium text-ink-3">
              <span className="h-px flex-1 bg-line-strong" />
              ou
              <span className="h-px flex-1 bg-line-strong" />
            </div>
            <Button variant="secondary" size="lg" className="w-full" loading={busy === "passkey"} disabled={busy !== null} onClick={passkeySignIn} icon={<Fingerprint className="size-4" aria-hidden="true" />}>
              Se connecter avec une passkey
            </Button>
          </motion.div>
        ) : (
          <motion.div key="code" {...step}>
            <div className="mb-6 grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
              <KeyRound className="size-5" aria-hidden="true" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-ink">{current === "backup" ? "Code de secours" : "Double authentification"}</h2>
            <p className="mt-1.5 text-sm text-ink-3">
              {current === "backup"
                ? "Saisissez l’un de vos codes de secours. Chaque code ne sert qu’une fois."
                : "Saisissez le code à 6 chiffres affiché par votre application d’authentification."}
            </p>
            <form
              className="mt-8 grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submitCode();
              }}
            >
              {current === "totp" ? (
                <OtpInput value={code} onChange={setCode} onComplete={(v) => void submitCode(v)} disabled={busy !== null} />
              ) : (
                <Field label="Code de secours" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
              )}
              <Checkbox label="Faire confiance à cet appareil pendant 30 jours" checked={trustDevice} onChange={setTrustDevice} />
              {error ? <InlineError>{error}</InlineError> : null}
              <Button type="submit" size="lg" loading={busy === "code"} disabled={busy !== null || (current === "totp" ? code.length !== 6 : code.trim().length < 6)}>
                Valider
              </Button>
            </form>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-xs">
              <button
                type="button"
                className="font-semibold text-accent hover:underline"
                onClick={() => {
                  setCode("");
                  setError(null);
                  setCurrent(current === "backup" ? "totp" : "backup");
                }}
              >
                {current === "backup" ? "Utiliser l’application d’authentification" : "Utiliser un code de secours"}
              </button>
              <button
                type="button"
                className="text-ink-3 hover:text-ink"
                onClick={() => {
                  setCode("");
                  setError(null);
                  setCurrent("password");
                }}
              >
                Recommencer
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}
