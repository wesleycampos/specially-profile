<?php
declare(strict_types=1);

// Porta de entrada: exige login (exceto rodando localmente com php -S) e entrega o painel.

require __DIR__ . '/lib/core.php';

security_headers();
start_session();

if (isset($_GET['sair'])) {
    $_SESSION = [];
    session_destroy();
    header('Location: ./');
    exit;
}

$erro = '';
if (!modo_local() && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals($_SESSION['csrf'] ?? '', (string) ($_POST['csrf'] ?? ''))) {
        $erro = 'Sessão expirada. Tente novamente.';
    } elseif (login_blocked()) {
        $erro = 'Muitas tentativas. Aguarde 15 minutos.';
    } else {
        $login = trim((string) ($_POST['lg'] ?? ''));
        $hash = one('SELECT pass_hash FROM users WHERE username = ?', [$login]);
        if ($hash && password_verify((string) ($_POST['sh'] ?? ''), (string) $hash)) {
            session_regenerate_id(true);
            $_SESSION['user'] = $login;
            login_reset();
            header('Location: ./');
            exit;
        }
        login_fail();
        $erro = 'Login ou senha inválidos.';
    }
}

if (logged_user() === null) {
    $_SESSION['csrf'] = bin2hex(random_bytes(16));
    ?><!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Specially Profile · Acesso</title>
<link rel="stylesheet" href="style.css?v=7">
<style>
  body{display:grid;place-items:center;min-height:100vh;padding:16px}
  .login{width:min(380px,100%);display:grid;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:28px;box-shadow:var(--shadow)}
  .login .logo{width:52px;height:52px;border-radius:16px;background:var(--brand);color:#fff;display:grid;place-items:center;font-weight:800;font-size:22px}
  .login h1{margin:4px 0 0;font-size:21px}
  .login p{margin:0;color:var(--text-2);font-size:13px}
  .login label{display:grid;gap:4px;font-size:12px;font-weight:600;color:var(--text-2)}
  .login input[type=text],.login input[type=password]{width:100%;padding:9px 11px;font-size:14px}
  .login button{justify-content:center;padding:10px;font-size:14px}
  .erro{background:color-mix(in srgb,var(--bad) 14%,transparent);color:var(--bad);border-radius:10px;padding:8px 12px;font-size:13px}
</style>
</head>
<body>
<form class="login" method="post" autocomplete="on">
  <div class="logo">S</div>
  <h1>Specially Profile</h1>
  <p>Gestão do corpo clínico · acesso restrito</p>
  <?php if ($erro): ?><div class="erro" role="alert"><?= htmlspecialchars($erro) ?></div><?php endif; ?>
  <label>Login<input name="lg" type="text" autocomplete="username" required autofocus></label>
  <label>Senha<input name="sh" id="sh" type="password" autocomplete="current-password" required></label>
  <label style="display:flex;gap:6px;align-items:center;font-weight:400"><input type="checkbox" onchange="document.getElementById('sh').type=this.checked?'text':'password'"> Mostrar senha</label>
  <input type="hidden" name="csrf" value="<?= $_SESSION['csrf'] ?>">
  <button class="primary" type="submit">Entrar</button>
</form>
</body>
</html>
<?php
    exit;
}

header('Content-Type: text/html; charset=UTF-8');
$html = (string) file_get_contents(__DIR__ . '/index.html');
if (!modo_local()) {
    $sair = '<a href="?sair" title="Sair (' . htmlspecialchars((string) logged_user()) . ')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>Sair</a>';
    $html = str_replace('<!--SAIR-->', $sair, $html);
}
echo $html;
