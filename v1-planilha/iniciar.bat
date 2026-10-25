@echo off
REM Abre o dashboard localmente. A base de dados e o arquivo base.xlsx desta pasta.
cd /d "%~dp0"
echo Dashboard em http://localhost:8765  (feche esta janela para encerrar)
start "" http://localhost:8765/index.html
python -m http.server 8765 --bind 127.0.0.1
if errorlevel 1 (
  echo.
  echo Python nao encontrado. Abra o index.html direto no navegador e carregue a planilha pelo botao.
  pause
)
