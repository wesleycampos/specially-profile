<?php
declare(strict_types=1);

// API JSON do Specially Profile. Rotas chegam como api/<rota> (ver .htaccess / router.php).

require __DIR__ . '/lib/core.php';
require __DIR__ . '/lib/importar.php';
require __DIR__ . '/lib/painel.php';

security_headers();
set_time_limit(120);

function send(int $code, $body, string $ctype = 'application/json; charset=utf-8', array $extra = []): never
{
    http_response_code($code);
    header("Content-Type: $ctype");
    foreach ($extra as $k => $v) {
        header("$k: $v");
    }
    echo is_string($body) && !str_starts_with($ctype, 'application/json')
        ? $body
        : json_encode($body, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PRESERVE_ZERO_FRACTION);
    exit;
}

function body_json(): array
{
    $b = json_decode((string) file_get_contents('php://input'), true);
    return is_array($b) ? $b : [];
}

if (logged_user() === null) {
    send(401, ['erro' => 'Sessão expirada. Recarregue a página e entre novamente.']);
}

$r = trim((string) ($_GET['r'] ?? ''), '/');
$method = $_SERVER['REQUEST_METHOD'];

// alterações exigem cabeçalho próprio (bloqueia formulários de outros sites)
if ($method !== 'GET' && ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'profile') {
    send(403, ['erro' => 'Requisição recusada.']);
}

try {
    if ($method === 'GET') {
        if ($r === 'meta') {
            send(200, meta());
        }
        if ($r === 'dashboard') {
            send(200, dashboard($_GET));
        }
        if ($r === 'profissionais') {
            send(200, rows('SELECT p.*, e.nome esp, (SELECT COUNT(*) FROM competencias c WHERE c.profissional_id=p.id) n_comp,
                                   (SELECT COUNT(*) FROM saida_profissionais sp WHERE sp.profissional_id=p.id) n_saidas
                            FROM profissionais p JOIN especialidades e ON e.id=p.especialidade_id ORDER BY e.nome, p.nome'));
        }
        if (preg_match('#^profissional/(\d+)$#', $r, $m)) {
            $p = profissional((int) $m[1]);
            send($p ? 200 : 404, $p ?? ['erro' => 'não encontrado']);
        }
        if ($r === 'modelo') {
            $tipo = preg_replace('/[^a-z]/', '', (string) ($_GET['tipo'] ?? ''));
            send(200, modelo($tipo), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                ['Content-Disposition' => "attachment; filename=\"modelo_$tipo.xlsx\""]);
        }
        if (preg_match('#^fotos/(\d+)\.(jpg|png|webp)$#', $r, $m)) {
            $f = fotos_dir() . "/$m[1].$m[2]";
            if (!is_file($f)) {
                send(404, ['erro' => 'foto não encontrada']);
            }
            header('Cache-Control: private, max-age=86400');
            send(200, (string) file_get_contents($f), $m[2] === 'jpg' ? 'image/jpeg' : "image/$m[2]");
        }
    }
    if ($method === 'POST') {
        if ($r === 'importar') {
            $fn = IMPORTADORES[$_GET['tipo'] ?? ''] ?? null;
            if (!$fn) {
                send(400, ['erro' => 'tipo inválido']);
            }
            $bytes = (string) file_get_contents('php://input');
            if (strlen($bytes) > 15 * 1024 * 1024) {
                send(413, ['erro' => 'Planilha maior que 15 MB.']);
            }
            send(200, $fn($bytes));
        }
        if ($r === 'profissional') {
            send(200, salvar_prof(null, body_json()));
        }
        if (preg_match('#^profissional/(\d+)/foto$#', $r, $m)) {
            $pid = (int) $m[1];
            $ext = ['image/png' => 'png', 'image/webp' => 'webp', 'image/jpeg' => 'jpg'][$_SERVER['CONTENT_TYPE'] ?? ''] ?? null;
            $bytes = (string) file_get_contents('php://input');
            if (!$ext || strlen($bytes) > 5 * 1024 * 1024 || @getimagesizefromstring($bytes) === false) {
                send(400, ['erro' => 'Envie uma imagem JPG, PNG ou WEBP de até 5 MB.']);
            }
            if (!is_dir(fotos_dir())) {
                mkdir(fotos_dir(), 0750, true);
            }
            foreach (glob(fotos_dir() . "/$pid.*") ?: [] as $old) {
                unlink($old);
            }
            file_put_contents(fotos_dir() . "/$pid.$ext", $bytes);
            $url = "api/fotos/$pid.$ext?v=" . time();
            salvar_prof($pid, ['foto_url' => $url]);
            send(200, ['foto_url' => $url]);
        }
    }
    if ($method === 'PUT') {
        if (preg_match('#^profissional/(\d+)$#', $r, $m)) {
            send(200, salvar_prof((int) $m[1], body_json()));
        }
        if (preg_match('#^saida/(\d+)/prof/(\d+)$#', $r, $m)) {
            $b = body_json();
            $mod = in_array($b['modalidade'] ?? null, ['individual', 'grupo'], true) ? $b['modalidade'] : null;
            q('UPDATE saida_profissionais SET modalidade=?, grupo_id=? WHERE saida_id=? AND profissional_id=?',
                [$mod, $mod === 'grupo' ? (($b['grupo_id'] ?? null) ?: null) : null, (int) $m[1], (int) $m[2]]);
            send(200, ['ok' => true]);
        }
        if (preg_match('#^convenio/(\d+)$#', $r, $m)) {
            $v = body_json()['valor_sessao'] ?? null;
            q('UPDATE convenios SET valor_sessao=? WHERE id=?', [is_numeric($v) ? (float) $v : null, (int) $m[1]]);
            send(200, ['ok' => true]);
        }
    }
    send(404, ['erro' => 'não encontrado']);
} catch (Throwable $e) {
    error_log('[profile] ' . $e);
    send(500, ['erro' => $e instanceof RuntimeException || $e instanceof InvalidArgumentException ? $e->getMessage() : 'Erro interno ao processar a solicitação.']);
}
