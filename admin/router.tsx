import type { ComponentType } from "react";
import { createBrowserRouter, Link, Navigate, Outlet, useRouteError } from "react-router";
import { AppShell } from "./layout/AppShell";
import { RequireAdmin, SessionWatcher } from "./lib/session";
import { LoginPage } from "./pages/LoginPage";
import { SecondFactorSetupPage } from "./pages/SecondFactorSetupPage";

function Root() {
  return (
    <>
      <SessionWatcher />
      <Outlet />
    </>
  );
}

function AdminNotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="text-sm font-semibold text-ink">Page introuvable</p>
        <Link to="/administration/dashboard" className="mt-2 inline-block text-xs font-semibold text-accent hover:underline">
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}

/** Erreur de rendu ou module introuvable (nouvelle version déployée pendant la session). */
function RouteError() {
  const error = useRouteError();
  const outdated = error instanceof TypeError && /dynamically imported module|module script|Importing a module/i.test(error.message);
  return (
    <div className="grid min-h-[60vh] place-items-center p-6 text-center">
      <div className="max-w-sm">
        <p className="text-sm font-semibold text-ink">{outdated ? "Une nouvelle version est disponible" : "Cette page n’a pas pu s’afficher"}</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-3">{outdated ? "Rechargez pour utiliser la dernière version de l’application." : "Rechargez la page. Si le problème persiste, consultez le journal du système."}</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-4 h-10 rounded-xl bg-accent px-4 text-xs font-semibold text-on-accent hover:brightness-110">
          Recharger
        </button>
      </div>
    </div>
  );
}

/** Page chargée à la demande : chaque module a son propre fichier JavaScript. */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return async () => ({ Component: (await load())[name] });
}

export const router = createBrowserRouter([
  {
    path: "/administration",
    element: <Root />,
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },
      { path: "connexion", element: <LoginPage /> },
      {
        path: "securite/double-authentification",
        element: (
          <RequireAdmin allowWithoutSecondFactor>
            <SecondFactorSetupPage />
          </RequireAdmin>
        ),
      },
      {
        element: (
          <RequireAdmin>
            <AppShell />
          </RequireAdmin>
        ),
        errorElement: <RouteError />,
        children: [
          { path: "dashboard", lazy: page(() => import("./pages/DashboardPage"), "DashboardPage") },
          { path: "affaires", lazy: page(() => import("./pages/projects/ProjectsPage"), "ProjectsPage") },
          { path: "affaires/:id", lazy: page(() => import("./pages/projects/ProjectDetailPage"), "ProjectDetailPage") },
          { path: "clients", lazy: page(() => import("./pages/clients/ClientsPage"), "ClientsPage") },
          { path: "clients/:id", lazy: page(() => import("./pages/clients/ClientDetailPage"), "ClientDetailPage") },
          { path: "prospects", lazy: page(() => import("./pages/prospects/ProspectsPage"), "ProspectsPage") },
          { path: "agenda", lazy: page(() => import("./pages/agenda/AgendaPage"), "AgendaPage") },
          { path: "notifications", lazy: page(() => import("./pages/NotificationsPage"), "NotificationsPage") },
          { path: "parametres", lazy: page(() => import("./pages/settings/SettingsPage"), "SettingsPage") },
          { path: "systeme", lazy: page(() => import("./pages/SystemPage"), "SystemPage") },
          { path: "securite", lazy: page(() => import("./pages/SecurityPage"), "SecurityPage") },
          { path: "*", element: <AdminNotFound /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/administration" replace /> },
]);
