<?php
declare(strict_types=1);

// Importação única dos dados do Hipo Saúde Integrada (sistema que será descontinuado) e lotação da clínica.
// O arquivo vem do script de extração rodado no navegador logado no Hipo:
//   {"origem":"hipo","profissionais":[...],"grade":[...sessões da semana...],"horarios":[...grade padrão...]}
// Cada profissional do Hipo é casado com o cadastro do Profile pelo nome (o Profile usa nomes curtos, o Hipo o nome completo);
// quem não existe é criado. Campos já preenchidos no Profile não são sobrescritos, exceto a situação (ativo/inativo).

// Especialidade do Hipo => áreas do Profile aceitas no casamento (a primeira é usada ao criar)
const HIPO_ESP = [
    'APLICADOR ABA' => ['Acompanhamento Terapêutico', 'Psicologia'],
    'COORDENDADOR ABA' => ['Psicologia', 'Acompanhamento Terapêutico'],
    'COORDENADOR ABA' => ['Psicologia', 'Acompanhamento Terapêutico'],
    'PSICOLOGIA' => ['Psicologia', 'Acompanhamento Terapêutico'],
    'FONOAUDIOLOGIA' => ['Fonoaudiologia'],
    'TERAPIA OCUPACIONAL' => ['Terapia Ocupacional'],
    'FISIOTERAPIA' => ['Fisioterapia'],
    'PSICOPEDAGOGIA' => ['Psicopedagogia'],
    'PEDAGOGIA' => ['Psicopedagogia'],
    'PSICOMOTRICISTA' => ['Psicomotricidade'],
    'PSICOMOTRICIDADE' => ['Psicomotricidade'],
    'JIU-JITSU' => ['Psicomotricidade'],
    'MUSICOTERAPIA' => ['Música'],
    'NUTRICIONISTA' => ['Nutrição'],
    'NUTRICAO' => ['Nutrição'],
    'LUDOTERAPIA' => ['Psicologia'],
    'NEUROPEDIATRA' => ['Neuropediatria'],
];

// Sigla do conselho por área (o Hipo guarda só o número)
const HIPO_CONSELHO = [
    'Psicologia' => 'CRP', 'Acompanhamento Terapêutico' => 'CRP', 'Fonoaudiologia' => 'CRFa', 'Terapia Ocupacional' => 'CREFITO',
    'Fisioterapia' => 'CREFITO', 'Nutrição' => 'CRN', 'Neuropediatria' => 'CRM',
];

const HIPO_PALAVRAS_IGNORADAS = ['DE', 'DA', 'DO', 'DOS', 'DAS', 'E'];

// Grade padrão do Hipo: 14 sessões por dia (08:00–20:00, sessões de 45 min, intervalos 12:00–13:00 e 16:45–17:00)
const LOT_SESSOES_DIA = 14;
const LOT_HORAS_DIA = 10.75;
const LOT_DIAS_MAX = 6;

function hipo_tokens(string $nome): array
{
    return array_values(array_filter(explode(' ', norm($nome)), fn($t) => $t !== '' && !in_array($t, HIPO_PALAVRAS_IGNORADAS, true)));
}

/** O nome curto do Profile casa com o nome completo do Hipo: mesmo primeiro nome e os demais aparecem na mesma ordem. */
function hipo_casa(array $curto, array $completo): bool
{
    if (!$curto || !$completo || $curto[0] !== $completo[0] || count($curto) > count($completo)) {
        return false;
    }
    $j = 1;
    foreach (array_slice($curto, 1) as $t) {
        while ($j < count($completo) && $completo[$j] !== $t) {
            $j++;
        }
        if ($j >= count($completo)) {
            return false;
        }
        $j++;
    }
    return true;
}

function hipo_sim(string $a, string $b): float
{
    if ($a === $b) {
        return 1.0;
    }
    similar_text($a, $b, $p);
    return $p / 100;
}

/** Semelhança tolerante a grafia (Luttienny × Luttieny Aparecida): 0 quando não serve. */
function hipo_semelhanca(string $curto, string $completo): float
{
    $a = hipo_tokens($curto);
    $b = hipo_tokens($completo);
    if (!$a || !$b) {
        return 0.0;
    }
    $s = hipo_sim($a[0], $b[0]);
    if ($s < 0.8) {
        return 0.0;
    }
    $soma = $s;
    foreach (array_slice($a, 1) as $t) {
        $m = 0.0;
        foreach (array_slice($b, 1) as $u) {
            $m = max($m, hipo_sim($t, $u));
        }
        if ($m < 0.8) {
            return 0.0;
        }
        $soma += $m;
    }
    return $soma / count($a);
}

/** Critério da união automática, mais rígido que as sugestões: primeiro nome com até 1 letra de diferença
 *  (Isabela × Isabella, Luttienny × Luttieny) e cada outro nome com até 2 (Elen × Hellen). Maria × Mariana não passa. */
function hipo_auto_ok(string $curto, string $completo): bool
{
    $a = hipo_tokens($curto);
    $b = hipo_tokens($completo);
    if (!$a || !$b || levenshtein($a[0], $b[0]) > 1) {
        return false;
    }
    foreach (array_slice($a, 1) as $t) {
        $lim = strlen($t) < 5 ? 1 : 2;
        $ok = false;
        foreach (array_slice($b, 1) as $u) {
            if (levenshtein($t, $u) <= $lim) {
                $ok = true;
                break;
            }
        }
        if (!$ok) {
            return false;
        }
    }
    return true;
}

function hipo_carga_semanal(array $p): ?float
{
    $h = (float) ($p['horas_dia'] ?? 0);
    $d = (float) ($p['dias_mes'] ?? 0);
    if ($h <= 0) {
        return null;
    }
    // O Hipo guarda "dias trabalhados" no mês (22); valores até 7 só podem ser dias por semana; sem isso, 5 dias
    $porSemana = $d <= 0 ? 5 : ($d <= 7 ? $d : $d * 12 / 52);
    return round($h * $porSemana, 1);
}

function hipo_registro(array $p, string $area): ?string
{
    $num = trim((string) ($p['conselho_numero'] ?? ''));
    if ($num === '' || preg_match('/^(0+|N\/?A|SELECIONE)$/i', $num)) {
        return null;
    }
    $uf = strtoupper(trim((string) ($p['conselho_uf'] ?? '')));
    $uf = $uf === '53' ? 'DF' : (preg_match('/^[A-Z]{2}$/', $uf) ? $uf : '');
    $sigla = HIPO_CONSELHO[$area] ?? '';
    return trim(($sigla !== '' ? "$sigla " : '') . $num . ($uf !== '' ? "/$uf" : ''));
}

/** Área pelo nome exato (com acento), criando se preciso — esp_id() da planilha tira os acentos. */
function hipo_esp_id(string $nome): int
{
    $id = one('SELECT id FROM especialidades WHERE nome = ?', [$nome]);
    if (!$id) {
        foreach (rows('SELECT id, nome FROM especialidades') as $e) {
            if (norm($e['nome']) === norm($nome)) {
                return (int) $e['id'];
            }
        }
        q('INSERT INTO especialidades(nome, abrev) VALUES (?, ?)', [$nome, $nome === 'Acompanhamento Terapêutico' ? 'AT' : mb_substr($nome, 0, 6)]);
        return (int) db()->lastInsertId();
    }
    return (int) $id;
}

function config_get(string $k, $padrao = null)
{
    $v = one('SELECT valor FROM config WHERE chave = ?', [$k]);
    return $v === false ? $padrao : json_decode((string) $v, true);
}

function config_set(string $k, $v): void
{
    q('INSERT INTO config(chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor', [$k, json_encode($v, JSON_UNESCAPED_UNICODE)]);
}

// ------------------------------------------------------------------ união de cadastros duplicados
const PROF_REFS = ['saida_profissionais', 'vinculos', 'atendimentos', 'avaliacoes', 'grupos', 'competencias', 'agenda_slots', 'remuneracao'];
const PROF_COPIAR = ['formacao', 'pos_graduacao', 'registro_conselho', 'data_admissao', 'carga_horaria_semanal', 'meta_pacientes', 'foto_url',
                     'observacoes', 'hipo_id', 'nome_completo', 'unidade', 'contratacao', 'capacidade_semanal'];

/** Junta o cadastro $de no $para: todo o histórico passa para $para, campos vazios de $para são completados e $de é apagado. */
function unir_profissionais(int $de, int $para, bool $transacao = true): array
{
    if ($de === $para) {
        throw new InvalidArgumentException('Escolha dois cadastros diferentes.');
    }
    $a = q('SELECT * FROM profissionais WHERE id = ?', [$de])->fetch();
    $b = q('SELECT * FROM profissionais WHERE id = ?', [$para])->fetch();
    if (!$a || !$b) {
        throw new InvalidArgumentException('Profissional não encontrado.');
    }
    $pdo = db();
    if ($transacao) {
        $pdo->beginTransaction();
    }
    try {
        foreach (PROF_REFS as $t) {
            q("UPDATE OR IGNORE $t SET profissional_id = ? WHERE profissional_id = ?", [$para, $de]);
            q("DELETE FROM $t WHERE profissional_id = ?", [$de]);   // o que sobrou já existia no destino
        }
        foreach (PROF_COPIAR as $c) {
            if (($b[$c] ?? null) === null && ($a[$c] ?? null) !== null) {
                q("UPDATE profissionais SET $c = ? WHERE id = ?", [$a[$c], $para]);
            }
        }
        if ($b['observacoes'] && $a['observacoes'] && $a['observacoes'] !== $b['observacoes']) {
            q('UPDATE profissionais SET observacoes = ? WHERE id = ?', [$b['observacoes'] . "\n" . $a['observacoes'], $para]);
        }
        q('DELETE FROM profissionais WHERE id = ?', [$de]);
        // O destino criado pelo Hipo tem o nome completo; o nome curto do Profile é o que as planilhas usam, então fica ele
        if ($b['nome_completo'] && norm($b['nome']) === norm($b['nome_completo']) && norm($a['nome']) !== norm($b['nome'])
            && !one('SELECT id FROM profissionais WHERE nome = ? AND especialidade_id = ? AND id <> ?', [$a['nome'], $b['especialidade_id'], $para])) {
            q('UPDATE profissionais SET nome = ? WHERE id = ?', [$a['nome'], $para]);
        }
        if ($transacao) {
            $pdo->commit();
        }
    } catch (Throwable $e) {
        if ($transacao) {
            $pdo->rollBack();
        }
        throw $e;
    }
    return ['id' => $para, 'unido' => $a['nome']];
}

/** Profissionais que aparecem na agenda semanal (planilhas) mais recente de cada unidade. */
function profs_na_agenda_atual(): array
{
    return array_flip(array_map('intval', array_column(rows('SELECT DISTINCT s.profissional_id FROM agenda_slots s JOIN agenda_versoes v ON v.id = s.versao_id
        WHERE v.data_ref = (SELECT MAX(data_ref) FROM agenda_versoes x WHERE x.unidade = v.unidade)'), 'profissional_id')));
}

/** Sugestões de cadastro do Hipo para um profissional do Profile sem vínculo. */
function hipo_sugestoes(array $p, array $alvos, int $max = 4): array
{
    $out = [];
    foreach ($alvos as $t) {
        if ((int) $t['id'] === (int) $p['id']) {
            continue;
        }
        $s = hipo_semelhanca(agenda_prof_nome($p['nome']), (string) $t['nome_completo']);
        if ($s >= 0.8) {
            $out[] = ['id' => (int) $t['id'], 'nome' => $t['nome'], 'nome_completo' => $t['nome_completo'], 'esp' => $t['esp'],
                      'ativo' => (int) $t['ativo'], 'unidade' => $t['unidade'], 'score' => round($s, 2), 'mesma_area' => $t['esp'] === $p['esp']];
        }
    }
    usort($out, fn($x, $y) => [$y['mesma_area'], $y['ativo'], $y['score']] <=> [$x['mesma_area'], $x['ativo'], $x['score']]);
    return array_slice($out, 0, $max);
}

// ------------------------------------------------------------------ importação
function importar_hipo(string $bytes): array
{
    $dados = json_decode($bytes, true);
    if (!is_array($dados) || ($dados['origem'] ?? '') !== 'hipo' || !is_array($dados['profissionais'] ?? null)) {
        throw new RuntimeException('Arquivo não reconhecido: use o JSON exportado do Hipo (hipo-dados.json).');
    }
    $avisos = [];
    $hipo = [];
    foreach ($dados['profissionais'] as $p) {
        $esp = norm($p['especialidade'] ?? '');
        if (!isset(HIPO_ESP[$esp]) || trim((string) ($p['nome'] ?? '')) === '' || empty($p['hipo_id'])) {
            continue;   // equipe administrativa / sem área clínica
        }
        $p['areas'] = HIPO_ESP[$esp];
        $p['tok'] = hipo_tokens((string) $p['nome']);
        $hipo[(int) $p['hipo_id']] = $p;
    }
    $ignorados = count($dados['profissionais']) - count($hipo);

    $profile = rows('SELECT p.id, p.nome, p.hipo_id, e.nome esp FROM profissionais p JOIN especialidades e ON e.id = p.especialidade_id');
    $casou = [];      // profissional_id => hipo_id
    $usados = [];     // hipo_id => [profissional_id...]
    $ambiguos = 0;
    foreach ($profile as $r) {
        if ($r['hipo_id'] && isset($hipo[(int) $r['hipo_id']])) {
            $casou[$r['id']] = (int) $r['hipo_id'];
            continue;
        }
        $tok = hipo_tokens(agenda_prof_nome($r['nome']));
        $cand = array_filter($hipo, fn($h) => hipo_casa($tok, $h['tok']));
        $mesmaArea = array_filter($cand, fn($h) => in_array($r['esp'], $h['areas'], true));
        $c = $mesmaArea ?: $cand;
        if (count($c) > 1) {   // vários homônimos: fica com os ativos
            $c = array_filter($c, fn($h) => !empty($h['ativo'])) ?: $c;
        }
        if (count($c) === 1) {
            $casou[$r['id']] = (int) array_key_first($c);
        } elseif (count($c) > 1) {
            $ambiguos++;
        }
    }
    foreach ($casou as $pid => $hid) {
        $usados[$hid][] = $pid;
    }

    $atualizados = $criados = $desativados = $unidos = $inativadosSemHipo = 0;
    $pdo = db();
    $pdo->beginTransaction();
    try {
        foreach ($hipo as $hid => $h) {
            $ids = $usados[$hid] ?? [];
            if (!$ids) {
                $ids = array_map('intval', array_column(rows('SELECT id FROM profissionais WHERE hipo_id = ?', [$hid]), 'id'));
            }
            if (!$ids) {
                $eid = hipo_esp_id($h['areas'][0]);
                $nome = title($h['nome']);
                $existe = one('SELECT id FROM profissionais WHERE nome = ? AND especialidade_id = ?', [$nome, $eid]);
                if ($existe) {
                    $ids = [(int) $existe];
                } else {
                    q('INSERT INTO profissionais(nome, especialidade_id, ativo) VALUES (?, ?, ?)', [$nome, $eid, empty($h['ativo']) ? 0 : 1]);
                    $ids = [(int) $pdo->lastInsertId()];
                    $criados++;
                }
            } else {
                $atualizados += count($ids);
            }
            foreach ($ids as $pid) {
                $area = (string) one('SELECT e.nome FROM profissionais p JOIN especialidades e ON e.id = p.especialidade_id WHERE p.id = ?', [$pid]);
                $ativo = empty($h['ativo']) ? 0 : 1;
                if (!$ativo && (int) one('SELECT ativo FROM profissionais WHERE id = ?', [$pid]) === 1) {
                    $desativados++;
                }
                $adm = isset($h['admissao']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $h['admissao']) ? $h['admissao'] : null;
                q('UPDATE profissionais SET hipo_id = ?, nome_completo = ?, unidade = ?, contratacao = ?, ativo = ?,
                     data_admissao = COALESCE(data_admissao, ?), registro_conselho = COALESCE(registro_conselho, ?),
                     carga_horaria_semanal = COALESCE(carga_horaria_semanal, ?), formacao = COALESCE(formacao, ?)
                   WHERE id = ?',
                    [$hid, title($h['nome']), $h['unidade'] ?: null, $h['contratacao'] ?: null, $ativo,
                     $adm, hipo_registro($h, $area), hipo_carga_semanal($h), ($h['formacao'] ?? '') ?: null, $pid]);
            }
        }

        // A mesma pessoa do Hipo em mais de um cadastro (a planilha a colocou em duas áreas): fica um só, na área do Hipo
        foreach (rows('SELECT hipo_id FROM profissionais WHERE hipo_id IS NOT NULL GROUP BY hipo_id HAVING COUNT(*) > 1') as $d) {
            $hid = (int) $d['hipo_id'];
            $cad = rows('SELECT p.id, p.nome, e.nome esp, (SELECT COUNT(*) FROM vinculos v WHERE v.profissional_id = p.id) n
                         FROM profissionais p JOIN especialidades e ON e.id = p.especialidade_id WHERE p.hipo_id = ?', [$hid]);
            $area = $hipo[$hid]['areas'][0] ?? null;
            usort($cad, fn($x, $y) => [norm($y['esp']) === norm((string) $area), $y['n']] <=> [norm($x['esp']) === norm((string) $area), $x['n']]);
            foreach (array_slice($cad, 1) as $x) {
                unir_profissionais((int) $x['id'], (int) $cad[0]['id'], false);
                $avisos[] = "Unido: {$x['nome']} ({$x['esp']}) → {$cad[0]['nome']} ({$cad[0]['esp']}) — mesma pessoa no Hipo";
                $unidos++;
            }
        }

        // Grafias diferentes (Luttienny × Luttieny Aparecida): une quando só há um candidato muito parecido na mesma área
        $alvos = rows('SELECT p.id, p.nome, p.nome_completo, p.ativo, p.unidade, e.nome esp FROM profissionais p
                       JOIN especialidades e ON e.id = p.especialidade_id WHERE p.hipo_id IS NOT NULL');
        foreach (rows('SELECT p.id, p.nome, e.nome esp FROM profissionais p JOIN especialidades e ON e.id = p.especialidade_id WHERE p.hipo_id IS NULL') as $p) {
            $sug = array_values(array_filter(hipo_sugestoes($p, $alvos, 10), function ($s) use ($p, $hipo) {
                $h = null;
                foreach ($hipo as $x) {
                    if (title($x['nome']) === $s['nome_completo']) {
                        $h = $x;
                        break;
                    }
                }
                return hipo_auto_ok(agenda_prof_nome($p['nome']), (string) $s['nome_completo']) && ($s['mesma_area'] || ($h && in_array($p['esp'], $h['areas'], true)));
            }));
            $parecidos = array_filter(hipo_sugestoes($p, $alvos, 10), fn($s) => hipo_auto_ok(agenda_prof_nome($p['nome']), (string) $s['nome_completo']));
            if (count($sug) === 1 && count($parecidos) === 1) {
                unir_profissionais((int) $p['id'], $sug[0]['id'], false);
                $avisos[] = "Unido: {$p['nome']} ({$p['esp']}) → {$sug[0]['nome_completo']}";
                $unidos++;
            }
        }

        // Quem ficou sem par no Hipo e não está na agenda atual é nome antigo das planilhas: sai dos ativos (o histórico fica)
        $naAgenda = profs_na_agenda_atual();
        foreach (rows('SELECT id FROM profissionais WHERE hipo_id IS NULL AND ativo = 1') as $p) {
            if (!isset($naAgenda[(int) $p['id']])) {
                q('UPDATE profissionais SET ativo = 0 WHERE id = ?', [$p['id']]);
                $inativadosSemHipo++;
            }
        }

        $sessoes = 0;
        if (is_array($dados['grade'] ?? null)) {
            q('DELETE FROM hipo_grade');
            $ins = $pdo->prepare('INSERT OR REPLACE INTO hipo_grade(id, data, dia_semana, hora_inicio, hora_fim, hipo_prof, hipo_paciente, paciente,
                                    especialidade, unidade, tipo, tipo_agenda, convenio, sala, motivo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
            foreach ($dados['grade'] as $g) {
                $ins->execute([(int) $g['id'], $g['data'] ?? null, (int) ($g['dia_semana'] ?? 0), $g['hora_inicio'] ?? '', $g['hora_fim'] ?? null,
                    (int) ($g['hipo_prof'] ?? 0), ($g['hipo_paciente'] ?? null) ?: null, trim((string) ($g['paciente'] ?? '')) ?: null,
                    $g['especialidade'] ?? null, $g['unidade'] ?? null, $g['tipo'] ?? 'consulta', $g['tipo_agenda'] ?? null,
                    $g['convenio'] ?? null, $g['sala'] ?? null, trim((string) ($g['motivo'] ?? '')) ?: null]);
                $sessoes++;
            }
            $datas = array_filter(array_column($dados['grade'], 'data'));
            if (is_array($dados['horarios'] ?? null)) {
                config_set('hipo_horarios', array_values(array_filter($dados['horarios'], fn($h) => empty($h['is_intervalo']))));
            }
            config_set('hipo_grade', ['de' => $datas ? min($datas) : null, 'ate' => $datas ? max($datas) : null,
                                      'gerado_em' => $dados['gerado_em'] ?? null, 'clinica' => $dados['clinica'] ?? null]);
        }
        config_set('hipo_importado_em', date('c'));
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    $semHipo = (int) one('SELECT COUNT(*) FROM profissionais WHERE hipo_id IS NULL AND ativo = 1');
    array_unshift($avisos,
        "$atualizados atualizados, $criados criados a partir do Hipo, $unidos cadastros duplicados unidos, $desativados marcados como inativos pelo Hipo.",
        "$inativadosSemHipo nomes antigos das planilhas (sem par no Hipo e fora da agenda atual) passaram para inativos — o histórico continua.",
        $semHipo ? "$semHipo ativos ainda sem par no Hipo: confira em Cadastros → Conciliação." : 'Todos os ativos estão ligados ao Hipo.',
        $sessoes ? "Grade da semana: $sessoes registros." : 'O arquivo não tinha a grade da semana (lotação não atualizada).',
        "$ambiguos nomes com homônimos e $ignorados usuários sem área clínica ignorados.");
    return ['importados' => $atualizados + $criados, 'atualizados' => $atualizados, 'criados' => $criados, 'unidos' => $unidos,
            'desativados' => $desativados + $inativadosSemHipo, 'avisos' => $avisos];
}

// ------------------------------------------------------------------ conciliação
function conciliacao(bool $inativos = false): array
{
    $alvos = rows('SELECT p.id, p.nome, p.nome_completo, p.ativo, p.unidade, e.nome esp FROM profissionais p
                   JOIN especialidades e ON e.id = p.especialidade_id WHERE p.hipo_id IS NOT NULL');
    $naAgenda = profs_na_agenda_atual();
    $out = [];
    foreach (rows('SELECT p.id, p.nome, p.ativo, e.nome esp,
                     (SELECT COUNT(*) FROM vinculos v WHERE v.profissional_id = p.id AND v.data_fim IS NULL) vinculos,
                     (SELECT COUNT(*) FROM saida_profissionais s WHERE s.profissional_id = p.id) saidas
                   FROM profissionais p JOIN especialidades e ON e.id = p.especialidade_id
                   WHERE p.hipo_id IS NULL ' . ($inativos ? '' : 'AND p.ativo = 1') . ' ORDER BY p.ativo DESC, e.nome, p.nome') as $p) {
        $p['na_agenda'] = isset($naAgenda[(int) $p['id']]);
        $p['sugestoes'] = hipo_sugestoes($p, $alvos);
        $out[] = $p;
    }
    return ['pendentes' => $out, 'importado_em' => config_get('hipo_importado_em')];
}

// ------------------------------------------------------------------ lotação
function lotacao(array $f = []): array
{
    $ref = config_get('hipo_grade');
    $uni = trim((string) ($f['unidade'] ?? ''));
    $profs = rows('SELECT p.id, p.nome, p.nome_completo, p.hipo_id, p.unidade, p.contratacao, p.carga_horaria_semanal carga,
                          p.capacidade_semanal, p.meta_pacientes, p.foto_url, p.especialidade_id esp_id, e.nome esp
                   FROM profissionais p JOIN especialidades e ON e.id = p.especialidade_id WHERE p.ativo = 1 ORDER BY e.nome, p.nome');
    $g = [];
    $args = [];
    $sqlUni = '';
    if ($uni !== '') {
        $sqlUni = ' WHERE unidade = ?';
        $args[] = $uni;
    }
    foreach (rows("SELECT hipo_prof, tipo, dia_semana, hora_inicio, hipo_paciente, unidade FROM hipo_grade$sqlUni", $args) as $r) {
        $k = (int) $r['hipo_prof'];
        $g[$k] ??= ['ocup' => [], 'bloq' => [], 'sessoes' => 0, 'pac' => [], 'dias' => [], 'unid' => []];
        $slot = $r['dia_semana'] . '|' . $r['hora_inicio'];
        $dia = &$g[$k]['dias'][$r['dia_semana']];
        $dia = $dia ? [min($dia[0], $r['hora_inicio']), max($dia[1], $r['hora_inicio'])] : [$r['hora_inicio'], $r['hora_inicio']];
        unset($dia);
        $g[$k]['unid'][$r['unidade']] = true;
        if ($r['tipo'] === 'bloqueio') {
            $g[$k]['bloq'][$slot] = true;
        } else {
            $g[$k]['ocup'][$slot] = true;
            $g[$k]['sessoes']++;
            if ($r['hipo_paciente']) {
                $g[$k]['pac'][$r['hipo_paciente']] = true;
            }
        }
    }
    $porHora = LOT_SESSOES_DIA / LOT_HORAS_DIA;
    $grade = array_column(config_get('hipo_horarios', []), 'hora_inicio');
    // Turno observado: horários da grade padrão entre o primeiro e o último atendimento de cada dia
    $turno = function (array $dias) use ($grade): int {
        $n = 0;
        foreach ($dias as [$ini, $fim]) {
            $n += $grade ? count(array_filter($grade, fn($h) => $h >= $ini && $h <= $fim)) : LOT_SESSOES_DIA;
        }
        return $n;
    };
    $lista = [];
    $areas = [];
    $pacArea = [];
    $pacTotal = [];
    $usados = [];
    foreach ($profs as $p) {
        $h = $p['hipo_id'] && !isset($usados[$p['hipo_id']]) ? ($g[(int) $p['hipo_id']] ?? null) : null;
        if ($p['hipo_id']) {
            $usados[$p['hipo_id']] = true;   // cadastro duplicado não conta a mesma agenda duas vezes
        }
        if ($uni !== '' && !$h && norm((string) $p['unidade']) !== norm($uni)) {
            continue;
        }
        $ocup = $h ? count(array_diff_key($h['ocup'], $h['bloq'])) : 0;
        $bloq = $h ? count($h['bloq']) : 0;
        $dias = $h ? count($h['dias']) : 0;
        if ($p['capacidade_semanal']) {
            [$cap, $fonte] = [(int) $p['capacidade_semanal'], 'manual'];
        } elseif (!$dias && $p['esp'] === 'Acompanhamento Terapêutico') {
            [$cap, $fonte] = [null, 'apoio'];   // aplicador ABA: atende na agenda de outro terapeuta, não tem horários próprios
        } elseif ($p['carga']) {
            [$cap, $fonte] = [(int) round($p['carga'] * $porHora), 'carga'];
        } elseif ($dias) {
            [$cap, $fonte] = [$turno($h['dias']), 'estimada'];
        } else {
            [$cap, $fonte] = [null, 'sem_dados'];
        }
        if ($cap !== null) {
            $cap = min($cap, LOT_SESSOES_DIA * LOT_DIAS_MAX);
            $cap = max($cap, $ocup + $bloq);   // nunca menor que o que já está na agenda
        }
        $pacs = $h ? array_keys($h['pac']) : [];
        $item = ['id' => (int) $p['id'], 'nome' => $p['nome'], 'nome_completo' => $p['nome_completo'], 'esp' => $p['esp'], 'esp_id' => (int) $p['esp_id'],
                 'foto' => $p['foto_url'], 'unidade' => $p['unidade'] ?: ($h ? implode('/', array_keys($h['unid'])) : null), 'contratacao' => $p['contratacao'],
                 'hipo' => (bool) $p['hipo_id'], 'carga' => $p['carga'], 'capacidade' => $cap, 'fonte' => $fonte, 'ocupados' => $ocup, 'bloqueados' => $bloq,
                 'livres' => $cap === null ? null : max(0, $cap - $ocup - $bloq), 'sessoes' => $h ? $h['sessoes'] : 0, 'pacientes' => count($pacs),
                 'dias' => $dias, 'meta' => $p['meta_pacientes'],
                 'ocupacao' => $cap ? round(100 * ($ocup + $bloq) / $cap, 1) : null];
        $lista[] = $item;
        $a = &$areas[$p['esp_id']];
        $a ??= ['id' => (int) $p['esp_id'], 'nome' => $p['esp'], 'ativos' => 0, 'com_agenda' => 0, 'sem_dados' => 0, 'estimados' => 0, 'apoio' => 0,
                'capacidade' => 0, 'ocupados' => 0, 'bloqueados' => 0, 'livres' => 0, 'sessoes' => 0];
        $a['ativos']++;
        $a['com_agenda'] += $dias ? 1 : 0;
        $a['sem_dados'] += $fonte === 'sem_dados' ? 1 : 0;
        $a['apoio'] += $fonte === 'apoio' ? 1 : 0;
        $a['estimados'] += $fonte === 'estimada' ? 1 : 0;
        $a['capacidade'] += $cap ?? 0;
        $a['ocupados'] += $ocup;
        $a['bloqueados'] += $bloq;
        $a['livres'] += $item['livres'] ?? 0;
        $a['sessoes'] += $item['sessoes'];
        unset($a);
        foreach ($pacs as $pc) {
            $pacArea[$p['esp_id']][$pc] = true;
            $pacTotal[$pc] = true;
        }
    }
    // Pacientes que cabem: horários livres ÷ horários semanais que cada paciente usa naquela área hoje
    foreach ($areas as $id => &$a) {
        $a['pacientes'] = count($pacArea[$id] ?? []);
        $a['por_paciente'] = $a['pacientes'] ? round($a['ocupados'] / $a['pacientes'], 2) : null;
        $a['vagas_pacientes'] = $a['por_paciente'] ? (int) floor($a['livres'] / $a['por_paciente']) : null;
        $a['lotacao_pacientes'] = $a['vagas_pacientes'] !== null ? $a['pacientes'] + $a['vagas_pacientes'] : null;
        $a['ocupacao'] = $a['capacidade'] ? round(100 * ($a['ocupados'] + $a['bloqueados']) / $a['capacidade'], 1) : null;
    }
    unset($a);
    $t = ['ativos' => count($lista), 'com_agenda' => 0, 'sem_dados' => 0, 'estimados' => 0, 'apoio' => 0, 'capacidade' => 0, 'ocupados' => 0, 'bloqueados' => 0, 'livres' => 0, 'sessoes' => 0];
    foreach ($areas as $a) {
        foreach (['com_agenda', 'sem_dados', 'estimados', 'apoio', 'capacidade', 'ocupados', 'bloqueados', 'livres', 'sessoes'] as $k) {
            $t[$k] += $a[$k];
        }
    }
    $t['pacientes'] = count($pacTotal);
    $t['ocupacao'] = $t['capacidade'] ? round(100 * ($t['ocupados'] + $t['bloqueados']) / $t['capacidade'], 1) : null;
    // Na clínica o paciente costuma ter mais de uma terapia: a lotação total segue a proporção atual de pacientes por horário
    $t['lotacao_pacientes'] = $t['ocupados'] ? (int) floor($t['pacientes'] * ($t['capacidade'] - $t['bloqueados']) / $t['ocupados']) : null;
    $t['vagas_pacientes'] = $t['lotacao_pacientes'] !== null ? max(0, $t['lotacao_pacientes'] - $t['pacientes']) : null;
    $areasL = array_values($areas);
    usort($areasL, fn($x, $y) => $y['capacidade'] <=> $x['capacidade']);
    return ['referencia' => $ref, 'unidades' => array_column(rows('SELECT DISTINCT unidade FROM hipo_grade WHERE unidade IS NOT NULL ORDER BY 1'), 'unidade'),
            'unidade' => $uni, 'totais' => $t, 'areas' => $areasL, 'profissionais' => $lista,
            'parametros' => ['sessoes_dia' => LOT_SESSOES_DIA, 'horas_dia' => LOT_HORAS_DIA, 'sessoes_por_hora' => round($porHora, 2)]];
}

// ------------------------------------------------------------------ histórico de sessões (agenda diária do Hipo)
// Arquivos hipo-sessoes-AAAA-MM.json, um por mês, extraídos da agenda diária do Hipo (Matriz e Vila).
// Tudo fica em hipo_sessoes (histórico completo, inclusive agendadas e desmarcadas); as sessões com desfecho
// viram linhas de atendimentos (origem "hipo"), que alimentam faltas, produtividade e faturamento.

// Status do Hipo => status de atendimentos (os demais — Aguardando, Congelado, Pendente… — só ficam no histórico)
const HIPO_STATUS = [
    'ATENDIDA' => 'realizado',
    'FALTOU' => 'falta', 'FALTA INJUSTIFICAVEIS' => 'falta', 'FALTA INJUSTIFICAVEL' => 'falta',
    'FALTA JUSTIFICAVEIS' => 'falta_justificada', 'FALTA JUSTIFICAVEL' => 'falta_justificada',
    'DESMARCADA PELA CLINICA' => 'cancelado_clinica', 'CANCELADO PELA CLINICA' => 'cancelado_clinica', 'CANCELADA PELA CLINICA' => 'cancelado_clinica',
];
const HIPO_UNIDADES = [1 => 'Matriz', 2 => 'Vila'];

function hipo_status_atend(?string $s): ?string
{
    $n = norm($s);
    if (isset(HIPO_STATUS[$n])) {
        return HIPO_STATUS[$n];
    }
    return str_starts_with($n, 'DESMARCADA PELO PACIENTE') || str_starts_with($n, 'CANCELADO PELO PACIENTE') ? 'cancelado_paciente' : null;
}

function importar_hipo_sessoes(string $bytes): array
{
    $d = json_decode($bytes, true);
    if (!is_array($d) || ($d['origem'] ?? '') !== 'hipo-sessoes' || !is_array($d['sessoes'] ?? null) || !is_array($d['colunas'] ?? null)) {
        throw new RuntimeException('Arquivo não reconhecido: use um hipo-sessoes-AAAA-MM.json extraído do Hipo.');
    }
    $col = array_flip($d['colunas']);
    $v = fn(array $s, string $k) => $s[$col[$k]] ?? null;
    $pdo = db();
    $profs = [];
    foreach (rows('SELECT hipo_id, MIN(id) id FROM profissionais WHERE hipo_id IS NOT NULL GROUP BY hipo_id') as $r) {
        $profs[(int) $r['hipo_id']] = (int) $r['id'];
    }
    $n = $atend = $semProf = 0;
    $datas = [];
    $pacUlt = [];   // paciente => [data, convênio] da sessão mais recente (para o convênio do cadastro)
    $pdo->beginTransaction();
    try {
        $ins = $pdo->prepare('INSERT OR REPLACE INTO hipo_sessoes(id, data, hora_inicio, hora_fim, hipo_prof, hipo_paciente, paciente, especialidade, convenio,
                                sala, status, avaliacao, unidade, procedimento, codigo, tipo_guia, obs) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        foreach ($d['sessoes'] as $s) {
            $data = preg_match('/^(\d{2})-(\d{2})-(\d{4})$/', (string) $v($s, 'data'), $m) ? "$m[3]-$m[2]-$m[1]" : null;
            if (!$data || !$v($s, 'id')) {
                continue;
            }
            $datas[$data] = true;
            $ins->execute([(int) $v($s, 'id'), $data, $v($s, 'hora_inicio'), $v($s, 'hora_fim'), (int) $v($s, 'id_prof'), $v($s, 'id_paciente') ?: null,
                trim((string) $v($s, 'paciente')) ?: null, $v($s, 'especialidade'), trim((string) $v($s, 'convenio')) ?: null, $v($s, 'sala'),
                trim((string) $v($s, 'status')) ?: null, trim((string) $v($s, 'avaliacao')) ?: null, HIPO_UNIDADES[(int) $v($s, 'id_clinica')] ?? null,
                trim((string) $v($s, 'procedimento')) ?: null, $v($s, 'codigo') ? (string) $v($s, 'codigo') : null, $v($s, 'tipo_guia'),
                trim((string) $v($s, 'obs_agenda')) ?: null]);
            $n++;
        }
        // Refaz os atendimentos de origem Hipo nos dias deste arquivo (os lançados à mão ficam)
        $dias = array_keys($datas);
        sort($dias);
        if ($dias) {
            q("DELETE FROM atendimentos WHERE origem = 'hipo' AND data BETWEEN ? AND ?", [$dias[0], end($dias)]);
            $pacIds = [];
            foreach (rows('SELECT data, hipo_prof, paciente, convenio, status FROM hipo_sessoes WHERE data BETWEEN ? AND ? ORDER BY data, hora_inicio', [$dias[0], end($dias)]) as $s) {
                $st = hipo_status_atend($s['status']);
                if (!$st || !$s['paciente']) {
                    continue;
                }
                $pid = $profs[(int) $s['hipo_prof']] ?? null;
                if (!$pid) {
                    $semProf++;
                    continue;
                }
                $k = norm($s['paciente']);
                $pacIds[$k] ??= pac_id($s['paciente'], null, 'inativo');
                if ($s['convenio']) {
                    $pacUlt[$pacIds[$k]] = $s['convenio'];
                }
                // dois atendimentos no mesmo dia, paciente e profissional contam uma vez (vale o melhor desfecho)
                $r = q('INSERT OR IGNORE INTO atendimentos(data, paciente_id, profissional_id, status, origem) VALUES (?,?,?,?, ?)', [$s['data'], $pacIds[$k], $pid, $st, 'hipo']);
                if ($r->rowCount()) {
                    $atend++;
                } elseif ($st === 'realizado') {
                    q("UPDATE atendimentos SET status = 'realizado' WHERE data = ? AND paciente_id = ? AND profissional_id = ? AND origem = 'hipo'", [$s['data'], $pacIds[$k], $pid]);
                }
            }
            foreach ($pacUlt as $pac => $conv) {
                q('UPDATE pacientes SET convenio_id = COALESCE(convenio_id, ?) WHERE id = ?', [conv_id($conv), $pac]);
            }
        }
        $ref = config_get('hipo_sessoes', ['de' => null, 'ate' => null]);
        if ($dias) {
            $ref = ['de' => min(array_filter([$ref['de'], $dias[0]])), 'ate' => max(array_filter([$ref['ate'], end($dias)]))];
            config_set('hipo_sessoes', $ref + ['importado_em' => date('c')]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return ['importados' => $n, 'atendimentos' => $atend,
            'avisos' => ["$n sessões do Hipo" . ($dias ? ' de ' . implode('/', array_reverse(explode('-', $dias[0]))) . ' a ' . implode('/', array_reverse(explode('-', end($dias)))) : '') . "; $atend viraram atendimentos (realizados, faltas e desmarcações).",
                         $semProf ? "$semProf sessões de profissionais fora do cadastro clínico ficaram só no histórico." : 'Todas as sessões com desfecho foram ligadas a um profissional.']];
}

/** Agenda do Hipo de um profissional: a semana pedida, mais o resumo mês a mês. */
function hipo_agenda_prof(int $pid, ?string $semana = null): array
{
    $hid = one('SELECT hipo_id FROM profissionais WHERE id = ?', [$pid]);
    $ref = config_get('hipo_sessoes');
    if (!$hid || !$ref) {
        return ['tem' => false];
    }
    $ultima = one('SELECT MAX(data) FROM hipo_sessoes WHERE hipo_prof = ? AND data <= ?', [$hid, date('Y-m-d')]) ?: date('Y-m-d');
    $base = new DateTimeImmutable(preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $semana) ? $semana : $ultima);
    $seg = $base->modify('-' . ((int) $base->format('N') - 1) . ' days');
    $sab = $seg->modify('+5 days');
    $sessoes = rows('SELECT data, hora_inicio, hora_fim, paciente, convenio, status, avaliacao, unidade, especialidade, procedimento
                     FROM hipo_sessoes WHERE hipo_prof = ? AND data BETWEEN ? AND ? ORDER BY data, hora_inicio, paciente',
                    [$hid, $seg->format('Y-m-d'), $sab->format('Y-m-d')]);
    $meses = rows("SELECT substr(data, 1, 7) mes, COUNT(*) total,
                     SUM(status = 'Atendida') atendidas,
                     SUM(status IN ('Faltou', 'Falta Injustificáveis', 'Falta Justificáveis')) faltas,
                     SUM(status LIKE 'Desmarcada%' OR status LIKE 'Cancelad%') desmarcadas,
                     SUM(status = 'Atendida' AND (avaliacao IS NULL OR avaliacao <> 'Avaliada')) sem_evolucao,
                     COUNT(DISTINCT hipo_paciente) pacientes
                   FROM hipo_sessoes WHERE hipo_prof = ? GROUP BY 1 ORDER BY 1", [$hid]);
    return ['tem' => true, 'semana' => $seg->format('Y-m-d'), 'sessoes' => $sessoes, 'meses' => $meses, 'periodo' => $ref,
            'anterior' => $seg->modify('-7 days')->format('Y-m-d'), 'proxima' => $seg->modify('+7 days')->format('Y-m-d')];
}
