<?php
declare(strict_types=1);

// Specially Profile — núcleo: configuração, banco SQLite, sessão e utilitários.

const FALTAS = 'Faltas / ausências';
// Motivos em que a clínica/profissional tem influência direta (ajuste se quiser)
const EVITAVEIS = ['Faltas / ausências', 'Insatisfação / adaptação', 'Mudança de clínica'];
const PESOS = ['retencao' => 0.35, 'satisfacao' => 0.25, 'assiduidade' => 0.20, 'produtividade' => 0.20];
const MOT_ORDER = ['Faltas / ausências', 'Convênio / plano', 'Decisão da família', 'Logística / rotina',
                   'Mudança de clínica', 'Insatisfação / adaptação', 'Não informado', 'Outros'];

function cfg(): array
{
    static $c = null;
    if ($c === null) {
        $f = dirname(__DIR__) . '/config.local.php';   // produção: caminhos fora da pasta pública
        $c = is_file($f) ? (array) require $f : [];
    }
    return $c;
}

function db_path(): string
{
    return getenv('PROFILE_DB') ?: (cfg()['db'] ?? dirname(__DIR__, 2) . '/db/clinica.db');
}

function fotos_dir(): string
{
    return cfg()['fotos'] ?? dirname(db_path()) . '/fotos';
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $dir = dirname(db_path());
        if (!is_dir($dir)) {
            mkdir($dir, 0750, true);
        }
        $pdo = new PDO('sqlite:' . db_path());
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec('PRAGMA foreign_keys = ON');
        migrar($pdo);
        $pdo->exec((string) file_get_contents(__DIR__ . '/schema.sql'));
    }
    return $pdo;
}

/** Acrescenta colunas novas em bancos criados por versões anteriores. */
function migrar(PDO $pdo): void
{
    $novas = [
        'profissionais' => [['modalidade', "TEXT NOT NULL DEFAULT 'individual'"], ['hipo_id', 'INTEGER'], ['nome_completo', 'TEXT'],
                            ['unidade', 'TEXT'], ['contratacao', 'TEXT'], ['capacidade_semanal', 'INTEGER']],
        'vinculos' => [['modalidade', 'TEXT'], ['grupo_id', 'INTEGER']],
        'atendimentos' => [['origem', 'TEXT']],
        'saida_profissionais' => [['modalidade', 'TEXT'], ['grupo_id', 'INTEGER']],
    ];
    foreach ($novas as $tabela => $cols) {
        $existentes = array_column($pdo->query("PRAGMA table_info($tabela)")->fetchAll(PDO::FETCH_ASSOC), 'name');
        if (!$existentes) {
            continue;
        }
        foreach ($cols as [$nome, $tipo]) {
            if (!in_array($nome, $existentes, true)) {
                $pdo->exec("ALTER TABLE $tabela ADD COLUMN $nome $tipo");
            }
        }
    }
}

function q(string $sql, array $args = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($args);
    return $st;
}

function rows(string $sql, array $args = []): array
{
    return q($sql, $args)->fetchAll();
}

function one(string $sql, array $args = [])
{
    return q($sql, $args)->fetchColumn();
}

// ------------------------------------------------------------------ sessão e acesso
function modo_local(): bool
{
    // servidor embutido do PHP (php -S) só roda na máquina local: dispensa login
    return PHP_SAPI === 'cli-server';
}

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('profile_sess');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
    session_start();
}

function logged_user(): ?string
{
    if (modo_local()) {
        return 'local';
    }
    start_session();
    return $_SESSION['user'] ?? null;
}

function security_headers(): void
{
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: same-origin');
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow');
}

function client_ip(): string
{
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

// 5 falhas em 15 minutos por IP bloqueiam novas tentativas
function login_blocked(): bool
{
    return (int) one('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND ts > ?', [client_ip(), time() - 900]) >= 5;
}

function login_fail(): void
{
    q('INSERT INTO login_attempts (ip, ts) VALUES (?, ?)', [client_ip(), time()]);
}

function login_reset(): void
{
    q('DELETE FROM login_attempts WHERE ip = ? OR ts < ?', [client_ip(), time() - 86400]);
}

// ------------------------------------------------------------------ texto
function strip_acc(string $s): string
{
    $d = class_exists('Normalizer') ? Normalizer::normalize($s, Normalizer::FORM_D) : $s;
    return (string) preg_replace('/\p{Mn}+/u', '', (string) $d);
}

function norm($s): string
{
    return trim((string) preg_replace('/\s+/', ' ', mb_strtoupper(strip_acc((string) ($s ?? '')), 'UTF-8')));
}

function title($s): string
{
    $lower = ['DE', 'DA', 'DO', 'DOS', 'DAS', 'E'];
    $out = [];
    foreach (explode(' ', norm($s)) as $i => $w) {
        $out[] = ($i && in_array($w, $lower, true)) ? strtolower($w) : substr($w, 0, 1) . strtolower(substr($w, 1));
    }
    return implode(' ', $out);
}

function pct($a, $b): ?float
{
    return $b ? round(100 * $a / $b, 1) : null;
}

function mean(array $xs): ?float
{
    $xs = array_values(array_filter($xs, fn($x) => $x !== null));
    return $xs ? array_sum($xs) / count($xs) : null;
}

function nps(array $notas): ?int
{
    if (!$notas) {
        return null;
    }
    $p = count(array_filter($notas, fn($n) => $n >= 9));
    $d = count(array_filter($notas, fn($n) => $n <= 6));
    return (int) round(100 * ($p - $d) / count($notas));
}

function dias(?string $d1, ?string $d2 = null): ?int
{
    if (!$d1) {
        return null;
    }
    try {
        $a = new DateTimeImmutable(substr($d1, 0, 10));
        $b = $d2 ? new DateTimeImmutable(substr($d2, 0, 10)) : new DateTimeImmutable('today');
        return (int) $a->diff($b)->format('%r%a');
    } catch (Exception) {
        return null;
    }
}

/** Contagem estilo Counter: [chave => n], ordenada por n desc (estável). */
function contar(iterable $keys): array
{
    $c = [];
    foreach ($keys as $k) {
        $k = $k ?? '';
        $c[$k] = ($c[$k] ?? 0) + 1;
    }
    arsort($c);
    return $c;
}

function pares(array $c): array
{
    $o = [];
    foreach ($c as $k => $v) {
        $o[] = [$k, $v];
    }
    return $o;
}
