<?php
declare(strict_types=1);

// Conector somente leitura para o Specially Central (super dash).
// Entrega um retrato do banco em JSON. Não usa a sessão do painel: exige o cabeçalho
//   Authorization: Bearer <token>
// com o token definido em config.local.php ('integracao_token') ou no arquivo integracao.token ao lado do banco
// (criado pelo deploy do Specially Central). Sem token o conector fica desligado, exceto rodando localmente
// com php -S, onde o servidor só atende a própria máquina.

require __DIR__ . '/lib/core.php';

security_headers();
header('Content-Type: application/json; charset=utf-8');

function negar(int $code, string $msg): never
{
    http_response_code($code);
    echo json_encode(['erro' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

$arq = dirname(db_path()) . '/integracao.token';
$token = (string) (cfg()['integracao_token'] ?? (is_file($arq) ? trim((string) file_get_contents($arq)) : '') ?: getenv('INTEGRACAO_TOKEN') ?: '');
if ($token === '') {
    if (!modo_local()) {
        negar(404, 'não encontrado');
    }
} else {
    $auth = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (!hash_equals('Bearer ' . $token, $auth)) {
        usleep(300000);
        negar(401, 'token inválido');
    }
}
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    negar(405, 'somente leitura');
}

try {
    $out = [
        'fonte' => 'profile',
        'versao' => 1,
        'gerado_em' => date('c'),
        'especialidades' => rows('SELECT id, nome, abrev FROM especialidades'),
        'convenios' => rows('SELECT id, nome, valor_sessao FROM convenios'),
        'profissionais' => rows('SELECT id, nome, especialidade_id, registro_conselho, formacao, pos_graduacao, data_admissao,
                                        carga_horaria_semanal, meta_pacientes, modalidade, ativo FROM profissionais'),
        'pacientes' => rows('SELECT id, nome, convenio_id, data_inicio, status, observacoes FROM pacientes'),
        'vinculos' => rows('SELECT paciente_id, profissional_id, data_inicio, data_fim, modalidade, grupo_id FROM vinculos'),
        'grupos' => rows('SELECT id, nome, profissional_id, dia_horario, capacidade, ativo FROM grupos'),
        'saidas' => rows('SELECT id, paciente_id, convenio_id, data_saida, motivo_texto, motivo_categoria FROM saidas'),
        'saida_profissionais' => rows('SELECT saida_id, profissional_id, modalidade, grupo_id FROM saida_profissionais'),
        // atendimentos resumidos por mês (paciente × profissional × status), para não trafegar sessão a sessão
        'atendimentos_mes' => rows("SELECT paciente_id, profissional_id, substr(data,1,7) mes, status, COUNT(*) n,
                                           SUM(valor) valor, MAX(data) ultima
                                    FROM atendimentos GROUP BY 1, 2, 3, 4"),
        'avaliacoes' => rows('SELECT id, data, paciente_id, profissional_id, nota, comentario FROM avaliacoes'),
    ];
    echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PRESERVE_ZERO_FRACTION);
} catch (Throwable $e) {
    error_log('[profile/integracao] ' . $e);
    negar(500, 'erro interno');
}
