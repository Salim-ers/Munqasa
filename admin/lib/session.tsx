/**
 * Session côté interface. La vraie protection est côté serveur (chaque route de l'API vérifie la
 * session) ; ici, on se contente d'aiguiller : connexion, activation de la double authentification,
 * ou application.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { api, ApiError } from "./api";

export interface Me {
  user: { id: string; email: string; name: string; twoFactorEnabled: boolean };
  session: { id: string; expiresAt: string };
  secondFactorRequired: boolean;
}

export const ME_KEY = ["me"] as const;

export function useMe() {
  return useQuery({ queryKey: ME_KEY, queryFn: ({ signal }) => api<Me>("/me", { signal }), retry: false, staleTime: 60_000 });
}

/** Réagit aux réponses 401 / 403 de l'API, où qu'elles surviennent. */
export function SessionWatcher() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  useEffect(() => {
    const onUnauthenticated = () => {
      queryClient.removeQueries({ queryKey: ME_KEY });
      if (!location.pathname.startsWith("/administration/connexion")) {
        navigate(`/administration/connexion?retour=${encodeURIComponent(location.pathname)}`, { replace: true });
      }
    };
    const onSecondFactor = () => navigate("/administration/securite/double-authentification", { replace: true });
    window.addEventListener("talab:unauthenticated", onUnauthenticated);
    window.addEventListener("talab:second-factor-required", onSecondFactor);
    return () => {
      window.removeEventListener("talab:unauthenticated", onUnauthenticated);
      window.removeEventListener("talab:second-factor-required", onSecondFactor);
    };
  }, [navigate, queryClient, location.pathname]);
  return null;
}

export function FullScreenLoader({ label = "Chargement" }: { label?: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas" role="status" aria-label={label}>
      <div className="flex flex-col items-center gap-4">
        <div className="size-9 animate-spin rounded-full border-2 border-line-strong border-t-accent" aria-hidden="true" />
        <p className="text-xs font-medium text-ink-3">{label}…</p>
      </div>
    </div>
  );
}

export function RequireAdmin({ children, allowWithoutSecondFactor = false }: { children: ReactNode; allowWithoutSecondFactor?: boolean }) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <FullScreenLoader label="Vérification de la session" />;
  if (me.error) {
    if (me.error instanceof ApiError && (me.error.status === 401 || me.error.status === 403)) {
      return <Navigate to={`/administration/connexion?retour=${encodeURIComponent(location.pathname)}`} replace />;
    }
    return (
      <div className="grid min-h-screen place-items-center bg-canvas p-6 text-center">
        <div className="max-w-sm">
          <p className="text-sm font-semibold text-ink">Le serveur ne répond pas.</p>
          <p className="mt-1 text-xs text-ink-3">Vérifiez votre connexion puis rechargez la page.</p>
        </div>
      </div>
    );
  }
  if (me.data.secondFactorRequired && !allowWithoutSecondFactor) return <Navigate to="/administration/securite/double-authentification" replace />;
  return <>{children}</>;
}
