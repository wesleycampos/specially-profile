#!/usr/bin/env bash
# Publica o Specially Profile em https://portal.specially.com.br/profile
#   bash deploy/deploy.sh
# O banco e as fotos do servidor ficam fora da pasta pública e NUNCA são sobrescritos
# (o db/clinica.db local só é enviado na primeira publicação).
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=hostinger
DOM=domains/specially.com.br
PUB=$DOM/public_html/portal/profile
DATA=$DOM/profile_data

echo "→ Enviando arquivos do painel…"
tar -czf - --exclude=router.php -C web . | ssh "$HOST" "mkdir -p $PUB $DATA/fotos && chmod 750 $DATA && tar -xzf - -C $PUB"

echo "→ Configuração (só na primeira vez)…"
ssh "$HOST" "[ -f $PUB/config.local.php ] || { printf '%s\n' '<?php' \"return ['db' => '\$HOME/$DATA/clinica.db', 'fotos' => '\$HOME/$DATA/fotos'];\" > $PUB/config.local.php && chmod 640 $PUB/config.local.php; }"

if ssh "$HOST" "[ -f $DATA/clinica.db ]"; then
  echo "→ Banco do servidor mantido (não sobrescrito)."
else
  echo "→ Primeira publicação: enviando db/clinica.db…"
  scp -q db/clinica.db "$HOST:$DATA/clinica.db"
  ssh "$HOST" "chmod 640 $DATA/clinica.db"
fi

echo "→ Verificando…"
ssh "$HOST" "cd $PUB && php -l api.php >/dev/null && php -l index.php >/dev/null && php -r 'require \"lib/core.php\"; db(); echo \"banco ok: \", one(\"SELECT COUNT(*) FROM saidas\"), \" saídas\n\";'"
echo "Pronto: https://portal.specially.com.br/profile/"
