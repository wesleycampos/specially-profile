<?php
declare(strict_types=1);

// Indicadores do painel: profissionais, áreas, perdas, pacientes, satisfação.

function by_id(array $rows): array
{
    $o = [];
    foreach ($rows as $r) {
        $o[$r['id']] = $r;
    }
    return $o;
}

function dashboard(array $q): array
{
    $d0 = !empty($q['de']) ? $q['de'] . '-01' : '0000-01-01';
    $d1 = !empty($q['ate']) ? $q['ate'] . '-31' : '9999-12-31';
    $fEsp = !empty($q['esp']) ? (int) $q['esp'] : null;
    $fConv = !empty($q['conv']) ? (int) $q['conv'] : null;
    $fMod = in_array($q['mod'] ?? '', ['individual', 'grupo'], true) ? $q['mod'] : null;

    $esps = by_id(rows('SELECT * FROM especialidades ORDER BY nome'));
    $convs = by_id(rows('SELECT * FROM convenios ORDER BY nome'));
    $profs = by_id(rows('SELECT * FROM profissionais'));
    $pacs = by_id(rows('SELECT * FROM pacientes'));
    $grupos = by_id(rows('SELECT * FROM grupos'));
    $comp = [];
    foreach (rows('SELECT * FROM competencias ORDER BY nivel DESC, competencia') as $r) {
        $comp[$r['profissional_id']][] = ['nome' => $r['competencia'], 'nivel' => $r['nivel'], 'tipo' => $r['tipo']];
    }
    $convOk = fn($cid) => $fConv === null || (int) $cid === $fConv;
    $profOk = fn($pid) => $fEsp === null || (int) $profs[$pid]['especialidade_id'] === $fEsp;
    // modalidade do vínculo: marcação explícita ou, se vazia, o padrão do cadastro do profissional
    $effMod = fn($linkMod, $pid) => $linkMod ?: ($profs[$pid]['modalidade'] === 'grupo' ? 'grupo' : 'individual');

    // --- saídas
    $sp = [];
    foreach (rows('SELECT * FROM saida_profissionais') as $r) {
        $sp[$r['saida_id']][] = ['id' => $r['profissional_id'], 'mod' => $effMod($r['modalidade'], $r['profissional_id']),
                                 'marcado' => $r['modalidade'] !== null, 'grupo_id' => $r['grupo_id']];
    }
    $saidas = [];
    foreach (rows('SELECT * FROM saidas WHERE data_saida BETWEEN ? AND ? ORDER BY data_saida', [$d0, $d1]) as $s) {
        $s['links'] = $sp[$s['id']] ?? [];
        $s['conta'] = array_values(array_filter($s['links'], fn($l) => $profOk($l['id']) && (!$fMod || $l['mod'] === $fMod)));
        $s['profs'] = array_column($s['conta'], 'id');
        if (!$convOk($s['convenio_id']) || (($fEsp || $fMod) && !$s['conta'])) {
            continue;
        }
        $saidas[] = $s;
    }

    // --- carteira ativa
    $vinc = rows("SELECT v.* FROM vinculos v JOIN pacientes p ON p.id=v.paciente_id WHERE v.data_fim IS NULL AND p.status='ativo'");
    $hasAtivos = $vinc || (int) one("SELECT COUNT(*) FROM pacientes WHERE status='ativo'") > 0;
    $vincAtivos = [];
    foreach ($vinc as $v) {
        $v['mod'] = $effMod($v['modalidade'], $v['profissional_id']);
        if ($convOk($pacs[$v['paciente_id']]['convenio_id']) && $profOk($v['profissional_id']) && (!$fMod || $v['mod'] === $fMod)) {
            $vincAtivos[] = $v;
        }
    }

    // --- atendimentos e avaliações
    // Somado no banco por profissional, paciente, mês e status (o histórico do Hipo tem centenas de milhares de sessões;
    // carregar linha a linha estoura a memória do PHP). Cada item traz n = quantidade e valor = total do grupo.
    $atend = [];
    foreach (rows("SELECT profissional_id, paciente_id, substr(data, 1, 7) mes, status, COUNT(*) n,
                          COALESCE(SUM(valor), 0) soma, SUM(valor IS NULL) sem_valor
                   FROM atendimentos WHERE data BETWEEN ? AND ? GROUP BY 1, 2, 3, 4", [$d0, $d1]) as $a) {
        if (!$profOk($a['profissional_id']) || !$convOk($pacs[$a['paciente_id']]['convenio_id'])) {
            continue;
        }
        $a['n'] = (int) $a['n'];
        $a['valor'] = (float) $a['soma'];
        if ($a['status'] === 'realizado' && $a['sem_valor']) {   // sem valor no atendimento: valor da sessão do convênio
            $a['valor'] += (int) $a['sem_valor'] * (float) ($convs[$pacs[$a['paciente_id']]['convenio_id']]['valor_sessao'] ?? 0);
        }
        $atend[] = $a;
    }
    $aval = array_values(array_filter(rows('SELECT * FROM avaliacoes WHERE data BETWEEN ? AND ?', [$d0, $d1]),
        fn($a) => (($a['profissional_id'] === null && $fEsp === null) || ($a['profissional_id'] && $profOk($a['profissional_id'])))
            && ($a['paciente_id'] === null || $convOk($pacs[$a['paciente_id']]['convenio_id']))));
    $hasAtend = (int) one('SELECT COUNT(*) FROM atendimentos') > 0;
    $hasAval = (int) one('SELECT COUNT(*) FROM avaliacoes') > 0;

    // --- métricas por profissional
    $P = [];
    $pm = function ($pid) use (&$P, $profs, $esps, $comp, $grupos) {
        if (!isset($P[$pid])) {
            $p = $profs[$pid];
            $P[$pid] = ['id' => $pid, 'nome' => $p['nome'], 'esp_id' => $p['especialidade_id'], 'esp' => $esps[$p['especialidade_id']]['nome'],
                'foto' => $p['foto_url'], 'formacao' => $p['formacao'], 'pos' => $p['pos_graduacao'], 'ativo' => $p['ativo'],
                'meta' => $p['meta_pacientes'], 'admissao' => $p['data_admissao'], 'competencias' => array_slice($comp[$pid] ?? [], 0, 6),
                'modalidade' => $p['modalidade'],
                'grupos' => count(array_filter($grupos, fn($g) => $g['profissional_id'] == $pid && $g['ativo'])),
                'saidas' => 0, 'saidas_faltas' => 0, 'saidas_grupo' => 0, 'evitaveis' => 0, 'evitaveis_ind' => 0,
                'motivos' => [], 'carteira' => 0, 'carteira_grupo' => 0, 'perm' => [],
                'sessoes' => 0, 'faltas' => 0, 'faturamento' => 0.0, 'notas' => []];
        }
        return $pid;
    };
    foreach ($saidas as $s) {
        $ev = in_array($s['motivo_categoria'], EVITAVEIS, true);
        foreach ($s['conta'] as $l) {
            $m = &$P[$pm($l['id'])];
            $m['saidas']++;
            $m['saidas_faltas'] += (int) ($s['motivo_categoria'] === FALTAS);
            $m['saidas_grupo'] += (int) ($l['mod'] === 'grupo');
            $m['evitaveis'] += (int) $ev;
            $m['evitaveis_ind'] += (int) ($ev && $l['mod'] !== 'grupo');
            $m['motivos'][$s['motivo_categoria']] = ($m['motivos'][$s['motivo_categoria']] ?? 0) + 1;
            unset($m);
        }
    }
    foreach ($vincAtivos as $v) {
        $m = &$P[$pm($v['profissional_id'])];
        $m['carteira']++;
        $m['carteira_grupo'] += (int) ($v['mod'] === 'grupo');
        $m['perm'][] = dias($v['data_inicio'] ?: $pacs[$v['paciente_id']]['data_inicio']);
        unset($m);
    }
    foreach ($atend as $a) {
        $m = &$P[$pm($a['profissional_id'])];
        if ($a['status'] === 'realizado') {
            $m['sessoes'] += $a['n'];
            $m['faturamento'] += $a['valor'];
        } elseif (in_array($a['status'], ['falta', 'falta_justificada'], true)) {
            $m['faltas'] += $a['n'];
        }
        unset($m);
    }
    foreach ($aval as $a) {
        if ($a['profissional_id']) {
            $P[$pm($a['profissional_id'])]['notas'][] = $a['nota'];
        }
    }
    foreach ($profs as $pid => $p) {   // inclui cadastrados ativos sem movimento
        if ($p['ativo'] && $profOk($pid)) {
            $pm($pid);
        }
    }

    $lista = [];
    foreach ($P as $m) {
        $agend = $m['sessoes'] + $m['faltas'];
        $sInd = $m['saidas'] - $m['saidas_grupo'];
        $cInd = $m['carteira'] - $m['carteira_grupo'];
        $base = $m['carteira'] + $m['saidas'];
        arsort($m['motivos']);
        $pm_ = mean($m['perm']);
        $m += [
            'saidas_ind' => $sInd,
            'pct_grupo' => pct($m['saidas_grupo'], $m['saidas']),
            'pct_evitaveis' => pct($m['evitaveis'], $m['saidas']),
            'taxa_retencao' => $hasAtivos && $base ? round(100 - 100 * $m['saidas'] / $base, 1) : null,
            'taxa_perda_ind' => $hasAtivos && ($cInd + $sInd) ? pct($sInd, $cInd + $sInd) : null,
            'taxa_perda_grupo' => $hasAtivos && ($m['carteira_grupo'] + $m['saidas_grupo']) ? pct($m['saidas_grupo'], $m['carteira_grupo'] + $m['saidas_grupo']) : null,
            'pct_faltas_saida' => pct($m['saidas_faltas'], $m['saidas']),
            'motivo_top' => $m['motivos'] ? (string) array_key_first($m['motivos']) : null,
            'taxa_perda' => $hasAtivos && $base ? pct($m['saidas'], $base) : null,
            'ocupacao' => $m['meta'] ? pct($m['carteira'], $m['meta']) : null,
            'taxa_falta' => $agend ? pct($m['faltas'], $agend) : null,
            'nota' => $m['notas'] ? round(mean($m['notas']), 1) : null,
            'nps' => nps($m['notas']), 'n_aval' => count($m['notas']),
            'perm_media' => $pm_ !== null ? (int) round($pm_) : null,
        ];
        $m['faturamento'] = round($m['faturamento'], 2);
        $m['motivos'] = (object) $m['motivos'];
        unset($m['notas'], $m['perm']);
        $lista[$m['id']] = $m;
    }

    // --- score (0–100), normalizado dentro da especialidade
    $normComp = function (array $group, string $key, bool $higher, ?callable $minOk = null) use (&$lista) {
        $ok = fn($id) => $lista[$id][$key] !== null && (!$minOk || $minOk($lista[$id]));
        $vals = [];
        foreach ($group as $id) {
            if ($ok($id)) {
                $vals[] = $lista[$id][$key];
            }
        }
        if (count($vals) < 2) {
            return [];
        }
        [$lo, $hi] = [min($vals), max($vals)];
        $out = [];
        foreach ($group as $id) {
            if (!$ok($id)) {
                continue;
            }
            $x = $hi == $lo ? 0.5 : ($lista[$id][$key] - $lo) / ($hi - $lo);
            $out[$id] = (int) round(100 * ($higher ? $x : 1 - $x));
        }
        return $out;
    };
    $byEsp = [];
    foreach ($lista as $id => $m) {
        $byEsp[$m['esp_id']][] = $id;
    }
    foreach ($byEsp as $group) {
        // retenção: perdas individuais (grupo tem dinâmica própria). Sem carteira, usa perdas evitáveis individuais.
        foreach ($group as $id) {
            $m = $lista[$id];
            $soGrupo = $m['saidas'] > 0 && $m['saidas_grupo'] === $m['saidas'];
            $lista[$id]['_ret'] = $hasAtivos ? ($m['taxa_perda_ind'] ?? $m['taxa_perda']) : ($soGrupo ? null : $m['evitaveis_ind']);
        }
        $comps = [
            'retencao' => $normComp($group, '_ret', false),
            'assiduidade' => $normComp($group, 'taxa_falta', false, fn($m) => $m['sessoes'] + $m['faltas'] >= 10),
            'satisfacao' => $normComp($group, 'nota', true, fn($m) => $m['n_aval'] >= 3),
            'produtividade' => $normComp($group, 'faturamento', true, fn($m) => $m['sessoes'] > 0),
        ];
        foreach ($group as $id) {
            $parts = [];
            foreach ($comps as $k => $v) {
                if (isset($v[$id])) {
                    $parts[$k] = $v[$id];
                }
            }
            $w = array_sum(array_map(fn($k) => PESOS[$k], array_keys($parts)));
            $lista[$id]['score'] = $w ? (int) round(array_sum(array_map(fn($k) => PESOS[$k] * $parts[$k], array_keys($parts))) / $w) : null;
            $lista[$id]['score_partes'] = (object) $parts;
            unset($lista[$id]['_ret']);
        }
    }

    // --- especialidades
    $areas = [];
    foreach ($esps as $eid => $e) {
        if ($fEsp && $eid !== $fEsp) {
            continue;
        }
        $g = array_values(array_filter($lista, fn($m) => $m['esp_id'] === $eid));
        $sE = array_values(array_filter($saidas, function ($s) use ($profs, $eid) {
            foreach ($s['profs'] as $p) {
                if ($profs[$p]['especialidade_id'] === $eid) {
                    return true;
                }
            }
            return false;
        }));
        $sEg = array_filter($sE, function ($s) use ($profs, $eid) {
            foreach ($s['conta'] as $l) {
                if ($l['mod'] === 'grupo' && $profs[$l['id']]['especialidade_id'] === $eid) {
                    return true;
                }
            }
            return false;
        });
        $cart = array_sum(array_column($g, 'carteira'));
        $sess = array_sum(array_column($g, 'sessoes'));
        $flt = array_sum(array_column($g, 'faltas'));
        $fat = array_sum(array_column($g, 'faturamento'));
        $notas = [];
        foreach ($aval as $a) {
            if ($a['profissional_id'] && $profs[$a['profissional_id']]['especialidade_id'] === $eid) {
                $notas[] = $a['nota'];
            }
        }
        $nProf = count(array_filter($g, fn($m) => $m['saidas'] || $m['carteira'] || $m['sessoes']));
        $mot = contar(array_column($sE, 'motivo_categoria'));
        $nS = count($sE);
        $scores = array_values(array_filter(array_column($g, 'score'), fn($x) => $x !== null));
        $areas[] = [
            'id' => $eid, 'nome' => $e['nome'], 'abrev' => $e['abrev'], 'profissionais' => $nProf,
            'saidas' => $nS, 'saidas_por_prof' => $nProf ? round($nS / $nProf, 1) : null,
            'saidas_grupo' => count($sEg), 'pct_grupo' => pct(count($sEg), $nS),
            'pct_evitaveis' => pct(array_sum(array_map(fn($k) => $mot[$k] ?? 0, EVITAVEIS)), $nS),
            'taxa_retencao' => $hasAtivos && ($cart + $nS) ? round(100 - 100 * $nS / ($cart + $nS), 1) : null,
            'pct_faltas_saida' => pct($mot[FALTAS] ?? 0, $nS), 'motivo_top' => $mot ? (string) array_key_first($mot) : null,
            'motivos' => (object) $mot, 'carteira' => $cart, 'taxa_perda' => $hasAtivos && ($cart + $nS) ? pct($nS, $cart + $nS) : null,
            'sessoes' => $sess, 'faltas' => $flt, 'taxa_falta' => ($sess + $flt) ? pct($flt, $sess + $flt) : null,
            'faturamento' => round($fat, 2), 'fat_por_prof' => $nProf ? round($fat / $nProf, 2) : null,
            'nota' => $notas ? round(mean($notas), 1) : null, 'nps' => nps($notas), 'n_aval' => count($notas),
            'score' => $scores ? (int) round(mean($scores)) : null,
        ];
    }
    usort($areas, fn($a, $b) => $b['saidas'] <=> $a['saidas']);

    // --- séries mensais
    $meses = [];
    $mes = function ($k) use (&$meses) {
        $meses[$k] ??= ['saidas' => [], 'sessoes' => 0, 'faltas' => 0, 'faturamento' => 0.0];
        return $k;
    };
    foreach ($saidas as $s) {
        $k = $mes(substr($s['data_saida'], 0, 7));
        $meses[$k]['saidas'][$s['motivo_categoria']] = ($meses[$k]['saidas'][$s['motivo_categoria']] ?? 0) + 1;
    }
    foreach ($atend as $a) {
        $k = $mes($a['mes']);
        if ($a['status'] === 'realizado') {
            $meses[$k]['sessoes'] += $a['n'];
            $meses[$k]['faturamento'] += $a['valor'];
        } elseif (in_array($a['status'], ['falta', 'falta_justificada'], true)) {
            $meses[$k]['faltas'] += $a['n'];
        }
    }
    ksort($meses);
    $serie = [];
    foreach ($meses as $k => $v) {
        $serie[] = ['mes' => $k, 'saidas' => (object) $v['saidas'], 'total_saidas' => array_sum($v['saidas']), 'sessoes' => $v['sessoes'],
                    'faltas' => $v['faltas'], 'faturamento' => round($v['faturamento'], 2)];
    }

    // --- pacientes
    $ativos = array_values(array_filter($pacs, fn($p) => $p['status'] === 'ativo' && $convOk($p['convenio_id'])));
    if ($fEsp) {
        $ids = array_flip(array_column($vincAtivos, 'paciente_id'));
        $ativos = array_values(array_filter($ativos, fn($p) => isset($ids[$p['id']])));
    }
    $vprof = [];
    foreach ($vincAtivos as $v) {
        $vprof[$v['paciente_id']][] = $v['profissional_id'];
    }
    $antigos = array_values(array_filter($ativos, fn($p) => $p['data_inicio']));
    usort($antigos, fn($a, $b) => strcmp($a['data_inicio'], $b['data_inicio']));
    $antigos = array_slice($antigos, 0, 25);
    $faltPac = [];
    foreach ($atend as $a) {
        $faltPac[$a['paciente_id']] ??= [0, 0];
        if ($a['status'] === 'realizado') {
            $faltPac[$a['paciente_id']][0] += $a['n'];
        } elseif (in_array($a['status'], ['falta', 'falta_justificada'], true)) {
            $faltPac[$a['paciente_id']][1] += $a['n'];
        }
    }
    uasort($faltPac, fn($a, $b) => [$b[1], $a[0]] <=> [$a[1], $b[0]]);
    $faltPac = array_slice($faltPac, 0, 25, true);
    $saidasPac = contar(array_column($saidas, 'paciente_id'));
    $pname = fn($pid) => $profs[$pid]['nome'];
    $convNome = fn($cid) => $cid ? ($convs[$cid]['nome'] ?? null) : null;

    $totalS = count($saidas);
    $sessT = array_sum(array_column($lista, 'sessoes'));
    $fltT = array_sum(array_column($lista, 'faltas'));
    $notasAll = array_column($aval, 'nota');
    $evit = count(array_filter($saidas, fn($s) => in_array($s['motivo_categoria'], EVITAVEIS, true)));
    $temValor = false;
    foreach ($convs as $c) {
        $temValor = $temValor || $c['valor_sessao'];
    }
    foreach ($atend as $a) {
        $temValor = $temValor || $a['valor'];
    }

    $modalidade = [];
    foreach (['individual', 'grupo'] as $mod) {
        $mots = [];
        $profsMod = [];
        $n = 0;
        foreach ($saidas as $s) {
            foreach ($s['conta'] as $l) {
                if ($l['mod'] === $mod) {
                    $n++;
                    $mots[] = $s['motivo_categoria'];
                    $profsMod[$l['id']] = true;
                }
            }
        }
        $modalidade[$mod] = ['vinculos_perdidos' => $n, 'motivos' => (object) contar($mots), 'profissionais' => count($profsMod),
                             'carteira' => count(array_filter($vincAtivos, fn($v) => $v['mod'] === $mod))];
    }

    $convenios = [];
    foreach (contar(array_column($saidas, 'convenio_id')) as $cid => $n) {
        if ($cid) {
            $convenios[] = ['id' => $cid, 'nome' => $convs[$cid]['nome'], 'saidas' => $n,
                'faltas' => count(array_filter($saidas, fn($s) => $s['convenio_id'] == $cid && $s['motivo_categoria'] === FALTAS))];
        }
    }

    $listaOut = array_values($lista);
    usort($listaOut, fn($a, $b) => [$b['saidas'], $a['nome']] <=> [$a['saidas'], $b['nome']]);
    usort($aval, fn($a, $b) => strcmp($b['data'], $a['data']));
    $evitaveis = EVITAVEIS;
    sort($evitaveis);

    return [
        'disponivel' => ['ativos' => $hasAtivos, 'atendimentos' => $hasAtend, 'avaliacoes' => $hasAval, 'valores' => (bool) $temValor,
                         'cadastro' => count(array_filter($profs, fn($p) => $p['formacao']))],
        'kpis' => [
            'saidas' => $totalS, 'pacientes_saida' => count($saidasPac), 'ativos' => count($ativos),
            'taxa_perda' => $hasAtivos ? pct($totalS, count($ativos) + $totalS) : null,
            'pct_faltas_saida' => pct(count(array_filter($saidas, fn($s) => $s['motivo_categoria'] === FALTAS)), $totalS),
            'evitaveis' => $evit, 'pct_evitaveis' => pct($evit, $totalS),
            'saidas_com_grupo' => count(array_filter($saidas, fn($s) => in_array('grupo', array_column($s['conta'], 'mod'), true))),
            'sessoes' => $sessT, 'faltas' => $fltT, 'taxa_falta' => ($sessT + $fltT) ? pct($fltT, $sessT + $fltT) : null,
            'faturamento' => round((float) array_sum(array_column($lista, 'faturamento')), 2),
            'nps' => nps($notasAll), 'nota' => $notasAll ? round(mean($notasAll), 1) : null, 'n_aval' => count($notasAll),
            'profissionais' => count(array_filter($lista, fn($m) => $m['ativo'])),
            'meses' => count(array_unique(array_map(fn($s) => substr($s['data_saida'], 0, 7), $saidas))) ?: 1,
        ],
        'evitaveis' => $evitaveis,
        'filtro_mod' => $fMod,
        'modalidade' => $modalidade,
        'grupos' => array_values(array_map(fn($g) => [
            'id' => $g['id'], 'nome' => $g['nome'], 'profissional_id' => $g['profissional_id'], 'profissional' => $pname($g['profissional_id']),
            'esp' => $esps[$profs[$g['profissional_id']]['especialidade_id']]['nome'], 'dia_horario' => $g['dia_horario'],
            'capacidade' => $g['capacidade'], 'ativo' => $g['ativo'],
            'saidas' => array_sum(array_map(fn($s) => count(array_filter($s['conta'], fn($l) => $l['grupo_id'] == $g['id'])), $saidas)),
            'carteira' => count(array_filter($vincAtivos, fn($v) => $v['grupo_id'] == $g['id'])),
        ], array_filter($grupos, fn($g) => $profOk($g['profissional_id'])))),
        'motivos' => pares(contar(array_column($saidas, 'motivo_categoria'))),
        'convenios' => $convenios,
        'serie' => $serie,
        'profissionais' => $listaOut,
        // cadastro inteiro por situação (na área filtrada): a lista acima só traz inativos que tiveram movimento
        'cadastro' => ['ativos' => count(array_filter($profs, fn($p) => $p['ativo'] && $profOk($p['id']))),
                       'inativos' => count(array_filter($profs, fn($p) => !$p['ativo'] && $profOk($p['id'])))],
        'areas' => $areas,
        'saidas' => array_map(fn($s) => [
            'id' => $s['id'], 'data' => $s['data_saida'], 'paciente' => $pacs[$s['paciente_id']]['nome'], 'paciente_id' => $s['paciente_id'],
            'convenio' => $convNome($s['convenio_id']), 'motivo' => $s['motivo_categoria'], 'texto' => $s['motivo_texto'],
            'profs' => array_map(fn($l) => [
                'id' => $l['id'], 'nome' => $pname($l['id']), 'esp' => $esps[$profs[$l['id']]['especialidade_id']]['abrev'],
                'esp_id' => $profs[$l['id']]['especialidade_id'], 'mod' => $l['mod'], 'marcado' => $l['marcado'],
                'grupo_id' => $l['grupo_id'], 'grupo' => $l['grupo_id'] ? ($grupos[$l['grupo_id']]['nome'] ?? null) : null,
                'conta' => in_array($l['id'], $s['profs'], true),
            ], $s['links']),
        ], $saidas),
        'pacientes' => [
            'antigos' => array_map(fn($p) => ['nome' => $p['nome'], 'inicio' => $p['data_inicio'], 'dias' => dias($p['data_inicio']),
                'convenio' => $convNome($p['convenio_id']), 'profs' => array_map($pname, $vprof[$p['id']] ?? [])], $antigos),
            'faltosos' => array_values(array_filter(array_map(fn($pid, $v) => ['nome' => $pacs[$pid]['nome'], 'sessoes' => $v[0], 'faltas' => $v[1],
                'taxa' => pct($v[1], $v[0] + $v[1]), 'status' => $pacs[$pid]['status']], array_keys($faltPac), $faltPac), fn($x) => $x['faltas'] > 0)),
            'reincidentes' => array_values(array_filter(array_map(fn($pid, $n) => ['nome' => $pacs[$pid]['nome'], 'saidas' => $n],
                array_keys($saidasPac), $saidasPac), fn($x) => $x['saidas'] > 1)),
        ],
        'avaliacoes' => array_map(fn($a) => ['data' => $a['data'], 'nota' => $a['nota'], 'comentario' => $a['comentario'],
            'paciente' => $a['paciente_id'] ? $pacs[$a['paciente_id']]['nome'] : null,
            'profissional' => $a['profissional_id'] ? $pname($a['profissional_id']) : null], array_slice($aval, 0, 60)),
    ];
}

function meta(): array
{
    $cont = [];
    foreach (['profissionais', 'pacientes', 'saidas', 'vinculos', 'atendimentos', 'avaliacoes', 'competencias'] as $t) {
        $cont[$t] = (int) one("SELECT COUNT(*) FROM $t");
    }
    return [
        'especialidades' => rows('SELECT * FROM especialidades ORDER BY nome'),
        'convenios' => rows('SELECT * FROM convenios ORDER BY nome'),
        'meses' => array_column(rows('SELECT DISTINCT substr(d,1,7) m FROM (SELECT data_saida d FROM saidas UNION SELECT data FROM atendimentos UNION SELECT data FROM avaliacoes) ORDER BY 1'), 'm'),
        'contagens' => $cont + ['profissionais_ativos' => (int) one('SELECT COUNT(*) FROM profissionais WHERE ativo = 1')],
        'ativos' => (int) one("SELECT COUNT(*) FROM pacientes WHERE status='ativo'"),
        'agenda' => rows('SELECT v.unidade, v.data_ref, (SELECT COUNT(*) FROM agenda_pacientes ap JOIN agenda_slots s ON s.id=ap.slot_id WHERE s.versao_id=v.id) n
                          FROM agenda_versoes v WHERE v.data_ref = (SELECT MAX(data_ref) FROM agenda_versoes x WHERE x.unidade=v.unidade) ORDER BY v.unidade'),
    ];
}

function profissional(int $pid): ?array
{
    $r = q('SELECT p.*, e.nome esp FROM profissionais p JOIN especialidades e ON e.id=p.especialidade_id WHERE p.id=?', [$pid])->fetch();
    if (!$r) {
        return null;
    }
    $r['competencias'] = rows('SELECT competencia nome, tipo, nivel FROM competencias WHERE profissional_id=? ORDER BY nivel DESC, competencia', [$pid]);
    $r['saidas'] = rows('SELECT s.id sid, s.data_saida data, pa.nome paciente, c.nome convenio, s.motivo_categoria motivo, s.motivo_texto texto,
                                sp.modalidade, sp.grupo_id, g.nome grupo
                         FROM saida_profissionais sp JOIN saidas s ON s.id=sp.saida_id JOIN pacientes pa ON pa.id=s.paciente_id
                         LEFT JOIN convenios c ON c.id=s.convenio_id LEFT JOIN grupos g ON g.id=sp.grupo_id
                         WHERE sp.profissional_id=? ORDER BY s.data_saida DESC', [$pid]);
    $r['grupos'] = rows('SELECT * FROM grupos WHERE profissional_id=? ORDER BY ativo DESC, nome', [$pid]);
    $r['carteira'] = rows("SELECT pa.nome paciente, COALESCE(v.data_inicio, pa.data_inicio) inicio, c.nome convenio FROM vinculos v
                           JOIN pacientes pa ON pa.id=v.paciente_id LEFT JOIN convenios c ON c.id=pa.convenio_id
                           WHERE v.profissional_id=? AND v.data_fim IS NULL AND pa.status='ativo' ORDER BY inicio", [$pid]);
    $r['atend_mes'] = rows("SELECT substr(data,1,7) mes, SUM(status='realizado') sessoes, SUM(status IN ('falta','falta_justificada')) faltas
                            FROM atendimentos WHERE profissional_id=? GROUP BY 1 ORDER BY 1", [$pid]);
    $r['avaliacoes'] = rows('SELECT a.data, a.nota, a.comentario, pa.nome paciente FROM avaliacoes a LEFT JOIN pacientes pa ON pa.id=a.paciente_id
                             WHERE a.profissional_id=? ORDER BY a.data DESC LIMIT 50', [$pid]);
    return $r;
}

const CAMPOS_PROF = ['nome', 'especialidade_id', 'modalidade', 'formacao', 'pos_graduacao', 'registro_conselho', 'data_admissao',
                     'carga_horaria_semanal', 'meta_pacientes', 'foto_url', 'ativo', 'observacoes', 'nome_completo', 'unidade', 'contratacao', 'capacidade_semanal'];

function salvar_prof(?int $pid, array $body): array
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $vals = [];
        foreach (CAMPOS_PROF as $k) {
            if (array_key_exists($k, $body)) {
                $vals[$k] = $body[$k] === '' ? null : $body[$k];
            }
        }
        if (isset($vals['modalidade']) && !in_array($vals['modalidade'], ['individual', 'grupo', 'misto'], true)) {
            $vals['modalidade'] = 'individual';
        }
        if ($pid === null) {
            if (empty($vals['nome']) || empty($vals['especialidade_id'])) {
                throw new InvalidArgumentException('Informe nome e especialidade.');
            }
            q('INSERT INTO profissionais(nome, especialidade_id) VALUES (?, ?)', [$vals['nome'], $vals['especialidade_id']]);
            $pid = (int) $pdo->lastInsertId();
        }
        if ($vals) {
            $set = implode(', ', array_map(fn($k) => "$k=?", array_keys($vals)));
            q("UPDATE profissionais SET $set WHERE id=?", [...array_values($vals), $pid]);
        }
        if (isset($body['grupos']) && is_array($body['grupos'])) {
            $manter = array_values(array_filter(array_map(fn($g) => (int) ($g['id'] ?? 0), $body['grupos'])));
            $in = $manter ? implode(',', array_fill(0, count($manter), '?')) : 'NULL';
            q("DELETE FROM grupos WHERE profissional_id=? AND id NOT IN ($in)", [$pid, ...$manter]);
            foreach ($body['grupos'] as $g) {
                $nome = trim((string) ($g['nome'] ?? ''));
                if ($nome === '') {
                    continue;
                }
                $v = [$nome, ($g['dia_horario'] ?? '') ?: null, ($g['capacidade'] ?? '') ?: null, !empty($g['ativo']) || !isset($g['ativo']) ? 1 : 0];
                if (!empty($g['id'])) {
                    q('UPDATE grupos SET nome=?, dia_horario=?, capacidade=?, ativo=? WHERE id=? AND profissional_id=?', [...$v, (int) $g['id'], $pid]);
                } else {
                    q('INSERT INTO grupos(nome, dia_horario, capacidade, ativo, profissional_id) VALUES (?,?,?,?,?)', [...$v, $pid]);
                }
            }
        }
        if (isset($body['competencias']) && is_array($body['competencias'])) {
            q('DELETE FROM competencias WHERE profissional_id=?', [$pid]);
            foreach ($body['competencias'] as $c) {
                $nome = trim((string) ($c['nome'] ?? ''));
                if ($nome !== '') {
                    q('INSERT OR REPLACE INTO competencias(profissional_id, competencia, tipo, nivel) VALUES (?,?,?,?)',
                        [$pid, $nome, ($c['tipo'] ?? '') ?: 'habilidade', ($c['nivel'] ?? null) ?: null]);
                }
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return ['id' => $pid];
}
