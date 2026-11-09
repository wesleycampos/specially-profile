<?php
declare(strict_types=1);

// Repasse: quanto a clínica paga a cada terapeuta e quanto recebe pelas sessões dele, mês a mês.
//
// Tabela de remuneração (remuneracao): cada linha vale a partir de "desde" até a próxima linha do mesmo terapeuta,
// então um reajuste é só uma linha nova e os meses antigos continuam calculados com o valor da época.
//   fixo        valor = salário/valor mensal fixo
//   hora        valor = R$ por hora atendida  (horas = sessões × duração da sessão)
//   sessao      valor = R$ por sessão realizada
//   percentual  valor = % do que a clínica recebe pelas sessões do terapeuta
// Recebido = valor do atendimento; se vazio, valor da sessão do convênio do paciente; se vazio, o valor padrão.

const REPASSE_TIPOS = ['fixo' => 'Fixo mensal', 'hora' => 'Por hora', 'sessao' => 'Por sessão', 'percentual' => '% do recebido'];
const REPASSE_PADRAO = ['sessao_min' => 45, 'valor_padrao' => null, 'pagar_faltas' => false];

function repasse_config(): array
{
    return array_merge(REPASSE_PADRAO, (array) config_get('repasse', []));
}

function repasse_salvar_config(array $b): array
{
    $c = repasse_config();
    if (array_key_exists('sessao_min', $b)) {
        $v = (int) $b['sessao_min'];
        if ($v < 10 || $v > 240) {
            throw new InvalidArgumentException('Duração da sessão entre 10 e 240 minutos.');
        }
        $c['sessao_min'] = $v;
    }
    if (array_key_exists('valor_padrao', $b)) {
        $c['valor_padrao'] = is_numeric($b['valor_padrao']) && $b['valor_padrao'] >= 0 ? (float) $b['valor_padrao'] : null;
        $c['valor_padrao_sim'] = false;
    }
    if (array_key_exists('pagar_faltas', $b)) {
        $c['pagar_faltas'] = (bool) $b['pagar_faltas'];
    }
    config_set('repasse', $c);
    return $c;
}

/** Regra vigente no mês (AAAA-MM) dentre as linhas do terapeuta, ordenadas por "desde" crescente. */
function repasse_regra(array $regras, string $mes): ?array
{
    $fim = $mes . '-31';
    $r = null;
    foreach ($regras as $x) {
        if ($x['desde'] <= $fim) {
            $r = $x;
        }
    }
    return $r;
}

/** Valor pago num mês, pela regra, sessões, faltas e recebido do mês. */
function repasse_pago(?array $regra, int $ses, int $fal, float $rec, array $cfg): ?float
{
    if (!$regra) {
        return null;
    }
    $n = $ses + ($cfg['pagar_faltas'] ? $fal : 0);
    $v = (float) $regra['valor'];
    return match ($regra['tipo']) {
        'fixo' => $v,
        'hora' => round($n * $cfg['sessao_min'] / 60 * $v, 2),
        'sessao' => round($n * $v, 2),
        'percentual' => round($rec * $v / 100, 2),
        default => null,
    };
}

/**
 * Pagamento e recebimento por terapeuta e mês. Filtros: de / ate (AAAA-MM), prof (id).
 * Volta os meses, a lista de terapeutas (com a regra atual e os números de cada mês) e a configuração.
 */
function repasse(array $f): array
{
    $cfg = repasse_config();
    $ultimo = one('SELECT MAX(substr(data, 1, 7)) FROM atendimentos') ?: date('Y-m');
    $ate = preg_match('/^\d{4}-\d{2}$/', (string) ($f['ate'] ?? '')) ? $f['ate'] : $ultimo;
    $de = preg_match('/^\d{4}-\d{2}$/', (string) ($f['de'] ?? '')) ? $f['de']
        : max((new DateTimeImmutable($ate . '-01'))->modify('-11 months')->format('Y-m'), one('SELECT MIN(substr(data, 1, 7)) FROM atendimentos') ?: $ate);
    $meses = [];
    for ($d = new DateTimeImmutable($de . '-01'); $d->format('Y-m') <= $ate; $d = $d->modify('+1 month')) {
        $meses[] = $d->format('Y-m');
    }
    $pid = isset($f['prof']) ? (int) $f['prof'] : null;

    $regras = [];
    foreach (rows('SELECT id, profissional_id, desde, tipo, valor, obs, simulado FROM remuneracao ' . ($pid ? 'WHERE profissional_id = ' . $pid : '') . ' ORDER BY desde') as $r) {
        $regras[(int) $r['profissional_id']][] = $r;
    }
    $pad = $cfg['valor_padrao'];
    $nums = [];
    $semValor = 0;
    foreach (rows("SELECT a.profissional_id pid, substr(a.data, 1, 7) mes,
                          SUM(a.status = 'realizado') ses, SUM(a.status = 'falta') fal,
                          SUM(CASE WHEN a.status = 'realizado' THEN COALESCE(a.valor, c.valor_sessao, :pad, 0) END) rec,
                          SUM(a.status = 'realizado' AND a.valor IS NULL AND c.valor_sessao IS NULL) sem_valor
                   FROM atendimentos a JOIN pacientes p ON p.id = a.paciente_id LEFT JOIN convenios c ON c.id = p.convenio_id
                   WHERE a.data BETWEEN :de AND :ate" . ($pid ? ' AND a.profissional_id = :pid' : '') . '
                   GROUP BY 1, 2', ['pad' => $pad, 'de' => $de . '-01', 'ate' => $ate . '-31'] + ($pid ? ['pid' => $pid] : [])) as $r) {
        $nums[(int) $r['pid']][$r['mes']] = [(int) $r['ses'], (int) $r['fal'], (float) $r['rec']];
        if ($pad === null) {
            $semValor += (int) $r['sem_valor'];
        }
    }
    $ids = array_unique(array_merge(array_keys($regras), array_keys($nums)));
    if (!$ids) {
        $ids = [0];
    }
    $profs = rows('SELECT p.id, p.nome, p.especialidade_id esp_id, e.nome esp, p.unidade, p.contratacao, p.ativo
                   FROM profissionais p JOIN especialidades e ON e.id = p.especialidade_id
                   WHERE p.id IN (' . implode(',', array_map('intval', $ids)) . ') ORDER BY p.nome');
    $hoje = date('Y-m');
    $out = [];
    foreach ($profs as $p) {
        $id = (int) $p['id'];
        $rg = $regras[$id] ?? [];
        $ultSes = isset($nums[$id]) ? max(array_keys($nums[$id])) : null;
        $m = [];
        foreach ($meses as $mes) {
            [$ses, $fal, $rec] = $nums[$id][$mes] ?? [0, 0, 0.0];
            $regra = repasse_regra($rg, $mes);
            // fixo: paga do início da vigência enquanto o terapeuta está na casa (ativo, ou até o último mês com sessão)
            if ($regra && $regra['tipo'] === 'fixo' && !$ses && !($p['ativo'] ? $mes <= $hoje : ($ultSes && $mes <= $ultSes))) {
                $regra = null;
            }
            $pago = repasse_pago($regra, $ses, $fal, $rec, $cfg);
            if (!$ses && !$fal && !$pago) {
                continue;
            }
            $m[$mes] = ['s' => $ses, 'f' => $fal, 'h' => round($ses * $cfg['sessao_min'] / 60, 1), 'p' => $pago, 'r' => round($rec, 2),
                        't' => $regra['tipo'] ?? null];
        }
        if (!$m && !$rg) {
            continue;
        }
        $atual = $rg ? end($rg) : null;
        $out[] = $p + ['ativo' => (int) $p['ativo'], 'regra' => $atual ? ['tipo' => $atual['tipo'], 'valor' => (float) $atual['valor'], 'desde' => $atual['desde'], 'simulado' => (int) $atual['simulado']] : null,
                       'm' => (object) $m];
    }
    $sim = (int) one('SELECT COUNT(*) FROM remuneracao WHERE simulado = 1');
    return ['meses' => $meses, 'ultimo' => $ultimo, 'hoje' => $hoje, 'profissionais' => $out, 'config' => $cfg, 'tipos' => REPASSE_TIPOS,
            'convenios' => rows('SELECT id, nome, valor_sessao FROM convenios ORDER BY nome'),
            'simulados' => $sim, 'conv_simulados' => count((array) config_get('repasse_sim_conv', [])),
            'sem_tabela_ativos' => (int) one('SELECT COUNT(*) FROM profissionais p WHERE p.ativo = 1 AND NOT EXISTS (SELECT 1 FROM remuneracao r WHERE r.profissional_id = p.id)'),
            'sessoes_sem_valor' => $semValor];
}

/** Histórico da tabela de remuneração de um terapeuta. */
function remuneracao_prof(int $pid): array
{
    return rows('SELECT id, desde, tipo, valor, obs, simulado FROM remuneracao WHERE profissional_id = ? ORDER BY desde DESC', [$pid]);
}

function remuneracao_salvar(array $b): array
{
    $pid = (int) ($b['profissional_id'] ?? 0);
    $desde = (string) ($b['desde'] ?? '');
    $tipo = (string) ($b['tipo'] ?? '');
    $valor = $b['valor'] ?? null;
    if (!$pid || !one('SELECT 1 FROM profissionais WHERE id = ?', [$pid])) {
        throw new InvalidArgumentException('Terapeuta não encontrado.');
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $desde)) {
        throw new InvalidArgumentException('Informe a data de início da vigência.');
    }
    if (!isset(REPASSE_TIPOS[$tipo])) {
        throw new InvalidArgumentException('Escolha a forma de pagamento.');
    }
    if (!is_numeric($valor) || $valor < 0 || ($tipo === 'percentual' && $valor > 100)) {
        throw new InvalidArgumentException($tipo === 'percentual' ? 'Percentual entre 0 e 100.' : 'Informe um valor válido.');
    }
    $obs = trim((string) ($b['obs'] ?? '')) ?: null;
    if (!empty($b['id'])) {
        q('UPDATE remuneracao SET desde = ?, tipo = ?, valor = ?, obs = ?, simulado = 0 WHERE id = ? AND profissional_id = ?', [$desde, $tipo, (float) $valor, $obs, (int) $b['id'], $pid]);
        return ['id' => (int) $b['id']];
    }
    q('INSERT INTO remuneracao(profissional_id, desde, tipo, valor, obs, simulado) VALUES (?,?,?,?,?,0)
       ON CONFLICT(profissional_id, desde) DO UPDATE SET tipo = excluded.tipo, valor = excluded.valor, obs = excluded.obs, simulado = 0',
      [$pid, $desde, $tipo, (float) $valor, $obs]);
    return ['id' => (int) one('SELECT id FROM remuneracao WHERE profissional_id = ? AND desde = ?', [$pid, $desde])];
}

// ------------------------------------------------------------------ dados simulados (até chegar a tabela real)

/** Cria remuneração simulada para os ativos sem tabela e, se faltar, valores de recebimento por convênio. */
function repasse_simular(): array
{
    mt_srand(20261109);
    $faixa = fn(float $a, float $b, float $passo) => round(($a + (mt_rand() / mt_getrandmax()) * ($b - $a)) / $passo) * $passo;
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $n = 0;
        foreach (rows('SELECT p.id, p.contratacao, e.nome esp FROM profissionais p JOIN especialidades e ON e.id = p.especialidade_id
                       WHERE p.ativo = 1 AND NOT EXISTS (SELECT 1 FROM remuneracao r WHERE r.profissional_id = p.id) ORDER BY p.id') as $p) {
            $aba = stripos($p['esp'], 'aba') !== false || stripos($p['esp'], 'acompanhamento') !== false;
            [$tipo, $valor] = match ($p['contratacao']) {
                'CLT' => ['fixo', $faixa($aba ? 2200 : 3200, $aba ? 3000 : 5200, 50)],
                'Temporário' => ['hora', $faixa(22, 35, 1)],
                'PJ' => mt_rand(1, 10) <= 6 ? ['hora', $faixa(38, 70, 1)] : (mt_rand(0, 1) ? ['sessao', $faixa(32, 55, 1)] : ['percentual', $faixa(35, 50, 1)]),
                default => ['sessao', $faixa(30, 50, 1)],
            };
            q("INSERT INTO remuneracao(profissional_id, desde, tipo, valor, obs, simulado) VALUES (?, '2026-01-01', ?, ?, 'simulado', 1)", [$p['id'], $tipo, $valor]);
            if (mt_rand(1, 10) <= 3 && $tipo !== 'percentual') {   // parte da equipe com reajuste em julho, para a comparação mês a mês ter movimento
                q("INSERT INTO remuneracao(profissional_id, desde, tipo, valor, obs, simulado) VALUES (?, '2026-07-01', ?, ?, 'simulado (reajuste)', 1)",
                  [$p['id'], $tipo, round($valor * (1 + mt_rand(5, 12) / 100), $tipo === 'fixo' ? -1 : 0)]);
            }
            $n++;
        }
        $conv = (array) config_get('repasse_sim_conv', []);
        foreach (rows('SELECT id, nome FROM convenios WHERE valor_sessao IS NULL') as $c) {
            $v = preg_match('/PARTICULAR/i', $c['nome']) ? 220.0 : $faixa(70, 160, 5);
            q('UPDATE convenios SET valor_sessao = ? WHERE id = ?', [$v, $c['id']]);
            $conv[] = (int) $c['id'];
        }
        config_set('repasse_sim_conv', array_values(array_unique($conv)));
        $cfg = repasse_config();
        if ($cfg['valor_padrao'] === null) {
            $cfg['valor_padrao'] = 110.0;
            $cfg['valor_padrao_sim'] = true;
            config_set('repasse', $cfg);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return ['criados' => $n];
}

/** Apaga só o que foi simulado: remunerações marcadas, valores de convênio e o valor padrão criados pela simulação. */
function repasse_limpar_simulados(): array
{
    $n = q('DELETE FROM remuneracao WHERE simulado = 1')->rowCount();
    $conv = array_map('intval', (array) config_get('repasse_sim_conv', []));
    if ($conv) {
        q('UPDATE convenios SET valor_sessao = NULL WHERE id IN (' . implode(',', $conv) . ')');
    }
    config_set('repasse_sim_conv', []);
    $cfg = repasse_config();
    if (!empty($cfg['valor_padrao_sim'])) {
        $cfg['valor_padrao'] = null;
        $cfg['valor_padrao_sim'] = false;
        config_set('repasse', $cfg);
    }
    return ['apagados' => $n, 'convenios' => count($conv)];
}
