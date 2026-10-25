<?php
// Roteador do servidor local (php -S localhost:8765 -t web web/router.php). Em produção o .htaccess faz este papel.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('#^/api/(.*)$#', $path, $m)) {
    $_GET['r'] = $m[1];
    require __DIR__ . '/api.php';
    return true;
}
if ($path === '/' || $path === '/index.php') {
    require __DIR__ . '/index.php';
    return true;
}
if (preg_match('#^/(lib/|config\.local|adm\.php)#', $path)) {
    http_response_code(404);
    return true;
}
return false; // arquivos estáticos (css, js, vendor)
