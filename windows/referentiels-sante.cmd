@echo off
rem Lance referentiels-sante avec le Node.js fourni dans ce dossier : rien a installer.
rem Exemples :
rem   referentiels-sante.cmd ccam
rem   referentiels-sante.cmd cim10 --edition 2025
rem   referentiels-sante.cmd --aide
setlocal
if not exist "%~dp0node\node.exe" (
  echo Le dossier node est introuvable a cote de ce fichier. Decompressez toute l'archive avant de lancer l'outil.
  exit /b 1
)
if "%~1"=="" (
  "%~dp0node\node.exe" "%~dp0app\src\cli.js" --aide
  echo.
  echo Pour un menu pas a pas, lancez plutot Convertir.cmd.
  pause
  exit /b 0
)
"%~dp0node\node.exe" "%~dp0app\src\cli.js" %*
exit /b %errorlevel%
