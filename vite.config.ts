import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { adminDevPlugin } from "./build/admin-dev.ts";
import { devApiPlugin } from "./build/dev-api.ts";
import { seoPlugin } from "./build/seo-plugin.ts";

export default defineConfig(({ mode, command }) => {
  // Le troisième argument "" charge aussi les variables serveur, utilisées
  // UNIQUEMENT par les middlewares locaux — jamais exposées au bundle
  // (seules les variables VITE_ le sont, et aucune n'est secrète).
  const env = loadEnv(mode, process.cwd(), "");
  const exposed = Object.keys(env).filter((k) => k.startsWith("VITE_") && /KEY|SECRET|TOKEN|PASSWORD|DATABASE/i.test(k));
  if (exposed.length) throw new Error(`Secret exposé au navigateur : ${exposed.join(", ")}. Retire le préfixe VITE_.`);

  // Serveur local (développement, prévisualisation) : l'API lit ses variables dans process.env, comme sur Vercel.
  if (command === "serve") {
    for (const [key, value] of Object.entries(env)) {
      if (!key.startsWith("VITE_") && process.env[key] === undefined) process.env[key] = value;
    }
  }

  return {
    plugins: [
      react(),
      // Tailwind ne traite que les feuilles qui l'importent : celles de l'administration (admin/).
      tailwindcss(),
      seoPlugin(env.VITE_SITE_URL || "https://talabsolutions.ma"),
      devApiPlugin({ RESEND_API_KEY: env.RESEND_API_KEY, CONTACT_TO: env.CONTACT_TO, CONTACT_FROM: env.CONTACT_FROM }),
      adminDevPlugin(),
    ],
    server: {
      watch: { ignored: ["**/.data/**", "**/tests/**", "**/docs/**"] },
    },
    build: {
      // Navigateurs pris en charge : depuis 2020 (Chrome / Edge 79, Firefox 78 ESR, Safari et iOS 14),
      // ce qui couvre aussi les téléviseurs connectés récents. La syntaxe plus récente est réécrite ;
      // le code de la vitrine n'utilise que des fonctions ES2020 (tsconfig.app.json).
      target: ["chrome79", "edge79", "firefox78", "safari14", "ios14"],
      cssTarget: ["chrome79", "edge79", "firefox78", "safari14", "ios14"],
      cssMinify: "lightningcss",
      assetsInlineLimit: 2048,
      rolldownOptions: {
        // Deux applications : la vitrine (index.html) et l'administration (administration/index.html),
        // avec des bundles et des feuilles de style distincts.
        input: {
          main: resolve(import.meta.dirname, "index.html"),
          admin: resolve(import.meta.dirname, "administration/index.html"),
        },
        output: {
          // Bibliothèques séparées du code des pages : mises en cache indépendamment.
          codeSplitting: {
            groups: [
              { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
              { name: "router", test: /node_modules[\\/]react-router[\\/]/ },
              // Animations de la vitrine (GSAP, Lenis).
              { name: "motion", test: /node_modules[\\/](gsap|lenis)[\\/]/ },
              // Graphiques de l'administration.
              { name: "charts", test: /node_modules[\\/](recharts|d3-[a-z]+|victory-vendor)[\\/]/ },
            ],
          },
        },
      },
    },
  };
});
