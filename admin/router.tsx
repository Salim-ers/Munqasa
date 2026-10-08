import { createBrowserRouter, Link, Navigate, Outlet } from "react-router";
import { AppShell } from "./layout/AppShell";
import { RequireAdmin, SessionWatcher } from "./lib/session";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { SecondFactorSetupPage } from "./pages/SecondFactorSetupPage";
import { SecurityPage } from "./pages/SecurityPage";

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
        children: [
          { path: "dashboard", element: <DashboardPage /> },
          { path: "securite", element: <SecurityPage /> },
          { path: "*", element: <AdminNotFound /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/administration" replace /> },
]);
