import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { devApiPlugin } from "./build/dev-api.ts";
import { seoPlugin } from "./build/seo-plugin.ts";

export default defineConfig(({ mode }) => {
  // Le troisième argument "" charge aussi les variables serveur, utilisées
  // UNIQUEMENT par le middleware de développement — jamais exposées au bundle
  // (seules les variables VITE_ le sont, et aucune n'est secrète).
  const env = loadEnv(mode, process.cwd(), "");
  const exposed = Object.keys(env).filter((k) => k.startsWith("VITE_") && /KEY|SECRET|TOKEN|PASSWORD/i.test(k));
  if (exposed.length) throw new Error(`Secret exposé au navigateur : ${exposed.join(", ")}. Retire le préfixe VITE_.`);

  return {
    plugins: [
      react(),
      seoPlugin(env.VITE_SITE_URL || "https://talabsolutions.ma"),
      devApiPlugin({ RESEND_API_KEY: env.RESEND_API_KEY, CONTACT_TO: env.CONTACT_TO, CONTACT_FROM: env.CONTACT_FROM }),
    ],
    build: {
      // Navigateurs pris en charge : depuis 2020 (Chrome / Edge 79, Firefox 78 ESR, Safari et iOS 14),
      // ce qui couvre aussi les téléviseurs connectés récents. La syntaxe plus récente est réécrite,
      // les fonctions manquantes sont complétées par public/compat.js.
      target: ["chrome79", "edge79", "firefox78", "safari14", "ios14"],
      cssTarget: ["chrome79", "edge79", "firefox78", "safari14", "ios14"],
      cssMinify: "lightningcss",
      assetsInlineLimit: 2048,
      rolldownOptions: {
        output: {
          // Bibliothèques séparées du code du site : mises en cache indépendamment.
          codeSplitting: {
            groups: [
              { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
              { name: "router", test: /node_modules[\\/]react-router[\\/]/ },
              { name: "motion", test: /node_modules[\\/](gsap|lenis)[\\/]/ },
            ],
          },
        },
      },
    },
  };
});
