<?php
declare(strict_types=1);

// Agenda semanal das unidades (planilhas "AGENDA VILA", "AGENDA FELICITTÁ"...).
// Cada aba = dia da semana + período; coluna A = horário; cada coluna = sala/profissional;
// cada célula = paciente(s) daquele horário, com marcações como "PACIENTE DE ENTRADA" ou "DE SAÍDA".
// Cada importação vira uma versão da agenda da unidade; comparar versões mostra quem saiu da agenda.

const DIAS = [1 => 'Segunda', 2 => 'Terça', 3 => 'Quarta', 4 => 'Quinta', 5 => 'Sexta', 6 => 'Sábado'];
const PERIODOS = ['manha' => 'Manhã', 'tarde' => 'Tarde', 'noite' => 'Noite'];

// Área deduzida do cabeçalho da coluna (só usada quando o profissional ainda não está cadastrado).
// A primeira regra que casar vale, por isso as mais específicas vêm antes de PSICO.
const AGENDA_AREAS = [
    ['Acompanhamento Terapêutico', '/\(A\.?T\.?\)/'],
    ['Fonoaudiologia', '/FONO|LINGUAGEM/'],
    ['Terapia Ocupacional', '/TERAPIA OCUPACI|\bTO\b|^IS\b|\bAVD\b/'],
    ['Fisioterapia', '/FISIO/'],
    ['Psicopedagogia', '/PSICOPED/'],
    ['Psicomotricidade', '/PSICOMOT|JIU|MOTOR/'],
    ['Música', '/MUSIC/'],
    ['Nutrição', '/NUTRI|COZINHA/'],
    ['Psicologia', '/PSICO|ABA|PARQUE/'],
];

// Marcações dentro das células (texto sem acento, maiúsculo)
const AGENDA_MARCAS = [
    'saida' => '/DE SAIDA|VAI SAIR|RETIRAR|SAINDO|DESLIGAD/',
    'congelado' => '/CONGELAD/',
    'novo' => '/ENTRADA/',
    'retorno' => '/RETORNO/',
    'ajuste' => '/AJUSTE|ALTERACAO|REMANEJ/',
    'sem_aut' => '/SEM AUT/',
];

// Texto que não é nome de paciente
const AGENDA_IGNORAR = '/^(\d+\s*(A\s*\d+\s*)?ANOS?|\+?\s*DE \d+ ANOS|ATENDIMENTO.*|ANOS?|LINGUAGEM|SHOPPING|NAO INSERIR.*|AT:?|PSICOTERAPIA|ANAMNESE|COORD.*|COD\..*|SOLICITADO.*|PACIENTE.*|PCT.*|ENTRADA|AJUSTE|ALTERACAO|SEM AUT.*|VAGO|LIVRE|[^A-Z]*)$/';

function agenda_dia_periodo(string $aba): array
{
    $n = norm($aba);
    $dia = null;
    foreach (['SEGUNDA' => 1, 'TERCA' => 2, 'QUARTA' => 3, 'QUINTA' => 4, 'SEXTA' => 5, 'SABADO' => 6] as $k => $v) {
        if (str_contains($n, $k)) {
            $dia = $v;
        }
    }
    $per = str_contains($n, 'MANHA') ? 'manha' : (str_contains($n, 'TARDE') ? 'tarde' : (str_contains($n, 'NOITE') ? 'noite' : null));
    return [$dia, $per];
}

/** Horário da coluna A: fração do dia do Excel, "8H50", "17:00h", "8H". */
function agenda_hora($v): ?string
{
    if ((is_float($v) || is_int($v)) && $v >= 0 && $v < 1) {
        $min = (int) round($v * 1440);
        return sprintf('%02d:%02d', intdiv($min, 60), $min % 60);
    }
    if (is_string($v) && preg_match('/^\s*(\d{1,2})\s*[:Hh]\s*(\d{2})?\s*[Hh]?\s*$/', $v, $m)) {
        return sprintf('%02d:%02d', (int) $m[1], (int) ($m[2] ?? 0));
    }
    return null;
}

/** Cabeçalho da coluna -> [sala, nome do profissional, área deduzida]. */
function agenda_cabecalho(string $txt): array
{
    $linhas = array_values(array_filter(array_map('trim', preg_split('/\R/u', $txt)), fn($l) => $l !== ''));
    $sala = [];
    $aplic = [];
    $nome = null;
    $papel = '/^(PSICOLOG[OA]S?|FONOAUDIOLOG[OA]|TERAPEUTA OCUPACIONAL|FISIOTERAPEUTA|PSICOPEDAGOG[OA]|PSICOMOTRICISTA|NUTRICIONISTA|MUSICOTERAPEUTA)\b\s*/';
    foreach ($linhas as $l) {
        // anotações entre parênteses ("Ana Clara (A.T)", "(FONO)") descrevem a função, não o nome
        if (preg_match_all('/\(([^)]*)\)/u', $l, $pm)) {
            foreach ($pm[1] as $x) {
                if (trim($x) !== '') {
                    $sala[] = '(' . trim($x) . ')';
                }
            }
            $l = trim((string) preg_replace('/\([^)]*\)/u', '', $l));
            if ($l === '') {
                continue;
            }
        }
        $n = norm($l);
        if (preg_match('/^(APLICADOR|AT\s*:|SUPORTE)/u', $n)) {
            $aplic[] = trim((string) preg_replace('/^(APLICADOR\w*|AT)\s*:?\s*/iu', '', strip_acc($l)));
            continue;
        }
        if (preg_match('/^PROF(ISSIONAL|ISSAO)?\.?\s*:/u', $n) || preg_match('/^PROFISSIONAL\b/u', $n)) {
            $nome = $nome ?? (trim((string) preg_replace('/^PROF\w*\.?\s*:?\s*/iu', '', strip_acc($l))) ?: null);
            continue;
        }
        if ($nome === null && count($linhas) === 1 && !preg_match('/[0-9]/', $n) && !preg_match('/PSICO|FONO|TERAPIA|FISIO|ABA|OFICINA|GRUPO|SALA/', $n)) {
            $nome = $l;   // cabeçalho só com o nome
            continue;
        }
        $sala[] = $l;
    }
    if ($nome === null && $sala) {
        // "PSICÓLOGA⏎BEATRIZ KAROLINA", "PSICÓLOGA PAMELA", "ABA⏎⏎Maiara Da Silva⏎Psicólogo"
        $cand = null;
        $ehSala = '/[0-9]|PSICO|FONO|TERAPIA|TERAPEUT|FISIO|\bABA\b|OFICINA|GRUPO|SALA|PARQUE|COZINHA|NUTRI|MUSIC|ESTIMULA|\bAVD\b|^IS\b|ANOS|HABILIDADE|LINGUAGEM|AMBIENTE|INDIVIDUAL/';
        foreach ($sala as $i => $l) {
            if (str_starts_with($l, '(')) {
                continue;
            }
            $resto = trim((string) preg_replace($papel, '', norm($l)));
            if ($resto !== '' && $resto !== norm($l) && !preg_match($ehSala, $resto)) {
                $cand = [$i, $resto];
                break;
            }
            if ($resto !== '' && $resto === norm($l) && !preg_match($ehSala, $resto)) {
                $cand = [$i, $l];
                break;
            }
        }
        if ($cand) {
            $nome = $cand[1];
            unset($sala[$cand[0]]);
        }
    }
    $area = null;
    $nt = norm($txt);
    foreach (AGENDA_AREAS as [$a, $rx]) {
        if (preg_match($rx, $nt)) {
            $area = $a;
            break;
        }
    }
    $sala = trim((string) preg_replace('/\s+/', ' ', implode(' · ', $sala)));
    $nome = $nome !== null ? trim((string) preg_replace('/\s+/', ' ', $nome)) : null;
    if ($nome !== null && (mb_strlen($nome) < 3 || preg_match('/TESTE|^[^A-Za-z]*$/i', $nome))) {
        $nome = null;
    }
    $aplic = trim(implode(' · ', array_filter($aplic)));
    return [$sala ?: null, $nome ?: null, $area, $aplic ?: null];
}

/** Uma linha da célula -> [nome do paciente | null, marcações, observação]. */
function agenda_paciente(string $linha): array
{
    $orig = trim($linha);
    $n = norm($orig);
    if (preg_match('/^\+?\s*(DE\s+|ATE\s+)?\d+\s*(A|-|ATE|E)?\s*\d*\s*ANOS?\b/', $n)) {   // faixa etária da oficina: "03 - 05 Anos"
        return [null, [], '', null];
    }
    $n = (string) preg_replace('/^\d+\s*[-–.)]+\s*=?\s*/u', '', $n);   // "1- ", "2 - "
    $n = (string) preg_replace('/^\d+\s+(?=[A-Z])/u', '', $n);         // "4 PIETRO BRAGANCA"
    $marcas = [];
    foreach (AGENDA_MARCAS as $k => $rx) {
        if (preg_match($rx, $n)) {
            $marcas[$k] = true;
        }
    }
    $data = null;
    if (preg_match('/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/', $n, $m)) {
        $data = [(int) $m[1], (int) $m[2], isset($m[3]) ? (int) $m[3] : null];
    }
    // o nome vem antes do primeiro separador: " - ", "-", "(", "="
    $parts = preg_split('/\s*[-–(=]\s*/u', $n, 2);
    $nome = trim($parts[0]);
    $obs = trim($parts[1] ?? '', " )");
    $nome = trim((string) preg_replace('/\s+\d+\s*ANOS?\b.*$/', '', $nome));       // "LEONARDO VERO 9 ANOS"
    $nome = trim((string) preg_replace('/\s+(PACIENTE|PCT|ATENDIMENTO)\b.*$/', '', $nome));
    $nome = trim((string) preg_replace('/^[^A-Z]+|[^A-Z]+$/', '', $nome));                // aspas, pontos, traços nas pontas
    if ($nome === '' || preg_match(AGENDA_IGNORAR, $nome) || mb_strlen($nome) < 3) {
        $nome = null;
    }
    return [$nome, $marcas, $obs, $data];
}

/**
 * Lê a planilha de agenda inteira.
 * Retorna ['slots' => [...], 'avisos' => [...], 'colunas' => [...]]; cada slot é um horário de uma coluna:
 *  dia, periodo, hora, sala, prof_nome, area, situacao (ocupado|vago|fechado), modalidade, pacientes => [[nome, marcas, obs, data]]
 */
function agenda_ler(string $bytes): array
{
    $abas = xlsx_sheets($bytes);
    $avisos = [];
    $porChave = [];
    foreach ($abas as $nomeAba => $rows) {
        [$dia, $per] = agenda_dia_periodo($nomeAba);
        if ($dia === null) {
            if (array_filter($rows, fn($r) => array_filter($r, fn($c) => $c !== null && $c !== ''))) {
                $avisos[] = "Aba \"$nomeAba\" ignorada: o nome não indica o dia da semana.";
            }
            continue;
        }
        // cabeçalho = linhas antes do primeiro horário na coluna A
        $ini = null;
        foreach ($rows as $i => $r) {
            if (agenda_hora($r[0] ?? null) !== null) {
                $ini = $i;
                break;
            }
        }
        if ($ini === null) {
            continue;
        }
        $cab = [];
        for ($i = 0; $i < $ini; $i++) {
            foreach ($rows[$i] as $c => $v) {
                if ($c > 0 && $v !== null && trim((string) $v) !== '') {
                    $cab[$c] = isset($cab[$c]) ? $cab[$c] . "\n" . $v : (string) $v;
                }
            }
        }
        $slots = [];
        $nPac = 0;
        foreach (array_slice($rows, $ini) as $r) {
            $hora = agenda_hora($r[0] ?? null);
            if ($hora === null) {
                continue;
            }
            $p = $per ?? ((int) substr($hora, 0, 2) < 12 ? 'manha' : ((int) substr($hora, 0, 2) < 17 ? 'tarde' : 'noite'));
            foreach ($cab as $c => $h) {
                [$sala, $prof, $area, $aplic] = agenda_cabecalho($h);
                if ($prof === null) {
                    continue;
                }
                $v = trim((string) ($r[$c] ?? ''));
                $nv = norm($v);
                $slot = ['dia' => $dia, 'periodo' => $p, 'hora' => $hora, 'col' => $c, 'cabecalho' => $h, 'sala' => $sala,
                         'prof_nome' => $prof, 'area' => $area, 'aplicadores' => $aplic, 'vagas_grupo' => 0, 'situacao' => 'vago', 'modalidade' => 'individual', 'pacientes' => [], 'obs' => null];
                $hn = norm($h);
                // parênteses que quebram linha ("(Coord. Pedro ⏎Henrique)") ficam numa linha só
                $v1 = (string) preg_replace_callback('/\([^)]*\)/su', fn($m) => (string) preg_replace('/\s*\R\s*/u', ' ', $m[0]), $v);
                $linhas = array_values(array_filter(array_map('trim', preg_split('/\R/u', $v1)), fn($l) => $l !== ''));
                $numerada = (bool) array_filter($linhas, fn($l) => preg_match('/^\d+\s*[-–.)]?\s*(=|$|[-–]|\s)/u', $l) && !preg_match('/^\d+\s*(A\s*\d+\s*)?ANOS?/i', strip_acc($l)));
                if ($numerada || preg_match('/GRUPO|OFICINA/', $hn)) {
                    $slot['modalidade'] = 'grupo';
                }
                if (str_contains($nv, 'ATENDIMENTO INDIVIDUAL')) {
                    $slot['modalidade'] = 'individual';
                }
                if ($v === '') {
                    $slots[] = $slot;
                    continue;
                }
                if (preg_match('/^(FECHAD|BLOQUEAD)|NAO TEM ATENDIMENTO|FECHADO PEL/', $nv)) {
                    $slot['situacao'] = 'fechado';
                    $slot['obs'] = $v;
                    $slots[] = $slot;
                    continue;
                }
                if (!$numerada) {
                    // nome quebrado em duas linhas ("Gabriel da Silva ⏎Nascimento"): junta a palavra solta à linha de cima
                    $j = [];
                    foreach ($linhas as $l) {
                        if ($j && !preg_match('/\s/u', $l) && preg_match('/^\p{L}+$/u', $l) && !preg_match('/[-(]/u', end($j))
                            && !preg_match(AGENDA_IGNORAR, norm($l)) && !preg_match('/^(FECHAD|BLOQUEAD|VAGO|LIVRE|ENTRADA|RETORNO|AJUSTE|CONGELAD|PARTICULAR|CORTESIA)/', norm($l))) {
                            $j[count($j) - 1] .= ' ' . $l;
                        } else {
                            $j[] = $l;
                        }
                    }
                    $linhas = $j;
                }
                $vagasGrupo = 0;
                foreach ($linhas as $l) {
                    foreach (preg_split('/(?<=[A-Za-zÀ-ú])\s*\/\s*(?=[A-Za-zÀ-ú])/u', $l) as $pedaco) {   // "LUCCA DADAM/REBECA SOFIA"
                        [$nome, $marcas, $obs, $data] = agenda_paciente($pedaco);
                        if ($nome !== null) {
                            $slot['pacientes'][] = ['nome' => $nome, 'marcas' => $marcas, 'obs' => $obs, 'data' => $data, 'texto' => trim($pedaco)];
                        } elseif ($numerada && preg_match('/^\d+\s*[-–.)]*\s*$/u', trim($pedaco))) {
                            $vagasGrupo++;
                        }
                    }
                }
                $slot['vagas_grupo'] = $vagasGrupo;
                $slot['situacao'] = $slot['pacientes'] ? 'ocupado' : 'vago';
                if (!$slot['pacientes']) {
                    $slot['obs'] = $v;
                }
                $nPac += count($slot['pacientes']);
                $slots[] = $slot;
            }
        }
        $k = "$dia|$p";
        if (isset($porChave[$k])) {
            [$outra, $nOutra, $slOutra] = $porChave[$k];
            $fica = $nPac > $nOutra ? $nomeAba : $outra;
            $avisos[] = "As abas \"$outra\" e \"$nomeAba\" são do mesmo dia e período; usei só \"$fica\" (a que tem mais pacientes).";
            if ($nPac <= $nOutra) {
                continue;
            }
        }
        $porChave[$k] = [$nomeAba, $nPac, $slots];
    }
    $slots = [];
    foreach ($porChave as [, , $s]) {
        array_push($slots, ...$s);
    }
    if (!array_filter($slots, fn($s) => $s['pacientes'])) {
        throw new RuntimeException('Não encontrei pacientes na agenda. Confira se cada aba tem o dia e o período no nome (ex.: SEGUNDAMANHÃ) e a coluna A com os horários. Nada foi alterado.');
    }
    return ['slots' => $slots, 'avisos' => $avisos];
}

// ------------------------------------------------------------------ profissionais da agenda
// Grafias da agenda => nome cadastrado (soma-se ao PROF_ALIAS de importar.php)
const AGENDA_PROF_ALIAS = [
    'BRAHAM GUEDES' => 'MARCOS ABRAHAM GUEDES', 'MARCOS BRAHAM GUEDES' => 'MARCOS ABRAHAM GUEDES', 'ITALO' => 'ITALLO',
    'DANYELLA' => 'DANNYELA VITORIA', 'DANNYELA' => 'DANNYELA VITORIA', 'ANA ELISA PRADO' => 'ANA ELIZA PRADO NEVES',
    'ANA LIVIAN' => 'ANNA LIVIAN', 'THALYSSON' => 'THALYSON', 'PROFISSAO: JOAO EDER' => 'JOAO EDER',
];
// Áreas que o cabeçalho deixa claras: aí o profissional só é procurado dentro da área
const AGENDA_AREA_FORTE = '/FONO|TERAPIA OCUPACI|FISIO|PSICOPED|PSICOMOT|PSICOLOG|PSICOTERAPIA|MUSIC|\(A\.?T\.?\)/';

function agenda_prof_nome(string $raw): string
{
    $n = norm($raw);
    return AGENDA_PROF_ALIAS[$n] ?? PROF_ALIAS[$n] ?? $n;
}

/** Acha o profissional cadastrado; cria na área deduzida se não existir. Devolve [id, criado?]. */
function agenda_prof_id(string $nome, ?string $area, string $cabecalho, array &$cache): array
{
    $n = agenda_prof_nome($nome);
    $k = $n . '|' . ($area ?? '');
    if (isset($cache[$k])) {
        return [$cache[$k], false];
    }
    $todos = rows('SELECT p.id, p.nome, e.nome esp FROM profissionais p JOIN especialidades e ON e.id=p.especialidade_id');
    // $amplo: também aceita o cadastro mais curto que o nome da agenda (GUSTAVO KHALIL p/ GUSTAVO KHALIL DA PAZ) — só dentro da área
    $casa = function (array $lista, bool $amplo) use ($n): array {
        $ex = array_values(array_filter($lista, fn($r) => norm($r['nome']) === $n));
        if ($ex) {
            return $ex;
        }
        $pre = array_values(array_filter($lista, fn($r) => str_starts_with(norm($r['nome']), $n . ' ')
            || ($amplo && str_starts_with($n, norm($r['nome']) . ' '))));
        usort($pre, fn($a, $b) => strlen($b['nome']) <=> strlen($a['nome']));
        return $pre;
    };
    $mesmaArea = $area ? $casa(array_filter($todos, fn($r) => $r['esp'] === $area), true) : [];
    $achou = $mesmaArea[0] ?? null;
    if (!$achou && !preg_match(AGENDA_AREA_FORTE, norm($cabecalho))) {
        $glob = $casa($todos, false);
        $exatos = array_values(array_filter($glob, fn($r) => norm($r['nome']) === $n));
        if (count($exatos) === 1) {
            $achou = $exatos[0];
        } elseif (count($glob) === 1) {
            $achou = $glob[0];
        }
    }
    if ($achou) {
        return [$cache[$k] = (int) $achou['id'], false];
    }
    $area ??= 'Psicologia';
    $eid = one('SELECT id FROM especialidades WHERE nome=?', [$area]);
    if (!$eid) {
        q('INSERT INTO especialidades(nome, abrev) VALUES (?, ?)', [$area, $area === 'Acompanhamento Terapêutico' ? 'AT' : mb_substr($area, 0, 6)]);
        $eid = db()->lastInsertId();
    }
    q('INSERT INTO profissionais(nome, especialidade_id) VALUES (?, ?)', [title($n), (int) $eid]);
    return [$cache[$k] = (int) db()->lastInsertId(), true];
}

function agenda_data_marca(?array $d, string $ref): ?string
{
    if (!$d) {
        return null;
    }
    [$dd, $mm, $yy] = $d;
    if ($mm < 1 || $mm > 12 || $dd < 1 || $dd > 31) {
        return null;
    }
    $ano = $yy ? ($yy < 100 ? 2000 + $yy : $yy) : (int) substr($ref, 0, 4);
    if (!$yy && $mm < (int) substr($ref, 5, 2) - 6) {   // "01/02" numa agenda de novembro = ano seguinte
        $ano++;
    }
    return checkdate($mm, $dd, $ano) ? sprintf('%04d-%02d-%02d', $ano, $mm, $dd) : null;
}

function unidade_norm(string $u): string
{
    $u = trim((string) preg_replace('/\s+/', ' ', mb_strtoupper(trim($u), 'UTF-8')));
    return trim((string) preg_replace('/^AGENDA\s+/u', '', $u));
}

// ------------------------------------------------------------------ importação
/**
 * Importa a planilha de agenda de uma unidade e atualiza a carteira ativa (vínculos de origem "agenda:<UNIDADE>")
 * a partir da versão mais recente.
 *  $modo = 'atualizar'    : cria uma versão nova (agenda da semana); a anterior fica guardada para comparar
 *                           quem saiu e quem entrou. Se já houver versão com a mesma data, ela é substituída.
 *  $modo = 'sobrescrever' : substitui a agenda mais recente da unidade (correção da mesma semana), sem criar histórico.
 */
function importar_agenda(string $bytes, string $unidade, ?string $dataRef = null, ?string $arquivo = null, string $modo = 'atualizar'): array
{
    $unidade = unidade_norm($unidade);
    if ($unidade === '') {
        throw new InvalidArgumentException('Informe a unidade da agenda (ex.: VILA, FELICITTÁ).');
    }
    $modo = $modo === 'sobrescrever' ? 'sobrescrever' : 'atualizar';
    $dataRef = $dataRef && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dataRef) ? $dataRef : date('Y-m-d');
    $lido = agenda_ler($bytes);
    $avisos = $lido['avisos'];

    // pacientes: funde grafias curtas no único nome completo compatível (GABRIEL MARTINS -> GABRIEL MARTINS PEREIRA)
    $nomes = [];
    foreach ($lido['slots'] as $s) {
        foreach ($s['pacientes'] as $p) {
            $nomes[] = $p['nome'];
        }
    }
    // só funde quando o nome completo aparece pelo menos tanto quanto o curto: evita colar "HEITOR BRINGEL" (11x)
    // num erro de digitação isolado como "HEITOR BRINGEL HEITOR SILVA ALENCAR" (1x)
    $freq = array_count_values($nomes);
    $canonPac = [];
    foreach (canon_map($nomes) as $curto => $longo) {
        $canonPac[$curto] = $curto !== $longo && ($freq[$longo] ?? 0) >= ($freq[$curto] ?? 0) ? $longo : $curto;
    }
    // profissionais: idem, dentro da própria planilha (IRANILDO -> IRANILDO ALVES)
    $canonProf = canon_map(array_map(fn($s) => agenda_prof_nome($s['prof_nome']), $lido['slots']));

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $ultima = q('SELECT id, data_ref FROM agenda_versoes WHERE unidade=? ORDER BY data_ref DESC LIMIT 1', [$unidade])->fetch();
        if ($modo === 'sobrescrever' && $ultima) {
            q('DELETE FROM agenda_versoes WHERE id=?', [$ultima['id']]);   // apaga os horários junto (cascade)
            $avisos[] = 'A agenda anterior de ' . $unidade . ' (' . date('d/m/Y', strtotime($ultima['data_ref'])) . ') foi substituída por esta.';
        } elseif ($ultima && $dataRef < $ultima['data_ref']) {
            $avisos[] = 'Atenção: a data informada é anterior à agenda mais recente de ' . $unidade . ' (' . date('d/m/Y', strtotime($ultima['data_ref']))
                . '). Ela foi guardada como histórico e não substitui a atual.';
        }
        $vid = one('SELECT id FROM agenda_versoes WHERE unidade=? AND data_ref=?', [$unidade, $dataRef]);
        if ($vid) {
            q('DELETE FROM agenda_slots WHERE versao_id=?', [$vid]);
            q("UPDATE agenda_versoes SET importado_em=datetime('now'), arquivo=? WHERE id=?", [$arquivo, $vid]);
        } else {
            q('INSERT INTO agenda_versoes(unidade, data_ref, arquivo) VALUES (?,?,?)', [$unidade, $dataRef, $arquivo]);
            $vid = (int) $pdo->lastInsertId();
        }
        $cache = [];
        $criados = [];
        $pacIds = [];
        $nPac = 0;
        $insSlot = $pdo->prepare('INSERT INTO agenda_slots(versao_id, dia, periodo, hora, profissional_id, sala, aplicadores, situacao, modalidade, vagas_grupo, obs)
                                  VALUES (?,?,?,?,?,?,?,?,?,?,?)');
        $insPac = $pdo->prepare('INSERT INTO agenda_pacientes(slot_id, paciente_id, texto, novo, retorno, saida, ajuste, sem_aut, congelado, data_marca, obs)
                                 VALUES (?,?,?,?,?,?,?,?,?,?,?)');
        foreach ($lido['slots'] as $s) {
            $pn = agenda_prof_nome($s['prof_nome']);
            $pn = $canonProf[$pn] ?? $pn;
            [$prid, $novoProf] = agenda_prof_id($pn, $s['area'], $s['cabecalho'], $cache);
            if ($novoProf) {
                $criados[] = title($pn) . ' (' . ($s['area'] ?? 'Psicologia') . ')';
            }
            $insSlot->execute([$vid, $s['dia'], $s['periodo'], $s['hora'], $prid, $s['sala'], $s['aplicadores'], $s['situacao'],
                               $s['modalidade'], $s['vagas_grupo'], $s['obs'] ? mb_substr($s['obs'], 0, 300) : null]);
            $sid = (int) $pdo->lastInsertId();
            foreach ($s['pacientes'] as $p) {
                $nome = $canonPac[$p['nome']] ?? $p['nome'];
                $pid = $pacIds[$nome] ??= pac_id($nome);
                $m = $p['marcas'];
                $insPac->execute([$sid, $pid, mb_substr($p['texto'], 0, 200), (int) !empty($m['novo']), (int) !empty($m['retorno']),
                                  (int) !empty($m['saida']), (int) !empty($m['ajuste']), (int) !empty($m['sem_aut']), (int) !empty($m['congelado']),
                                  agenda_data_marca($p['data'], $dataRef), $p['obs'] !== '' ? mb_substr($p['obs'], 0, 200) : null]);
                $nPac++;
            }
        }
        agenda_sincronizar_carteira($unidade);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    if ($criados) {
        $criados = array_values(array_unique($criados));
        $avisos[] = count($criados) . ' profissional(is) novo(s) cadastrado(s) a partir da agenda — confira a área em Cadastros: ' . implode(', ', array_slice($criados, 0, 40));
    }
    return ['importados' => $nPac, 'pacientes' => count($pacIds), 'unidade' => $unidade, 'data_ref' => $dataRef, 'avisos' => $avisos];
}

/** Carteira ativa = pacientes da versão mais recente da agenda de cada unidade. */
function agenda_sincronizar_carteira(string $unidade): void
{
    $origem = 'agenda:' . $unidade;
    $v = q('SELECT id, data_ref FROM agenda_versoes WHERE unidade=? ORDER BY data_ref DESC LIMIT 1', [$unidade])->fetch();
    $antes = [];
    foreach (rows('SELECT paciente_id, profissional_id, data_inicio FROM vinculos WHERE origem=?', [$origem]) as $x) {
        $antes[$x['paciente_id'] . '|' . $x['profissional_id']] = $x['data_inicio'];
    }
    q('DELETE FROM vinculos WHERE origem=?', [$origem]);
    if ($v) {
        $pares = rows("SELECT ap.paciente_id, s.profissional_id, MAX(s.modalidade='grupo') grupo,
                              MIN(CASE WHEN ap.novo=1 THEN COALESCE(ap.data_marca, ?) END) ini_novo
                       FROM agenda_pacientes ap JOIN agenda_slots s ON s.id=ap.slot_id
                       WHERE s.versao_id=? AND ap.congelado=0 GROUP BY 1, 2", [$v['data_ref'], $v['id']]);
        foreach ($pares as $p) {
            $ini = $antes[$p['paciente_id'] . '|' . $p['profissional_id']] ?? $p['ini_novo'];
            q('INSERT OR IGNORE INTO vinculos(paciente_id, profissional_id, data_inicio, origem, modalidade) VALUES (?,?,?,?,?)',
                [$p['paciente_id'], $p['profissional_id'], $ini, $origem, $p['grupo'] ? 'grupo' : 'individual']);
        }
    }
    // ativo = tem vínculo aberto; quem estava na agenda e saiu dela (sem outro vínculo aberto) volta a inativo
    q("UPDATE pacientes SET status='ativo' WHERE id IN (SELECT paciente_id FROM vinculos WHERE data_fim IS NULL)");
    $eram = array_unique(array_map(fn($k) => (int) explode('|', $k)[0], array_keys($antes)));
    foreach (array_chunk($eram, 500) as $ids) {
        $in = implode(',', $ids);
        q("UPDATE pacientes SET status='inativo' WHERE id IN ($in) AND id NOT IN (SELECT paciente_id FROM vinculos WHERE data_fim IS NULL)");
        // nomes que só existiam por causa da agenda (grafia corrigida, por exemplo) e não são usados em mais nada
        q("DELETE FROM pacientes WHERE id IN ($in) AND id NOT IN (SELECT paciente_id FROM vinculos) AND id NOT IN (SELECT paciente_id FROM agenda_pacientes)
           AND id NOT IN (SELECT paciente_id FROM saidas) AND id NOT IN (SELECT paciente_id FROM atendimentos)
           AND id NOT IN (SELECT paciente_id FROM avaliacoes WHERE paciente_id IS NOT NULL)");
    }
}

// ------------------------------------------------------------------ painel da agenda
/** Versão mais recente de cada unidade (ou só da escolhida) e a anterior, para comparar. */
function agenda_versoes_atuais(?string $unidade = null): array
{
    $out = [];
    foreach (rows('SELECT DISTINCT unidade FROM agenda_versoes ORDER BY unidade') as $u) {
        if ($unidade && $u['unidade'] !== $unidade) {
            continue;
        }
        $vs = rows('SELECT * FROM agenda_versoes WHERE unidade=? ORDER BY data_ref DESC LIMIT 2', [$u['unidade']]);
        $out[] = ['atual' => $vs[0], 'anterior' => $vs[1] ?? null];
    }
    return $out;
}

function agenda_painel(array $q): array
{
    $unidade = isset($q['unidade']) && $q['unidade'] !== '' ? unidade_norm((string) $q['unidade']) : null;
    $esp = isset($q['esp']) && $q['esp'] !== '' ? (int) $q['esp'] : null;
    $vers = agenda_versoes_atuais($unidade);
    $unidades = rows('SELECT unidade, MAX(data_ref) data_ref, COUNT(*) versoes FROM agenda_versoes GROUP BY 1 ORDER BY 1');
    if (!$vers) {
        return ['vazio' => true, 'unidades' => $unidades];
    }
    $in = implode(',', array_map(fn($v) => (int) $v['atual']['id'], $vers));
    $espSql = $esp ? " AND p.especialidade_id = $esp" : '';
    $profs = [];
    foreach (rows("SELECT DISTINCT p.id, p.nome, p.foto_url, p.especialidade_id esp_id, e.nome esp
                   FROM agenda_slots s JOIN profissionais p ON p.id=s.profissional_id JOIN especialidades e ON e.id=p.especialidade_id
                   WHERE s.versao_id IN ($in) $espSql") as $p) {
        $profs[$p['id']] = $p + ['unidades' => [], 'atendimentos' => 0, 'atend_grupo' => 0, 'horarios' => 0, 'vagos' => 0, 'fechados' => 0,
                                  'vagas_grupo' => 0, 'pacientes' => [], 'novos' => [], 'saidas' => [], 'sem_aut' => [], 'ajustes' => [],
                                  'congelados' => [], 'dias' => [], 'saiu_agenda' => [], 'entrou_agenda' => []];
    }
    $slots = rows("SELECT s.profissional_id, s.dia, s.situacao, s.vagas_grupo, v.unidade FROM agenda_slots s
                   JOIN agenda_versoes v ON v.id=s.versao_id JOIN profissionais p ON p.id=s.profissional_id
                   WHERE s.versao_id IN ($in) $espSql");
    $pacs = rows("SELECT ap.*, pa.nome paciente, s.profissional_id, s.dia, s.periodo, s.hora, s.modalidade, v.unidade
                  FROM agenda_pacientes ap JOIN agenda_slots s ON s.id=ap.slot_id JOIN agenda_versoes v ON v.id=s.versao_id
                  JOIN pacientes pa ON pa.id=ap.paciente_id JOIN profissionais p ON p.id=s.profissional_id
                  WHERE s.versao_id IN ($in) $espSql");
    foreach ($slots as $s) {
        $m = &$profs[$s['profissional_id']];
        $m['unidades'][$s['unidade']] = true;
        $m['dias'][$s['dia']] = true;
        $m[$s['situacao'] === 'ocupado' ? 'horarios' : ($s['situacao'] === 'vago' ? 'vagos' : 'fechados')]++;
        $m['vagas_grupo'] += (int) $s['vagas_grupo'];
        unset($m);
    }
    $grade = [];   // "dia|periodo" => atendimentos
    $listas = ['novos' => [], 'saidas' => [], 'sem_aut' => [], 'ajustes' => [], 'congelados' => []];
    foreach ($pacs as $a) {
        $m = &$profs[$a['profissional_id']];
        if (!$a['congelado']) {
            $m['atendimentos']++;
            $m['atend_grupo'] += (int) ($a['modalidade'] === 'grupo');
            $g = $a['dia'] . '|' . $a['periodo'];
            $grade[$g] = ($grade[$g] ?? 0) + 1;
        }
        $m['pacientes'][$a['paciente_id']] = true;
        $item = ['paciente' => $a['paciente'], 'prof_id' => (int) $a['profissional_id'], 'unidade' => $a['unidade'],
                 'dia' => (int) $a['dia'], 'hora' => $a['hora'], 'data' => $a['data_marca'], 'texto' => $a['texto']];
        foreach (['novo' => 'novos', 'saida' => 'saidas', 'sem_aut' => 'sem_aut', 'ajuste' => 'ajustes', 'congelado' => 'congelados'] as $col => $l) {
            if ($a[$col]) {
                $m[$l][$a['paciente_id']] = true;
                $listas[$l][$a['paciente_id'] . '|' . $a['profissional_id']] ??= $item;
            }
        }
        unset($m);
    }
    // comparação com a versão anterior de cada unidade: quem saiu e quem entrou na agenda do profissional
    $mov = ['saiu' => [], 'entrou' => []];
    $pares = fn(int $vid) => array_column(rows("SELECT DISTINCT ap.paciente_id || '|' || s.profissional_id k, ap.paciente_id, s.profissional_id, pa.nome
                                                FROM agenda_pacientes ap JOIN agenda_slots s ON s.id=ap.slot_id JOIN pacientes pa ON pa.id=ap.paciente_id
                                                WHERE s.versao_id=? AND ap.congelado=0", [$vid]), null, 'k');
    foreach ($vers as $v) {
        if (!$v['anterior']) {
            continue;
        }
        $atual = $pares((int) $v['atual']['id']);
        $ant = $pares((int) $v['anterior']['id']);
        foreach (['saiu' => [$ant, $atual], 'entrou' => [$atual, $ant]] as $tipo => [$a, $b]) {
            foreach (array_diff_key($a, $b) as $x) {
                if (!isset($profs[$x['profissional_id']])) {
                    continue;
                }
                $profs[$x['profissional_id']][$tipo . '_agenda'][$x['paciente_id']] = true;
                $mov[$tipo][] = ['paciente' => $x['nome'], 'prof_id' => (int) $x['profissional_id'], 'unidade' => $v['atual']['unidade'],
                                 'de' => $v['anterior']['data_ref'], 'ate' => $v['atual']['data_ref']];
            }
        }
    }
    // saídas da planilha de saídas nos últimos 12 meses (complementa o ranking de perdas)
    $saidas12 = [];
    foreach (rows("SELECT sp.profissional_id, COUNT(*) n FROM saida_profissionais sp JOIN saidas s ON s.id=sp.saida_id
                   WHERE s.data_saida >= date('now','-12 months') GROUP BY 1") as $r) {
        $saidas12[$r['profissional_id']] = (int) $r['n'];
    }
    $lista = [];
    foreach ($profs as $id => $m) {
        $nPac = count($m['pacientes']);
        $cap = $m['horarios'] + $m['vagos'];
        $lista[] = [
            'id' => $id, 'nome' => $m['nome'], 'esp' => $m['esp'], 'esp_id' => (int) $m['esp_id'], 'foto' => $m['foto_url'],
            'unidades' => array_keys($m['unidades']), 'dias' => count($m['dias']),
            'atendimentos' => $m['atendimentos'], 'atend_grupo' => $m['atend_grupo'], 'atend_individual' => $m['atendimentos'] - $m['atend_grupo'],
            'horarios' => $m['horarios'], 'vagos' => $m['vagos'], 'fechados' => $m['fechados'], 'vagas_grupo' => $m['vagas_grupo'],
            'ocupacao' => $cap ? pct($m['horarios'], $cap) : null,
            'pacientes' => $nPac, 'novos' => count($m['novos']), 'saidas' => count($m['saidas']), 'sem_aut' => count($m['sem_aut']),
            'ajustes' => count($m['ajustes']), 'congelados' => count($m['congelados']),
            'saiu_agenda' => count($m['saiu_agenda']), 'entrou_agenda' => count($m['entrou_agenda']),
            'perdas' => count($m['saidas'] + $m['saiu_agenda']),
            'saidas_12m' => $saidas12[$id] ?? 0,
        ];
    }
    usort($lista, fn($a, $b) => $b['atendimentos'] <=> $a['atendimentos']);
    $areas = [];
    foreach ($lista as $p) {
        $areas[$p['esp_id']] ??= ['id' => $p['esp_id'], 'nome' => $p['esp'], 'profissionais' => 0, 'atendimentos' => 0, 'horarios' => 0,
                                  'vagos' => 0, 'novos' => 0, 'saidas' => 0, 'perdas' => 0, 'pacientes' => 0];
        $areas[$p['esp_id']]['profissionais']++;
        foreach (['atendimentos', 'horarios', 'vagos', 'novos', 'saidas', 'perdas', 'pacientes'] as $k) {
            $areas[$p['esp_id']][$k] += $p[$k];
        }
    }
    foreach ($areas as &$a) {
        $a['por_prof'] = round($a['atendimentos'] / max(1, $a['profissionais']), 1);
        $a['ocupacao'] = pct($a['horarios'], $a['horarios'] + $a['vagos']);
    }
    unset($a);
    $areas = array_values($areas);
    usort($areas, fn($a, $b) => $b['atendimentos'] <=> $a['atendimentos']);
    $hor = array_sum(array_column($lista, 'horarios'));
    $vag = array_sum(array_column($lista, 'vagos'));
    foreach ($listas as &$l) {
        $l = array_values($l);
        usort($l, fn($a, $b) => strcmp($a['paciente'], $b['paciente']));
    }
    unset($l);
    return [
        'vazio' => false,
        'unidades' => $unidades,
        'versoes' => array_map(fn($v) => ['unidade' => $v['atual']['unidade'], 'data_ref' => $v['atual']['data_ref'],
                                           'anterior' => $v['anterior']['data_ref'] ?? null], $vers),
        'kpis' => ['atendimentos' => array_sum(array_column($lista, 'atendimentos')), 'pacientes' => count(array_unique(array_column($pacs, 'paciente_id'))),
                   'profissionais' => count($lista), 'horarios' => $hor, 'vagos' => $vag, 'ocupacao' => pct($hor, $hor + $vag),
                   'novos' => count($listas['novos']), 'saidas' => count($listas['saidas']), 'sem_aut' => count($listas['sem_aut']),
                   'ajustes' => count($listas['ajustes']), 'congelados' => count($listas['congelados']),
                   'saiu_agenda' => count($mov['saiu']), 'entrou_agenda' => count($mov['entrou']),
                   'fechados' => array_sum(array_column($lista, 'fechados')), 'vagas_grupo' => array_sum(array_column($lista, 'vagas_grupo'))],
        'profissionais' => $lista,
        'areas' => $areas,
        'grade' => (object) $grade,
        'listas' => $listas,
        'movimento' => $mov,
    ];
}

/** Grade semanal de um profissional (versão mais recente de cada unidade). */
function agenda_profissional(int $pid): array
{
    $ids = array_map(fn($v) => (int) $v['atual']['id'], agenda_versoes_atuais());
    if (!$ids) {
        return [];
    }
    $in = implode(',', $ids);
    $slots = rows("SELECT s.id, s.dia, s.periodo, s.hora, s.sala, s.aplicadores, s.situacao, s.modalidade, s.vagas_grupo, s.obs, v.unidade
                   FROM agenda_slots s JOIN agenda_versoes v ON v.id=s.versao_id
                   WHERE s.versao_id IN ($in) AND s.profissional_id=? ORDER BY v.unidade, s.dia, s.hora", [$pid]);
    $pacs = [];
    foreach (rows("SELECT ap.slot_id, pa.nome, ap.novo, ap.retorno, ap.saida, ap.ajuste, ap.sem_aut, ap.congelado, ap.data_marca
                   FROM agenda_pacientes ap JOIN pacientes pa ON pa.id=ap.paciente_id JOIN agenda_slots s ON s.id=ap.slot_id
                   WHERE s.versao_id IN ($in) AND s.profissional_id=?", [$pid]) as $p) {
        $pacs[$p['slot_id']][] = $p;
    }
    foreach ($slots as &$s) {
        $s['pacientes'] = $pacs[$s['id']] ?? [];
    }
    unset($s);
    return $slots;
}
