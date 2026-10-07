/* Applique la lumière mémorisée (jour / nuit) avant le premier rendu, sans flash,
   précharge la bonne photographie du hero sur l'accueil, et les polices à la
   première visite de la session (ensuite, elles sont déjà en cache). */
(function () {
  var mode = "day";
  try {
    if (window.localStorage.getItem("munaqasa:light") === "night") mode = "night";
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
  var firstVisit = true;
  try {
    firstVisit = !window.sessionStorage.getItem("munaqasa:fonts");
    window.sessionStorage.setItem("munaqasa:fonts", "1");
  } catch (e) {
    /* stockage indisponible : préchargement à chaque fois */
  }
  if (firstVisit) {
    preload("/fonts/instrument-serif-regular.woff2", "font", "font/woff2", { crossorigin: "" });
    preload("/fonts/manrope-variable.woff2", "font", "font/woff2", { crossorigin: "" });
  }
  root.setAttribute("data-theme", mode);
  if (window.location.pathname === "/") {
    preload("/images/hero-" + mode + "-1920.webp", "image", "image/webp", {
      imagesrcset: "/images/hero-" + mode + "-1280.webp 1280w, /images/hero-" + mode + "-1920.webp 1920w, /images/hero-" + mode + ".webp 2560w",
      imagesizes: "100vw",
      fetchpriority: "high",
    });
  }
})();
