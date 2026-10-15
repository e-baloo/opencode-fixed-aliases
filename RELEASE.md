# Publier une version sur npm avec GitHub Actions

Le workflow [publish-npm.yml](.github/workflows/publish-npm.yml) publie le paquet
sur npm lorsqu'un tag `v*` est poussé. Il refuse de publier si le commit tagué
n'est pas présent dans l'historique de la branche `main` ou si le tag ne
correspond pas à la version de `package.json`. Avant publication, il installe les
dépendances, exécute `npm test` et vérifie le contenu de l'archive. Le workflow
peut aussi être lancé manuellement depuis `main` pour exécuter ces validations
sans publier sur npm.

L'archive publiée contient `index.js`, `dist/`, `INSTALL.md`, `README.md` et
`LICENSE`; les sources `src/` n'y sont pas incluses. Le job de publication
reconstruit `dist/` dans son propre runner avant de publier.

## Tester sans publier

Dans GitHub, ouvre **Actions → Publish to npm → Run workflow**, sélectionne la
branche `main`, puis lance le workflow. Cette exécution installe les dépendances,
exécute les tests et vérifie l'archive npm, mais ne publie rien et ne requiert
aucun compte ou secret npm. Les déclenchements par tag restent réservés aux
publications réelles.

## Configuration recommandée : Trusted Publishing (OIDC)

Cette méthode ne stocke pas de clé npm dans GitHub. GitHub fournit une identité
éphémère au workflow, que npm autorise après configuration.

1. Sur npmjs.com, ouvre la page du paquet `opencode-fixed-aliases`, puis ses
   paramètres de publication (Publishing access / Trusted Publishers).
2. Ajoute un publisher **GitHub Actions** avec :
   - **Organization or user** : `e-baloo`
   - **Repository** : `opencode-fixed-aliases`
   - **Workflow filename** : `publish-npm.yml`
   - **Environment** : aucun, sauf si un environnement GitHub est ajouté au
     workflow et configuré à l'identique sur npm.
3. Dans GitHub, vérifie que **Settings → Actions → General → Workflow
   permissions** autorise les workflows à s'exécuter. Le job de publication
   demande `contents: read` et `id-token: write`; le job de validation manuelle
   n'a pas accès à l'identité OIDC. Aucun secret ni variable GitHub n'est
   nécessaire en mode OIDC.
4. Pour un paquet déjà publié, pousse un tag correspondant à la version du
   paquet (voir ci-dessous), puis vérifie **Actions → Publish to npm** et la
   provenance affichée sur npm.

Le nom du dépôt, le nom du workflow et le propriétaire configurés sur npm doivent
correspondre exactement au dépôt GitHub. Le workflow s'exécute sur GitHub-hosted
runners et met à jour npm pour disposer d'une version compatible avec OIDC.

### Première publication

Si npm ne permet pas d'ajouter un Trusted Publisher avant la création du paquet,
effectue une seule publication initiale avec un compte autorisé sur npm : exécute
`npm ci`, `npm test`, puis `npm publish` depuis le dépôt après connexion avec
`npm login`. Utilise une version qui n'a jamais été publiée. Configure ensuite
le Trusted Publisher ci-dessus pour toutes les publications suivantes; ne laisse
pas une clé npm permanente dans le dépôt.

## Variante : secret `NPM_TOKEN`

Utilise cette variante seulement si le Trusted Publishing n'est pas disponible
pour ton compte ou ton registre. Sur npm, crée un jeton limité à la publication
du paquet si l'option est proposée. Dans GitHub, ouvre **Settings → Secrets and
variables → Actions → New repository secret** et ajoute :

| Nom | Valeur |
| --- | --- |
| `NPM_TOKEN` | Le jeton de publication npm |

Ne mets jamais le jeton dans une variable `vars`, un fichier du dépôt, une
commande commitée ou les logs. Limite ses droits, active une expiration, et
renouvelle-le avant son expiration. Le jeton ne doit pas être configuré en même
temps que le Trusted Publishing.

Pour cette variante, modifie le workflow :

- Dans `permissions`, supprime `id-token: write` et garde `contents: read`.
- Dans l'étape **Publish package**, remplace la commande par `npm publish` et
  ajoute :

```yaml
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Le bloc `env` doit être au même niveau d'indentation que `run`, sous cette étape.
`actions/setup-node` configure déjà le registre npm et lit le jeton via
`NODE_AUTH_TOKEN`.

## Publier une nouvelle version

1. Place-toi sur la branche `main`, à jour, et choisis une version SemVer :
   `patch` pour une correction, `minor` pour une fonctionnalité compatible,
   `major` pour une rupture.
2. Depuis `main` propre, exécute par exemple :

   ```powershell
   npm version patch
   ```

   Cette commande met à jour `package.json` et `package-lock.json`, crée le
   commit de version et le tag correspondant, par exemple `v0.2.1`. Utilise
   `npm version minor` ou `npm version major` si nécessaire.
3. Envoie d'abord le commit de version sur `main`, puis le tag sur GitHub :

   ```powershell
   git push origin HEAD
   git push origin v0.2.1
   ```

   Remplace `v0.2.1` par le tag réellement créé. Le commit tagué doit déjà être
   présent sur `main`, et le tag doit être de la forme `v<version>` et
   correspondre exactement à `package.json`; sinon le workflow s'arrête sans
   publier. Si le tag est poussé avant que son commit soit fusionné dans `main`,
   fusionne d'abord le commit puis relance l'exécution échouée depuis l'onglet
   **Actions**.
4. Dans l'onglet **Actions**, vérifie que les tests et la publication ont réussi.
   Confirme ensuite la version sur npm et installe-la dans OpenCode avec :

   ```powershell
   opencode plugin add opencode-fixed-aliases@0.2.1
   ```

## En cas d'échec

- **Tag/version différents** : vérifie `package.json` et `package-lock.json`,
  puis crée/pousse un tag correspondant exactement à `v<version>`.
- **Trusted Publisher non autorisé** : vérifie le propriétaire, le dépôt et le
  nom du fichier workflow dans les paramètres npm. Le nom attendu est
  `publish-npm.yml`.
- **Version déjà publiée** : npm interdit de publier une version existante.
  Incrémente la version avec `npm version patch` (ou `minor`/`major`) et pousse
  le nouveau tag.
- **Tests en échec** : corrige l'échec localement (`npm ci`, `npm test`), puis
  publie une nouvelle version. Ne réutilise pas un tag associé à une version
  déjà publiée.
