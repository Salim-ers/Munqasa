import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router";
import { refreshScroll } from "../animations/reveal";
import { useRouteSeo } from "../hooks/useRouteSeo";
import { useSmoothScroll } from "../hooks/useSmoothScroll";
import { Cursor } from "./Cursor/Cursor";
import { Footer } from "./Footer/Footer";
import { Header } from "./Header/Header";
import { Loader } from "./Loader/Loader";
import { MobileMenu } from "./MobileMenu/MobileMenu";
import { PageTransitionProvider } from "./PageTransition/PageTransition";

export function RootLayout() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const toggleMenu = useCallback(() => setMenuOpen((o) => !o), []);

  const firstRender = useRef(true);

  useSmoothScroll();
  useRouteSeo(pathname);

  // Nouvelle page : menu fermé, focus ramené au contenu (lecteurs d'écran),
  // déclencheurs de défilement recalculés.
  useEffect(() => {
    setMenuOpen(false);
    if (firstRender.current) firstRender.current = false;
    else document.getElementById("contenu")?.focus({ preventScroll: true });
    const id = requestAnimationFrame(refreshScroll);
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  // Les polices et les images modifient la mise en page une fois chargées.
  useEffect(() => {
    document.fonts?.ready.then(refreshScroll);
    window.addEventListener("load", refreshScroll);
    return () => window.removeEventListener("load", refreshScroll);
  }, []);

  return (
    <PageTransitionProvider>
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <Header menuOpen={menuOpen} onToggleMenu={toggleMenu} />
      <MobileMenu open={menuOpen} onClose={closeMenu} />
      <main id="contenu" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
      <Loader />
      <Cursor />
      <ScrollRestoration />
    </PageTransitionProvider>
  );
}
