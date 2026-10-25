@echo off
REM Specially Profile - roda localmente (sem login) usando o banco db\clinica.db
cd /d "%~dp0"
where php >nul 2>nul
if errorlevel 1 (
  echo PHP nao encontrado. Instale com: winget install PHP.PHP.8.3
  pause
  exit /b 1
)
echo Specially Profile em http://localhost:8765  (feche esta janela para encerrar)
start "" http://localhost:8765/
php -S 127.0.0.1:8765 -t web web\router.php
