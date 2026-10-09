@echo off
rem Menu pas a pas : choisir un referentiel, le convertir en CSV, ouvrir le dossier.
rem Les fichiers sont ecrits dans le sous-dossier "donnees" ; les telechargements
rem sont gardes dans ".cache" pour ne pas les refaire a chaque fois.
setlocal EnableDelayedExpansion
title referentiels-sante
cd /d "%~dp0"
if not exist "node\node.exe" (
  echo Le dossier node est introuvable. Decompressez toute l'archive avant de lancer l'outil.
  pause
  exit /b 1
)

:menu
cls
echo.
echo   referentiels-sante : les referentiels publics de la sante en CSV
echo   ----------------------------------------------------------------
echo.
echo     1  FINESS+ : etablissements, entites juridiques, groupements
echo     2  FINESS+ avec les activites et autorisations, plus long
echo     3  CCAM
echo     4  CIM-10 FR a usage PMSI
echo     5  Base publique des medicaments
echo     6  NABM, biologie
echo     7  LPP, produits et prestations
echo     8  UCD, unites communes de dispensation
echo     9  Tarifs GHS de la derniere campagne
echo.
echo     0  Quitter
echo.
set "choix="
set "commande="
set "dossier="
set /p "choix=  Votre choix, puis Entree : "
if "!choix!"=="1" (set "commande=finess" & set "dossier=finess")
if "!choix!"=="2" (set "commande=finess --activites" & set "dossier=finess")
if "!choix!"=="3" (set "commande=ccam" & set "dossier=ccam")
if "!choix!"=="4" (set "commande=cim10" & set "dossier=cim10")
if "!choix!"=="5" (set "commande=bdpm" & set "dossier=medicaments")
if "!choix!"=="6" (set "commande=nabm" & set "dossier=nabm")
if "!choix!"=="7" (set "commande=lpp" & set "dossier=lpp")
if "!choix!"=="8" (set "commande=ucd" & set "dossier=ucd")
if "!choix!"=="9" (set "commande=ghs" & set "dossier=ghs")
if "!choix!"=="0" exit /b 0
if not defined commande goto menu

echo.
echo   Conversion en cours, cela peut prendre quelques minutes...
echo.
"node\node.exe" "app\src\cli.js" !commande! --sortie "donnees\!dossier!"
if errorlevel 1 (
  echo.
  echo   La conversion a echoue. Derriere le proxy d'un etablissement, les
  echo   telechargements peuvent etre bloques : voyez avec votre DSI, ou
  echo   essayez depuis un poste qui a un acces direct a internet.
  echo.
  pause
  goto menu
)
echo.
echo   Termine. Les fichiers CSV s'ouvrent directement dans Excel.
start "" explorer "%~dp0donnees\!dossier!"
pause
goto menu
