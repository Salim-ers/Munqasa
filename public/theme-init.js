/* Applique la lumière mémorisée (jour / nuit) avant le premier rendu, sans flash, et précharge
   les polices et la bonne photographie du hero sur l'accueil. */
(function () {
  var mode = "day";
  try {
    if (window.localStorage.getItem("talab:light") === "night") mode = "night";
  } catch (e) {
    /* stockage indisponible : jour par défaut */
  }
  var root = document.documentElement;
  function preload(href, as, type, extra) {
    var link = document.createElement("link");
    link.rel = "preload";
    link.as = as;
    link.type = type;
    link.href = href;
    if (extra) for (var key in extra) link.setAttribute(key, extra[key]);
    document.head.appendChild(link);
  }
  // Polices : Chrome et Firefox ne réutilisent un préchargement de police qu'avec l'attribut
  // crossorigin, Safari et les navigateurs iOS (WebKit) seulement sans. Sinon, double téléchargement.
  var webkit = navigator.vendor === "Apple Computer, Inc.";
  preload("/fonts/manrope-variable.woff2", "font", "font/woff2", webkit ? null : { crossorigin: "" });
  preload("/fonts/instrument-serif-regular.woff2", "font", "font/woff2", webkit ? null : { crossorigin: "" });
  root.setAttribute("data-theme", mode);
  // Barre du navigateur (mobile) à la couleur de la lumière du site.
  var themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute("content", mode === "night" ? "#0B0C0D" : "#F5F1E9");
  if (window.location.pathname === "/") {
    preload("/images/hero-" + mode + "-1920.webp", "image", "image/webp", {
      imagesrcset: "/images/hero-" + mode + "-1280.webp 1280w, /images/hero-" + mode + "-1920.webp 1920w, /images/hero-" + mode + ".webp 2560w",
      imagesizes: "100vw",
      fetchpriority: "high",
    });
  }
})();
