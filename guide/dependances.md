# Dépendances

Le nombre de paquets peut sembler élevé, mais ils ne jouent pas tous le même rôle. Certains créent
le site, certains ajoutent une fonctionnalité visible et d'autres ne servent qu'à vérifier le code.

## Trois idées importantes

1. `dependencies` et `devDependencies` sont des catégories d'installation, pas une liste exacte des
   fichiers téléchargés par chaque visiteur.
2. Le build Astro retire ou regroupe une grande partie du code. Le navigateur ne reçoit que les
   ressources nécessaires aux pages et interactions concernées.
3. Les outils comme ESLint, Prettier, Playwright, Lighthouse, Commitlint et Knip ne sont pas envoyés
   aux visiteurs. Ils s'exécutent sur la machine de développement ou dans GitHub Actions.

`pnpm-lock.yaml` enregistre l'arbre exact, y compris les dépendances indirectes utilisées par les
paquets directs. Il est donc beaucoup plus long que la liste de `package.json`.

## Dépendances principales

| Paquet                               | Rôle dans ce dépôt                                                          | Arrive dans le navigateur ?                                   |
| ------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `astro`                              | Génère les pages, routes, contenus et ressources statiques                  | Le runtime Astro serveur, non ; les ressources produites, oui |
| `@astrojs/markdown-remark`           | Fournit les outils de transformation Markdown utilisés par la configuration | Non comme outil autonome                                      |
| `@astrojs/mdx`                       | Permet les articles `.mdx`                                                  | Non comme outil autonome                                      |
| `@astrojs/rss`                       | Génère le flux `/rss.xml`                                                   | Non ; seul le XML généré est servi                            |
| `@material/web`                      | Fournit les composants Material 3 utilisés par l'interface                  | Oui, seulement les modules importés et découpés par le build  |
| `@material/material-color-utilities` | Calcule les palettes Material dynamiques et le thème généré                 | Partiellement, pour les couleurs dynamiques ; aussi au build  |
| `@floating-ui/dom`                   | Positionne menus et surfaces flottantes                                     | Oui, quand la fonctionnalité correspondante est chargée       |
| `@vercel/analytics`                  | Statistiques de fréquentation en production                                 | Oui, seulement après son accord individuel                    |
| `@vercel/speed-insights`             | Mesure optionnelle des performances après consentement                      | Oui, seulement après son accord individuel                    |
| `rehype-slug`                        | Ajoute des identifiants aux titres Markdown                                 | Non ; seul le HTML résultant est servi                        |
| `rehype-autolink-headings`           | Rend les titres Markdown directement liés à leur ancre                      | Non ; seul le HTML résultant est servi                        |
| `satori` et `satori-html`            | Produisent le visuel Open Graph d'un article                                | Non ; seule l'image générée est servie                        |
| `sharp`                              | Convertit et optimise des images, notamment Open Graph et Konachan          | Non                                                           |
| `fonteditor-core`                    | Lit et transforme les polices pour les icônes et images Open Graph          | Non                                                           |

## Dépendances de développement et de contrôle

| Paquet                                                 | Rôle                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `@astrojs/check`                                       | Vérification Astro et TypeScript via `pnpm check`                      |
| `typescript` et `@types/node`                          | Types du code et des API Node.js                                       |
| `tsx`                                                  | Exécution des scripts TypeScript, notamment le générateur de thème     |
| `eslint`, `@eslint/js`, `typescript-eslint`            | Analyse statique du JavaScript et TypeScript                           |
| `eslint-plugin-astro`                                  | Règles ESLint spécifiques aux fichiers Astro                           |
| `eslint-plugin-jsx-a11y`                               | Règles d'accessibilité pour le balisage de type JSX/Astro              |
| `globals`                                              | Liste contrôlée des variables globales navigateur et Node pour ESLint  |
| `prettier` et `prettier-plugin-astro`                  | Mise en forme cohérente du code, Markdown et Astro                     |
| `@playwright/test`                                     | Tests E2E dans Chromium, WebKit et la matrice nocturne                 |
| `@lhci/cli`                                            | Mesures Lighthouse CI et application des seuils                        |
| `knip`                                                 | Détection du code et des dépendances probablement inutilisés           |
| `@commitlint/cli` et `@commitlint/config-conventional` | Validation des messages de commit et titres de pull request            |
| `husky`                                                | Installation de hooks Git locaux                                       |
| `lint-staged`                                          | Contrôles ciblés sur les fichiers ajoutés à un commit                  |
| `@shikijs/transformers`                                | Options avancées de coloration des blocs de code au build              |
| `html-minifier-terser`                                 | Minification du HTML produit                                           |
| `pagefind`                                             | Création de l'index de recherche statique                              |
| `parse5`                                               | Analyse structurée du HTML dans les contrôles de contenu et de preview |
| `semver`                                               | Vérification des versions corrigées réellement publiées dans l’audit   |
| `sass`                                                 | Compilation des fichiers `.scss` en CSS                                |
| `material-symbols`                                     | Source de la police d'icônes locale réduite                            |

## Pourquoi Prettier et ESLint sont tous les deux présents

Ils n'ont pas le même travail :

- Prettier décide de la présentation du texte source : espaces, retours à la ligne et indentation ;
- ESLint cherche des constructions incorrectes ou contraires aux règles du projet.

Les deux sont utilisés localement et dans `verify:quality`, donc aussi par GitHub Actions. Prettier ne
remplace pas ESLint et ESLint ne remplace pas les tests.

## Pourquoi Gixy n'est pas présent

Gixy analyse des configurations Nginx. Ce dépôt ne contient pas de configuration Nginx et son
hébergement principal est défini par `vercel.json`. Ajouter Gixy ici n'apporterait donc aucun
contrôle utile. Si le dossier `dist` est un jour servi par Nginx sur un NAS, la configuration Nginx
appartiendra à l'infrastructure du NAS et pourra être vérifiée séparément à cet endroit.

## Pourquoi certaines versions sont strictement fixées

Une version comme `"2.5.0"` est exacte. Une version comme `"^7.1.0"` autorise des mises à jour
compatibles selon les règles sémantiques de npm. Dans les deux cas, `pnpm-lock.yaml` fixe la version
réellement installée par `pnpm install --frozen-lockfile`.

Les versions exactes sont utiles pour les outils dont les résultats doivent rester très
reproductibles, comme Playwright ou Lighthouse. Une plage compatible peut réduire le travail pour
des correctifs ordinaires, tout en laissant le lockfile protéger chaque build.

## Dependabot et maintenance

Dependabot vérifie chaque semaine les paquets npm et les actions GitHub, puis ouvre au maximum cinq
pull requests de chaque catégorie vers `develop`. Il n'applique pas silencieusement une mise à jour
au site.

Pour examiner une mise à jour :

1. lire le paquet et la version modifiés ;
2. lire les changements incompatibles annoncés par le projet source ;
3. laisser GitHub Actions exécuter les contrôles ;
4. vérifier visuellement si la dépendance influence l'interface ;
5. fusionner seulement si le changement est compris et les contrôles sont verts.

Des versions majeures de TypeScript, Node/ESLint et des outils Astro sont volontairement ignorées
par certaines règles Dependabot. Elles demandent une migration examinée séparément.

## Supprimer une dépendance

Ne supprimez pas un paquet uniquement parce que son nom n'apparaît pas dans une page Astro. Il peut
être utilisé par un script, un workflow ou un chargement dynamique.

La procédure sûre est :

1. rechercher ses imports et son nom dans tout le dépôt ;
2. consulter `package.json`, `astro.config.mjs`, `knip.json` et les scripts ;
3. retirer le paquet et le code devenu inutile dans une branche séparée ;
4. exécuter `pnpm install`, `pnpm check:knip` et `pnpm verify:quality` ;
5. vérifier le site produit et le diff de `pnpm-lock.yaml`.

## Mise à jour manuelle

Utilisez une branche séparée et mettez à jour un groupe cohérent de paquets. Après modification :

```sh
pnpm install
pnpm verify:quality
```

Pour une dépendance visible dans le navigateur ou un outil de build majeur, lancez également
`pnpm verify` et examinez le résultat visuel. Ne lancez pas `pnpm update --latest` sans plan : cela
mélange de nombreuses migrations et rend une régression difficile à attribuer.

`pnpm verify:quality` exécute les contrôles statiques, l’audit et les navigateurs en conservant un
résumé de chaque résultat. Un audit rouge n’empêche plus de diagnostiquer les tests navigateur.
En revanche, un build ou contrôle statique en échec empêche de tester un ancien `dist` par erreur.
`pnpm verify` ajoute Lighthouse, même lorsqu’un test navigateur échoue. Toute étape en échec garde
la commande globale en échec.

## Diagnostiquer un audit

`pnpm audit:dependencies` conserve la réponse complète du registre dans
`reports/dependency-audit.json` et un résumé avec les chaînes de dépendances dans
`reports/dependency-audit.md`. GitHub Actions conserve les deux rapports. Une panne réseau ou une
réponse invalide est signalée comme un audit indisponible, jamais comme une absence de risque.

Les avis restent bloquants à partir du niveau faible. Les rares exceptions sont écrites dans
`dependency-audit-policy.json` : avis GHSA, paquet, version, gravité, chaîne exacte exclusivement de
développement, justification et échéance. Une nouvelle chaîne, une version ou gravité différente,
un correctif publié ou l’expiration rend l’avis de nouveau bloquant. Le rapport brut et la sortie
de commande affichent toujours les exceptions ; `pnpm audit --audit-level low` reste disponible
pour consulter le verdict sans cette politique.

Le registre peut annoncer une plage corrigée avant la publication du paquet. Pour les seules
exceptions correspondant à la plage examinée, le script vérifie les versions réellement publiées
sur npm. Une version satisfaisant cette plage désactive immédiatement l’exception ; une panne de
cette vérification reste bloquante.

Au 10 octobre 2026, deux exceptions expirent le 10 novembre 2026 :

- `GHSA-vfj7-8cjw-p6xm` (`braces`) : pas de correctif publié ; les motifs concernés proviennent de
  la configuration de projet du parseur ESLint, absente dans ce dépôt, et non du contenu des articles ;
- `GHSA-hp3w-g68c-fv3c` (`sprintf-js`) : pas de correctif publié ; cette dépendance sert à l’interface
  de commande de `js-yaml`, que LHCI n’exécute pas. La configuration du projet est `lighthouserc.cjs`.

Ces exceptions ne déclarent pas les paquets corrigés. Réexaminer les chemins et la justification lors
de la mise à jour de leurs parents ; privilégier leur suppression dès qu’une version compatible le permet.

À cette date, les remplacements demandent une migration coordonnée : le plugin Astro 2/3 exige
ESLint 10, alors que `eslint-plugin-jsx-a11y` 6.10.2 accepte au plus ESLint 9. Forcer seulement le
parseur Astro 2 sous le plugin 1 sort de sa plage prise en charge. De même, LHCI 0.15.1 utilise encore
`yaml.safeLoad()` pour les configurations YAML ; un override vers `js-yaml` 4 casserait cette API.

## Maintenir les overrides

Chaque override impose une résolution différente de celle du parent. Avant d’en ajouter un,
vérifier qu’un simple renouvellement du lockfile dans la plage existante ne suffit pas. Les
correctifs rétroportés de `brace-expansion` permettent maintenant à chaque parent de conserver son
API : le forçage global vers la version 5 et le patch de `minimatch` ont été retirés. Les corrections
`fast-uri` et `ip-address` sont également résolues naturellement dans le lockfile.

| Override                                                                                   | Motif / contrôle                                                                                       | Condition de suppression                                                                       |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `get-uri>basic-ftp`                                                                        | GHSA-c475-qrg2-pj4r ; les méthodes `Client` utilisées par get-uri restent disponibles en 6.x           | get-uri accepte une version corrigée dans sa propre plage                                      |
| `lighthouse@12.6.1`                                                                        | Version de Lighthouse compatible avec les contrôles du projet ; vérifier les deux profils LHCI         | LHCI adopte cette génération de Lighthouse                                                     |
| `@xmldom/xmldom`, `esbuild`, `fast-xml-parser`, `fflate`, `immutable`, `qs`, `tmp`, `uuid` | Correctifs transitifs hérités ; audit, unités, build et Lighthouse couvrent les parents correspondants | Retirer individuellement lorsque la résolution normale conserve une version sans avis bloquant |

La dérogation de peer dependency `proxy-agent` accompagne encore LHCI/Lighthouse : elle doit être
réexaminée avec leur mise à jour groupée. Ne pas supprimer un override uniquement pour raccourcir
le fichier, ni le conserver lorsque le parent n’en a plus besoin.

Les types Node suivent désormais la ligne 22, version minimale exécutée en CI. Les versions de
Node et pnpm utilisées par l’action de préparation sont lues dans `package.json`, également utilisé
par Volta. Cela évite plusieurs valeurs indépendantes à modifier lors d’un changement de référence.
