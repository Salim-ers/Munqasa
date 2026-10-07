# MUNAQASA — génération du hero jour / nuit

Outil de production : il tourne sur ta machine, une fois, et dépose des images statiques
dans `public/images/`. Le site ne contacte jamais OpenAI.

## 1. Clé API (côté serveur uniquement)

```bash
cp .env.example .env.local
# puis colle ta clé dans .env.local :  OPENAI_API_KEY=sk-...
```

`.env.local` est ignoré par Git. Le script refuse de tourner si une variable sensible
préfixée `VITE_` existe (elle finirait dans le bundle navigateur).

## 2. Lancer

```bash
npm install
npm run hero            # jour → nuit (à partir du jour) → recadrage → WebP → contrôle
```

Durée : 2 à 4 minutes. Sortie :

```
public/images/hero-day.webp        2560×1440
public/images/hero-day-1920.webp   1920×1080
public/images/hero-day-1280.webp   1280×720
public/images/hero-night.webp      (mêmes tailles)
public/images/hero-night-1920.webp
public/images/hero-night-1280.webp
assets-src/generated/hero/         PNG sources, manifest.json (prompts, modèle, scores), hero-compare.webp
```

## 3. Itérer

```bash
npm run hero:day -- --count 3                       # 3 propositions jour
npm run hero:night -- --from assets-src/generated/hero/hero-day-02.png --count 3
npm run hero:finalize -- --crop-y 0.6               # décale le recadrage 16:9 (0 = haut, 1 = bas)
```

Avec `--count`, chaque essai nuit est noté sur la conservation de la géométrie et le meilleur
est retenu automatiquement.

## 4. Contrôle « même bâtiment »

La finalisation compare les contours jour et nuit (exposition neutralisée) :

| Score | Verdict |
|---|---|
| ≥ 0,70 | identique |
| 0,50 – 0,70 | à vérifier |
| < 0,50 | différent → relancer la nuit |

Repères mesurés : même géométrie ≈ 0,98 ; cadrage décalé de 6 % ≈ 0,42 ; autre image ≈ 0,06.
Le score est indicatif : la décision finale se prend sur `hero-compare.webp`
(jour | nuit en haut, vue fendue au centre en bas).

## Notes

- Le modèle d'image produit au plus 1536 px de large ; les versions 2560 px sont un
  agrandissement Lanczos. Pour une netteté maximale, passer les PNG sources dans un
  upscaler dédié avant `hero:finalize`.
- Modèle par défaut : `gpt-image-1`. Changer via `OPENAI_IMAGE_MODEL` dans `.env.local`.
- Prompts : `scripts/prompts/hero.ts`. Le bâtiment occupe les deux tiers droits pour
  laisser le tiers gauche au titre ; la nuit, ce sont les baies du bureau d'archives
  qui s'allument.
