# Validation CI adaptée aux changements

Les workflows obligatoires classent chaque pull request dans une lane déterministe. Le
classificateur utilise les SHA `pull_request.base.sha` et `pull_request.head.sha` fournis par
GitHub, puis inspecte le diff Git complet entre leur base de fusion et la tête de la pull request.
Il ne compare jamais une pull request à une branche locale supposée.

## Lanes

| Lane         | Chemins admis                                                                                                  | Validation                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `docs`       | `guide/**`, documents racine connus et documentation/templates Markdown GitHub                                 | Diff/Prettier des documents modifiés et titre de pull request                                                     |
| `content`    | `LICENSE*` et fichiers Markdown `.md` sous `src/content/**`                                                    | Audit des dépendances, formatage, tests unitaires, build/Pagefind, CSP/headers et smoke Chromium ciblé            |
| `post-merge` | Push d’un unique commit de merge dont la PR et les cinq checks verts sont prouvés par GitHub                   | Publication rapide des cinq statuts sans répéter les validations déjà réussies                                    |
| `full`       | Code, MDX, styles, dépendances, configuration, workflows, rulesets, scripts, tests, assets et chemins inconnus | Audit des dépendances, suite qualité, huit shards Playwright, Lighthouse, validation CSP complète et vraie CodeQL |

La priorité est `full` > `content` > `docs`. Les deux chemins d’un renommage sont classés et une
suppression conserve la classe de son ancien chemin. Un chemin inconnu, un ensemble vide, un SHA
manquant ou nul, un historique incomplet et toute erreur de diff basculent vers `full`.
MDX reste dans `full`, car un article peut importer des composants et exécuter des expressions.

Les événements planifiés et manuels sont toujours complets. Un push direct, forcé, multiple ou
ambigu reste également en `full`, même si son message ressemble à un merge.

## Checks requis

Les rulesets de `develop` et `main` exigent exactement :

1. `Analyze (javascript-typescript)`
2. `Build and sync security header hashes`
3. `Check Astro, Material Web, and security headers`
4. `Lighthouse 95+ performance (mobile and desktop, no SEO)`
5. `Validate pull request title`

Chaque job requis est créé pour chaque pull request et push protégé. Une lane légère saute
uniquement ses étapes lourdes à l’intérieur du job, explique ce choix dans le résumé GitHub et
termine normalement. Aucun workflow requis n’utilise `paths-ignore`.

Le check `Check Astro, Material Web, and security headers` est l'unique verdict d'agrégation du
workflow principal. Il utilise `needs` avec `always()` afin de rester présent après un job interne
rouge ou ignoré. Sa table fail-closed exige :

- `docs` : qualité réussie, audit, shards et fusion explicitement ignorés ;
- `content` : qualité et audit réussis, shards et fusion explicitement ignorés ;
- `full` : qualité, audit, huit shards et fusion réussis ;
- `post-merge` : qualité, audit, shards et fusion explicitement ignorés après la preuve GitHub.

Tout résultat absent, annulé, inconnu ou différent de cette table échoue. Les huit shards utilisent
un worker chacun et `fail-fast: false`. Leurs rapports blob portent des noms distincts, sont vérifiés
avant fusion et ne partagent jamais le nom du check requis.

Le job qualité produit une seule fois le build de test (`pnpm build:test`) et publie son dossier
`dist` sous le nom `playwright-test-build-<SHA>`. Les huit shards téléchargent cet artefact du même
workflow et n'exécutent aucun build. Un échec de qualité ou de téléchargement empêche la validation
des navigateurs. Lighthouse et les hashes CSP gardent chacun leur build sans routes de test : une
lane complète effectue donc au plus trois builds, au lieu de onze.

Le build partagé et les rapports blob restent disponibles sept jours pour permettre les relances
partielles après un échec. Chaque producteur ou shard garde un nom d'artefact distinct et stable ;
`overwrite: true` remplace l'artefact de même nom lorsqu'il existe déjà. Les jobs réussis qui ne
sont pas relancés conservent ainsi leurs artefacts utilisables par les jobs dépendants. Après
expiration ou suppression de ces artefacts, relancer **tout le workflow** pour recréer le build
et les huit rapports. L'absence d'un build ou d'un rapport requis reste bloquante.

L'audit des dépendances s'exécute dans un job indépendant du build et des navigateurs. Un avis
nouvellement publié ne masque plus leurs diagnostics, mais un audit échoué bloque toujours le
verdict requis. Le résumé GitHub et l'artefact `dependency-audit` conservent
`reports/dependency-audit.json` et `reports/dependency-audit.md`, y compris en cas d'échec. Une erreur
du registre se distingue des vulnérabilités détectées ; elle ne produit pas de validation verte.

## Preuve `post-merge`

Le message du commit n’est jamais utilisé comme preuve. Le fast-path exige cumulativement :

1. un push non forcé sur `develop` ou `main`, avec `before` et `after` complets ;
2. `before` comme premier parent direct de `after` et un intervalle Git de premier parent contenant
   exactement le commit `after` ;
3. une unique pull request renvoyée par `GET /commits/{after}/pulls`, fermée et fusionnée vers la
   branche poussée, avec `base.sha === before` et `merge_commit_sha === after` ;
4. une réponse non paginée de `GET /commits/{head_sha}/check-runs` ;
5. exactement une exécution terminée avec succès pour chacun des cinq noms requis.

Les workflows accordent uniquement `pull-requests: read` et `checks: read` à cette preuve. Le jeton
GitHub est passé comme entrée masquée à l’action locale et n’est jamais journalisé. Une API
indisponible, une pagination, plusieurs associations, un check absent/dupliqué/rouge ou toute donnée
incomplète rebascule en `full`.

## Validation locale

Le classificateur, le verdict agrégé, les huit rapports et la partition Playwright sont couverts
par :

```sh
node --test \
  tests/classify-ci-lane.test.mjs \
  tests/required-ci-verdict.test.mjs \
  tests/check-playwright-blob-reports.test.mjs \
  tests/playwright-sharding.test.mjs
```

La suite simule notamment documentation, article, licence, code, workflow, dépendances, mélange,
renommage, suppression, merge prouvé, push direct, faux merge, API indisponible, check absent ou
rouge, push multiple/forcé, SHA absent et historique indisponible. Elle vérifie aussi que les huit
shards sont disjoints, équilibrés et couvrent exactement la collection complète.
