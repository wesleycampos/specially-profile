# Specially Profile — contexto para o Claude

Painel de gestão do corpo clínico da Clínica Specially: desempenho dos profissionais, perda de pacientes e motivos, áreas, grupos e satisfação (NPS). O `LEIA-ME.md` tem o manual completo; leia-o antes de mexer.

## Stack
- PHP 8.3 + SQLite, sem framework. Front em HTML/CSS/JS puro (`web/index.html`, `web/app.js`, `web/style.css`) com Chart.js em `web/vendor/`.
- Rodar local: `iniciar.bat` → http://localhost:8765 (sem login). Usa `db/clinica.db`.
- Produção: Hostinger, https://portal.specially.com.br/profile/ — publicar com `bash deploy/deploy.sh` (usa o host SSH `hostinger`). O banco do servidor nunca é sobrescrito.
- `v1-planilha/` é a versão antiga, só front-end lendo a planilha. Não é mais a principal.

## O que NÃO está no Git (de propósito)
- `db/clinica.db`, `dados/`, `v1-planilha/base.xlsx`: dados de pacientes (LGPD). Em outro PC, copie o `clinica.db` à parte ou importe as planilhas pela aba **Importar**.
- `ACESSO-producao (nao compartilhar).txt`, `web/config.local.php`, `*.token`: credenciais.
Se o banco não existir localmente, `web/lib/schema.sql` descreve a estrutura.

## Pontos de ajuste frequentes
- Categorias de motivo de saída: `MOTIVOS` em `web/lib/importar.php`.
- Grafias de nomes de profissionais: `PROF_ALIAS` em `web/lib/importar.php`.
- Perdas evitáveis: `EVITAVEIS` em `web/lib/core.php`.
- Agenda semanal (planilhas AGENDA VILA / FELICITTÁ): leitura, importação e painel em `web/lib/agenda.php` (`AGENDA_MARCAS`, `AGENDA_AREAS`, `AGENDA_PROF_ALIAS`). Cada importação é uma versão por unidade (`agenda_versoes`); a mais recente vira a carteira ativa (vínculos com origem `agenda:<UNIDADE>`).
- Dados do Hipo Saúde (sistema descontinuado): importação única do cadastro de terapeutas + grade da semana em `web/lib/hipo.php` (`HIPO_ESP`, união de duplicados, conciliação, `lotacao()`). Arquivo extraído em `dados/hipo/hipo-dados.json`.
- CRUD genérico de todas as tabelas: `crud_tabelas()` em `web/lib/crud.php` (rotas `api/crud/<tabela>`); profissionais têm `salvar_prof()` e `unir_profissionais()`.
- Conector somente leitura para o Specially Central: `web/integracao.php` (token Bearer).

## Trabalho em dois PCs
Este projeto é sincronizado pelo GitHub. Antes de começar: `git pull`. Ao terminar: commit + `git push`.
