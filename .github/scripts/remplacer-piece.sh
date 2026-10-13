#!/usr/bin/env bash
# Remplace une pièce jointe de release sans couper son adresse : envoi sous un nom
# provisoire, puis échange des noms (l'adresse ne manque qu'un instant).
# Usage : remplacer-piece.sh <étiquette> <fichier> [nom publié]
set -euo pipefail

etiquette="$1"
fichier="$2"
nom="${3:-$(basename "$fichier")}"
provisoire="envoi-en-cours-${nom}"

dossier=$(mktemp -d)
trap 'rm -rf "$dossier"' EXIT
cp "$fichier" "${dossier}/${provisoire}"
gh release upload "$etiquette" "${dossier}/${provisoire}" --clobber

id_piece() {
  gh api "repos/${GITHUB_REPOSITORY}/releases/tags/${etiquette}" --jq ".assets[] | select(.name == \"$1\") | .id" || true
}

nouveau=""
for essai in 1 2 3 4 5; do
  nouveau=$(id_piece "$provisoire")
  [ -n "$nouveau" ] && break
  sleep 2
done
if [ -z "$nouveau" ]; then
  echo "pièce ${provisoire} introuvable dans ${etiquette} après l'envoi" >&2
  exit 1
fi

ancien=$(id_piece "$nom")
if [ -n "$ancien" ]; then
  gh api -X DELETE "repos/${GITHUB_REPOSITORY}/releases/assets/${ancien}"
fi
# L'adresse publique manque tant que le renommage n'a pas réussi : on insiste.
renomme=""
for essai in 1 2 3 4 5; do
  if gh api -X PATCH "repos/${GITHUB_REPOSITORY}/releases/assets/${nouveau}" -f name="$nom" > /dev/null; then
    renomme=1
    break
  fi
  sleep 3
done
if [ -z "$renomme" ]; then
  echo "renommage de ${provisoire} en ${nom} impossible dans ${etiquette}" >&2
  exit 1
fi
echo "${nom} publié dans ${etiquette} : https://github.com/${GITHUB_REPOSITORY}/releases/download/${etiquette}/${nom}"
