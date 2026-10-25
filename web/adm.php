<?php
declare(strict_types=1);

// Administração pela linha de comando (só funciona via terminal/SSH).
//   php adm.php usuario <login>            cria o usuário ou troca a senha (gera uma senha forte e mostra uma única vez)
//   php adm.php usuario <login> <senha>    define a senha informada
//   php adm.php remover <login>
//   php adm.php usuarios
//   php adm.php importar <tipo> <arquivo.xlsx>   tipo: saidas | ativos | profissionais | atendimentos | avaliacoes
//   php adm.php modelos <pasta>                  gera as planilhas-modelo

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/lib/core.php';
require __DIR__ . '/lib/importar.php';

$a = $argv;
switch ($a[1] ?? '') {
    case 'usuario':
        $login = trim($a[2] ?? '');
        if ($login === '') {
            exit("Informe o login.\n");
        }
        $senha = $a[3] ?? rtrim(strtr(base64_encode(random_bytes(12)), '+/', 'Kx'), '=');
        q('INSERT INTO users(username, pass_hash) VALUES (?, ?) ON CONFLICT(username) DO UPDATE SET pass_hash = excluded.pass_hash',
            [$login, password_hash($senha, PASSWORD_DEFAULT)]);
        echo isset($a[3]) ? "Senha de '$login' definida.\n" : "Usuário '$login' — senha: $senha\n";
        break;
    case 'remover':
        q('DELETE FROM users WHERE username = ?', [$a[2] ?? '']);
        echo "Removido.\n";
        break;
    case 'usuarios':
        foreach (rows('SELECT username, criado_em FROM users ORDER BY username') as $u) {
            echo "$u[username]  (desde $u[criado_em])\n";
        }
        break;
    case 'importar':
        $fn = IMPORTADORES[$a[2] ?? ''] ?? null;
        if (!$fn || !is_file($a[3] ?? '')) {
            exit("Uso: php adm.php importar <tipo> <arquivo.xlsx>\n");
        }
        echo json_encode($fn((string) file_get_contents($a[3])), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), "\n";
        break;
    case 'modelos':
        $dir = $a[2] ?? '.';
        foreach (['profissionais', 'ativos', 'atendimentos', 'avaliacoes', 'saidas'] as $t) {
            file_put_contents("$dir/$t.xlsx", modelo($t));
        }
        echo "Modelos gerados em $dir\n";
        break;
    default:
        echo "Comandos: usuario <login> [senha] | remover <login> | usuarios | importar <tipo> <arquivo> | modelos <pasta>\n";
}
