<?php
declare(strict_types=1);

// Importação das planilhas (.xlsx) para o SQLite e geração das planilhas-modelo.

const MESES = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

const ESPECIALIDADES = [  // cabeçalho normalizado => [nome, abreviação]
    'PSICOLOGIA' => ['Psicologia', 'Psico'], 'TERAPIA OCUPACIONAL' => ['Terapia Ocupacional', 'TO'],
    'FONOAUDIOLOGIA' => ['Fonoaudiologia', 'Fono'], 'FISIOTERAPIA' => ['Fisioterapia', 'Fisio'],
    'PSICOMOTRICIDADE' => ['Psicomotricidade', 'Psicomot'], 'NUTRICAO' => ['Nutrição', 'Nutri'],
    'MUSICA' => ['Música', 'Música'], 'MUSICOTERAPIA' => ['Música', 'Música'], 'PSICOPEDAGOGIA' => ['Psicopedagogia', 'Psicoped'],
];

const CONV_ALIAS = ['ASSEZAZ' => 'ASSEFAZ', 'PORTO SAUDE' => 'PORTO SAÚDE'];

const PROF_ALIAS = [
    'LUTTIENY' => 'LUTTIENNY', 'SAMILLA' => 'SAMILA', 'SAMILLA FERNANDES' => 'SAMILA FERNANDES', 'LUDYMILA' => 'LUDMYLA',
    'LUIZ FELIPE' => 'LUIZ FILIPE', 'CAIO FILLIPE' => 'CAIO FILIPE', 'LARISSA ELEN' => 'LARISSA ELLEN', 'FRANCIELENE' => 'FRANCILENE',
    'GUSTAVO KHALL' => 'GUSTAVO KHALIL', 'MAUJRO JUNIOR' => 'MAURO JUNIOR', 'BIANA' => 'BIANCA', 'THALYSSON' => 'THALYSON',
    'BETARIZ KAROLINE' => 'BEATRIZ KAROLINA', 'ANA BETARIZ' => 'ANA BEATRIZ', 'JESSICA DA SILA' => 'JESSICA DA SILVA',
    'NATHALIA GABIRELE' => 'NATHALIA GABRIELE', 'STEPHANYE' => 'STEPHANY', 'STEPHANNY' => 'STEPHANY', 'MIRIAM' => 'MIRIAN',
    'GIOVANA DE CARVALHO' => 'GIOVANNA DE CARVALHO', 'GIOVANA CARVALHO' => 'GIOVANNA DE CARVALHO', 'AMANDA OLIVEIRA' => 'AMANDA DE OLIVEIRA',
    'MATHEUS B' => 'MATHEUS BEZERRA', 'SARAH CARNEIRO' => 'SARA CARNEIRO',
];

// A primeira regra que casar com a observação (sem acento, maiúscula) define a categoria
const MOTIVOS = [
    ['Faltas / ausências', '/FALTA|AUSENCIA|SEM RETORNO/'],
    ['Insatisfação / adaptação', '/INSATISF|RECLAMA|PROBLEMA COM O PROFISSIONAL|ADAPTOU|NAO FORAM ADEQUADOS|RELACIONADOS AO CLINICO/'],
    ['Convênio / plano', '/CONVENIO|PLANO|ELEGI|AMIL/'],
    ['Mudança de clínica', '/(MUDANCA|TROCA|MUDOU)( DE ENDERECO E)? DE CLINICA|TERAPEUTA PARTICULAR/'],
    ['Logística / rotina', '/ENDERECO|CIDADE|DISTAN|LOCALIZA|DESLOCAMENTO|ROTINA|HORARIO|VIAJANDO|NAO PODER TRAZER/'],
    ['Outros', '/\bALTA\b|18 ANOS|ATESTADO|MOTIVOS DE SAUDE|DESREGULANDO|FINANCEIR|PAGAMENTO|PEDIDO|DESLIGADO/'],
    ['Não informado', '/NAO INFORM|NAO QUIS INFORMAR|FORMALIZADO PELA RECEP|FORMALIZADO POR E-?MAIL|^AGENDA DISPONIBILIZADA$|^$/'],
    ['Decisão da família', '/SOLICIT|RESPONSAVEL|MAE|PESSOA|CONTINUIDADE|PAUSA/'],
];

const STATUS_ATEND = [
    'REALIZADO' => 'realizado', 'PRESENTE' => 'realizado', 'P' => 'realizado', 'ATENDIDO' => 'realizado',
    'FALTA' => 'falta', 'F' => 'falta', 'AUSENTE' => 'falta',
    'FALTA JUSTIFICADA' => 'falta_justificada', 'FJ' => 'falta_justificada', 'JUSTIFICADA' => 'falta_justificada',
    'CANCELADO CLINICA' => 'cancelado_clinica', 'CANCELADO PELA CLINICA' => 'cancelado_clinica',
    'CANCELADO PACIENTE' => 'cancelado_paciente', 'CANCELADO PELO PACIENTE' => 'cancelado_paciente', 'DESMARCADO' => 'cancelado_paciente',
];

const GRUPO_RX = '/\s*(?:[\(\[]\s*(?:G|GRUPO)\s*[\)\]]|\bGRUPO\b|\*)\s*/';

function categorizar($obs): string
{
    $t = norm($obs);
    foreach (MOTIVOS as [$cat, $rx]) {
        if (preg_match($rx, $t)) {
            return $cat;
        }
    }
    return 'Outros';
}

/** Aceita data do Excel (número de série), DD/MM/AAAA, AAAA-MM-DD, DD-MM-AAAA, MM/AAAA. */
function parse_date($v): ?string
{
    if ($v === null || $v === '') {
        return null;
    }
    if (is_int($v) || is_float($v)) {
        if ($v > 20000 && $v < 80000) {
            return (new DateTimeImmutable('1899-12-30'))->modify('+' . (int) floor($v) . ' days')->format('Y-m-d');
        }
        return null;
    }
    $s = trim((string) $v);
    foreach (['d/m/Y', 'Y-m-d', 'd/m/y', 'd-m-Y'] as $f) {
        $d = DateTimeImmutable::createFromFormat('!' . $f, $s);
        if ($d && $d->format($f) === $s) {
            return $d->format('Y-m-d');
        }
    }
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $s, $m)) {
        return "$m[1]-$m[2]-$m[3]";
    }
    if (preg_match('/^(\d{1,2})\/(\d{4})$/', $s, $m)) {
        return sprintf('%04d-%02d-01', $m[2], $m[1]);
    }
    return null;
}

// ------------------------------------------------------------------ leitura de xlsx (sem bibliotecas)
function xlsx_rows(string $bytes): array
{
    $abas = xlsx_sheets($bytes, true);
    return reset($abas) ?: [];
}

/** Abas da planilha na ordem do workbook: [nome da aba => linhas]. $soPrimeira lê só a primeira. */
function xlsx_sheets(string $bytes, bool $soPrimeira = false): array
{
    $tmp = tempnam(sys_get_temp_dir(), 'xlsx');
    file_put_contents($tmp, $bytes);
    $zip = new ZipArchive();
    if ($zip->open($tmp) !== true) {
        @unlink($tmp);
        throw new RuntimeException('Arquivo não é uma planilha .xlsx válida.');
    }
    $shared = [];
    if (($ss = $zip->getFromName('xl/sharedStrings.xml')) !== false) {
        $x = simplexml_load_string($ss);
        foreach ($x->si as $si) {
            if (isset($si->t)) {
                $shared[] = (string) $si->t;
            } else {
                $t = '';
                foreach ($si->r as $r) {
                    $t .= (string) $r->t;
                }
                $shared[] = $t;
            }
        }
    }
    // abas na ordem do workbook
    $paths = [];
    $wb = $zip->getFromName('xl/workbook.xml');
    $rels = $zip->getFromName('xl/_rels/workbook.xml.rels');
    if ($wb !== false && $rels !== false) {
        $alvo = [];
        foreach (simplexml_load_string($rels)->Relationship as $rel) {
            $tgt = ltrim((string) $rel['Target'], '/');
            $alvo[(string) $rel['Id']] = str_starts_with($tgt, 'xl/') ? $tgt : 'xl/' . $tgt;
        }
        $w = simplexml_load_string($wb);
        $w->registerXPathNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
        foreach ($w->xpath('//m:sheets/m:sheet') as $sh) {
            $rid = (string) $sh->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')['id'];
            if (isset($alvo[$rid])) {
                $paths[(string) $sh['name']] = $alvo[$rid];
            }
        }
    }
    $paths = $paths ?: ['Planilha1' => 'xl/worksheets/sheet1.xml'];
    if ($soPrimeira) {
        $paths = array_slice($paths, 0, 1, true);
    }
    $abas = [];
    foreach ($paths as $nome => $path) {
        $xml = $zip->getFromName($path);
        if ($xml !== false) {
            $abas[$nome] = xlsx_sheet_rows(simplexml_load_string($xml), $shared);
        }
    }
    $zip->close();
    @unlink($tmp);
    if (!$abas) {
        throw new RuntimeException('Não encontrei a primeira aba da planilha.');
    }
    return $abas;
}

function xlsx_sheet_rows(SimpleXMLElement $sheet, array $shared): array
{
    $out = [];
    foreach ($sheet->sheetData->row as $row) {
        $r = [];
        foreach ($row->c as $c) {
            $ref = (string) $c['r'];
            $col = 0;
            for ($i = 0; $i < strlen($ref) && ctype_alpha($ref[$i]); $i++) {
                $col = $col * 26 + (ord(strtoupper($ref[$i])) - 64);
            }
            $col = max(0, $col - 1);
            $t = (string) $c['t'];
            if ($t === 's') {
                $v = $shared[(int) $c->v] ?? '';
            } elseif ($t === 'inlineStr') {
                $v = (string) $c->is->t;
            } elseif ($t === 'str' || $t === 'e') {
                $v = (string) $c->v;
            } elseif ($t === 'b') {
                $v = (string) $c->v === '1';
            } else {
                $raw = (string) $c->v;
                $v = $raw === '' ? null : (is_numeric($raw) ? (float) $raw : $raw);
                if (is_float($v) && floor($v) == $v && abs($v) < PHP_INT_MAX) {
                    $v = (int) $v;
                }
            }
            $r[$col] = $v;
        }
        $n = $r ? max(array_keys($r)) + 1 : 0;
        $line = [];
        for ($i = 0; $i < $n; $i++) {
            $line[] = $r[$i] ?? null;
        }
        $out[] = $line;
    }
    return $out;
}

/** [cabeçalho original, cabeçalho normalizado, linhas de dados] a partir da linha que contém $required. */
function read_sheet(string $bytes, string $required = 'PACIENTE'): array
{
    $rows = xlsx_rows($bytes);
    foreach ($rows as $i => $r) {
        $h = array_map('norm', $r);
        foreach ($h as $x) {
            if (str_starts_with($x, $required)) {
                return [array_map(fn($c) => trim((string) ($c ?? '')), $r), $h, array_slice($rows, $i + 1)];
            }
        }
    }
    throw new RuntimeException("Não encontrei a coluna $required na primeira aba da planilha.");
}

function col(array $h, string ...$prefixes): ?int
{
    foreach ($prefixes as $p) {
        foreach ($h as $i => $x) {
            if ($x !== '' && str_starts_with($x, $p)) {
                return $i;
            }
        }
    }
    return null;
}

function cell(array $row, ?int $i)
{
    return ($i !== null && array_key_exists($i, $row)) ? $row[$i] : null;
}

function split_marked($v): array
{
    $out = [];
    foreach (preg_split('/\s*[-\/;,]\s*/', (string) ($v ?? '')) as $tok) {
        $n = trim(rtrim(norm($tok), '.'));
        $grupo = (bool) preg_match(GRUPO_RX, $n);
        $n = trim((string) preg_replace(GRUPO_RX, ' ', $n));
        if (strlen($n) >= 2) {
            $out[] = [PROF_ALIAS[$n] ?? $n, $grupo];
        }
    }
    return $out;
}

function split_names($v): array
{
    return array_map(fn($x) => $x[0], split_marked($v));
}

// ------------------------------------------------------------------ get-or-create
function esp_id($header): int
{
    $n = norm($header);
    [$nome, $abrev] = ESPECIALIDADES[$n] ?? [title($n), mb_substr(title($n), 0, 6)];
    $id = one('SELECT id FROM especialidades WHERE nome = ?', [$nome]);
    if ($id) {
        return (int) $id;
    }
    q('INSERT INTO especialidades(nome, abrev) VALUES (?, ?)', [$nome, $abrev]);
    return (int) db()->lastInsertId();
}

function conv_id($v): ?int
{
    $n = norm($v);
    if ($n === '') {
        return null;
    }
    $nome = CONV_ALIAS[$n] ?? mb_strtoupper(trim((string) $v), 'UTF-8');
    $id = one('SELECT id FROM convenios WHERE nome = ?', [$nome]);
    if ($id) {
        return (int) $id;
    }
    q('INSERT INTO convenios(nome) VALUES (?)', [$nome]);
    return (int) db()->lastInsertId();
}

function pac_id($nome, ?int $convenio = null, ?string $status = null): int
{
    $t = title($nome);
    $id = one('SELECT id FROM pacientes WHERE nome = ?', [$t]);
    if ($id) {
        if ($convenio) {
            q('UPDATE pacientes SET convenio_id = ? WHERE id = ?', [$convenio, $id]);
        }
        return (int) $id;
    }
    q('INSERT INTO pacientes(nome, convenio_id, status) VALUES (?, ?, ?)', [$t, $convenio, $status ?? 'ativo']);
    return (int) db()->lastInsertId();
}

/** Funde nomes curtos no único nome completo compatível: GUSTAVO -> GUSTAVO KHALIL. */
function canon_map(array $names): array
{
    $names = array_values(array_unique($names));
    usort($names, fn($a, $b) => strlen($b) <=> strlen($a));
    $canon = [];
    foreach ($names as $n) {
        $longer = [];
        foreach ($names as $m) {
            if (str_starts_with($m, $n . ' ')) {
                $longer[$canon[$m] ?? $m] = true;
            }
        }
        $canon[$n] = count($longer) === 1 ? array_key_first($longer) : $n;
    }
    return $canon;
}

function prof_index(int $eid): array
{
    $idx = [];
    foreach (rows('SELECT id, nome FROM profissionais WHERE especialidade_id = ?', [$eid]) as $r) {
        $idx[norm($r['nome'])] = (int) $r['id'];
    }
    return $idx;
}

function prof_id(int $eid, $raw, ?array $canon = null): int
{
    $raw = PROF_ALIAS[norm($raw)] ?? norm($raw);
    $idx = prof_index($eid);
    $canon ??= canon_map(array_merge(array_map('strval', array_keys($idx)), [$raw]));
    $name = $canon[$raw] ?? $raw;
    if (isset($idx[$name])) {
        return $idx[$name];
    }
    q('INSERT INTO profissionais(nome, especialidade_id) VALUES (?, ?)', [title($name), $eid]);
    return (int) db()->lastInsertId();
}

function find_prof_any($nome, $especialidade = null): int
{
    if ($especialidade !== null && trim((string) $especialidade) !== '') {
        return prof_id(esp_id($especialidade), $nome);
    }
    $n = PROF_ALIAS[norm($nome)] ?? norm($nome);
    $ok = array_values(array_filter(rows('SELECT id, nome FROM profissionais'),
        fn($r) => norm($r['nome']) === $n || str_starts_with(norm($r['nome']), $n . ' ')));
    if (count($ok) === 1) {
        return (int) $ok[0]['id'];
    }
    throw new RuntimeException("Profissional '$nome' sem especialidade e ambíguo/não cadastrado — preencha a coluna ESPECIALIDADE.");
}

// ------------------------------------------------------------------ importadores
function importar_saidas(string $bytes, ?int $ano = null): array
{
    [$head, $h, $rows] = read_sheet($bytes);
    $iPac = col($h, 'PACIENTE');
    $iConv = col($h, 'CONVENIO');
    $iMes = col($h, 'DATA', 'MES');
    $iObs = col($h, 'OBSERVA', 'MOTIVO');
    $iCat = null;
    foreach ($h as $i => $x) {
        if (str_contains($x, 'CATEGORIA')) {
            $iCat = $i;
            break;
        }
    }
    $espCols = [];
    foreach ($h as $i => $x) {
        if ($x !== '' && !in_array($i, [$iPac, $iConv, $iMes, $iObs, $iCat], true)) {
            $espCols[$i] = $head[$i];
        }
    }
    $hoje = new DateTimeImmutable('today');
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $eids = [];
        foreach ($espCols as $i => $nome) {
            $eids[$i] = esp_id($nome);
        }
        $tokens = [];
        foreach (array_unique($eids) as $eid) {
            $tokens[$eid] = array_map('strval', array_keys(prof_index($eid)));
        }
        foreach ($rows as $r) {
            if (trim((string) (cell($r, $iPac) ?? '')) === '') {
                continue;
            }
            foreach ($espCols as $i => $_) {
                array_push($tokens[$eids[$i]], ...split_names(cell($r, $i)));
            }
        }
        $canons = [];
        foreach ($tokens as $eid => $t) {
            $canons[$eid] = canon_map($t);
        }
        // guarda marcações de grupo feitas no painel para reaplicar após reimportar
        $marcas = [];
        foreach (rows("SELECT pa.nome pac, s.data_saida, sp.profissional_id, sp.modalidade, sp.grupo_id FROM saida_profissionais sp
                       JOIN saidas s ON s.id = sp.saida_id JOIN pacientes pa ON pa.id = s.paciente_id
                       WHERE s.origem = 'planilha' AND (sp.modalidade IS NOT NULL OR sp.grupo_id IS NOT NULL)") as $m) {
            $marcas[$m['pac'] . '|' . $m['data_saida'] . '|' . $m['profissional_id']] = [$m['modalidade'], $m['grupo_id']];
        }
        $validas = count(array_filter($rows, fn($r) => trim((string) (cell($r, $iPac) ?? '')) !== ''));
        if ($validas === 0) {
            throw new RuntimeException('A planilha não tem nenhum paciente. Nada foi alterado.');
        }
        q("DELETE FROM saidas WHERE origem = 'planilha'");
        q("DELETE FROM vinculos WHERE origem = 'saidas'");
        $n = 0;
        $avisos = [];
        foreach ($rows as $r) {
            $nome = trim((string) (cell($r, $iPac) ?? ''));
            if ($nome === '') {
                continue;
            }
            $mesV = cell($r, $iMes);
            $data = (is_int($mesV) || is_float($mesV) || str_contains((string) $mesV, '/')) ? parse_date($mesV) : null;
            if (!$data) {
                $m = norm($mesV);
                $mi = array_search($m, MESES, true);
                if ($mi === false) {
                    $avisos[] = "$nome: mês '$mesV' não reconhecido — linha ignorada";
                    continue;
                }
                $mi++;
                $y = $ano ?? ($mi <= (int) $hoje->format('n') ? (int) $hoje->format('Y') : (int) $hoje->format('Y') - 1);
                $data = sprintf('%04d-%02d-01', $y, $mi);
            }
            $cid = conv_id(cell($r, $iConv));
            $pid = pac_id($nome, $cid, 'inativo');
            $obs = trim((string) preg_replace('/\s+/', ' ', (string) (cell($r, $iObs) ?? '')));
            $cat = $iCat !== null ? trim((string) (cell($r, $iCat) ?? '')) : '';
            q("INSERT INTO saidas(paciente_id, convenio_id, data_saida, motivo_texto, motivo_categoria, origem) VALUES (?,?,?,?,?, 'planilha')",
                [$pid, $cid, $data, $obs, $cat !== '' ? $cat : categorizar($obs)]);
            $sid = (int) $pdo->lastInsertId();
            foreach ($espCols as $i => $_) {
                $eid = $eids[$i];
                foreach (split_marked(cell($r, $i)) as [$raw, $grupo]) {
                    $prid = prof_id($eid, $raw, $canons[$eid]);
                    [$mod, $gid] = $marcas[title($nome) . '|' . $data . '|' . $prid] ?? [null, null];
                    if ($grupo) {
                        $mod = 'grupo';
                    }
                    q('INSERT OR IGNORE INTO saida_profissionais(saida_id, profissional_id, modalidade, grupo_id) VALUES (?,?,?,?)', [$sid, $prid, $mod, $gid]);
                    q("INSERT OR IGNORE INTO vinculos(paciente_id, profissional_id, data_fim, origem, modalidade, grupo_id) VALUES (?,?,?, 'saidas',?,?)",
                        [$pid, $prid, $data, $mod, $gid]);
                }
            }
            $n++;
        }
        // paciente segue ativo se aparecer na lista de ativos
        q("UPDATE pacientes SET status = 'inativo' WHERE id IN (SELECT paciente_id FROM saidas)
             AND id NOT IN (SELECT paciente_id FROM vinculos WHERE origem='ativos' AND data_fim IS NULL)");
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return ['importados' => $n, 'avisos' => $avisos];
}

/** Lista atual de pacientes ativos: PACIENTE, CONVÊNIO, DATA INÍCIO + uma coluna por especialidade. */
function importar_ativos(string $bytes): array
{
    [$head, $h, $rows] = read_sheet($bytes);
    $iPac = col($h, 'PACIENTE');
    $iConv = col($h, 'CONVENIO');
    $iIni = col($h, 'DATA', 'INICIO');
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $eids = [];
        foreach ($h as $i => $x) {
            if ($x !== '' && !in_array($i, [$iPac, $iConv, $iIni], true)) {
                $eids[$i] = esp_id($head[$i]);
            }
        }
        if (!array_filter($rows, fn($r) => trim((string) (cell($r, $iPac) ?? '')) !== '')) {
            throw new RuntimeException('A planilha não tem nenhum paciente. Nada foi alterado.');
        }
        q("DELETE FROM vinculos WHERE origem = 'ativos'");
        q("UPDATE pacientes SET status = 'inativo' WHERE status = 'ativo'");
        $n = 0;
        foreach ($rows as $r) {
            $nome = trim((string) (cell($r, $iPac) ?? ''));
            if ($nome === '') {
                continue;
            }
            $pid = pac_id($nome, conv_id(cell($r, $iConv)));
            $ini = parse_date(cell($r, $iIni));
            q("UPDATE pacientes SET status='ativo', data_inicio = COALESCE(?, data_inicio) WHERE id = ?", [$ini, $pid]);
            foreach ($eids as $i => $eid) {
                foreach (split_marked(cell($r, $i)) as [$raw, $grupo]) {
                    q("INSERT OR IGNORE INTO vinculos(paciente_id, profissional_id, data_inicio, origem, modalidade) VALUES (?,?,?, 'ativos',?)",
                        [$pid, prof_id($eid, $raw), $ini, $grupo ? 'grupo' : null]);
                }
            }
            $n++;
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return ['importados' => $n, 'avisos' => []];
}

function importar_profissionais(string $bytes): array
{
    [$head, $h, $rows] = read_sheet($bytes, 'NOME');
    $c = [];
    foreach (['nome' => ['NOME'], 'esp' => ['ESPECIALIDADE'], 'form' => ['FORMACAO'], 'pos' => ['POS'], 'reg' => ['REGISTRO', 'CONSELHO'],
              'adm' => ['ADMISSAO', 'DATA'], 'carga' => ['CARGA'], 'meta' => ['META'], 'ativo' => ['ATIVO'], 'mod' => ['MODALIDADE', 'ATENDE'],
              'comp' => ['COMPETENCIA', 'HABILIDADE'], 'foto' => ['FOTO'], 'obs' => ['OBSERVA']] as $k => $p) {
        $c[$k] = col($h, ...$p);
    }
    $n = 0;
    $avisos = [];
    $pdo = db();
    $pdo->beginTransaction();
    try {
        foreach ($rows as $r) {
            $nome = trim((string) (cell($r, $c['nome']) ?? ''));
            $esp = trim((string) (cell($r, $c['esp']) ?? ''));
            if ($nome === '') {
                continue;
            }
            if ($esp === '') {
                $avisos[] = "$nome: sem especialidade — ignorado";
                continue;
            }
            $pid = prof_id(esp_id($esp), $nome);
            $val = function ($k) use ($r, $c) {
                $v = cell($r, $c[$k]);
                return ($v === null || $v === '') ? null : trim((string) $v);
            };
            $num = function ($k) use ($r, $c) {
                $v = cell($r, $c[$k]);
                return (is_int($v) || is_float($v)) ? $v : null;
            };
            $ativo = norm($val('ativo') ?? 'S');
            q('UPDATE profissionais SET nome=?, formacao=COALESCE(?,formacao), pos_graduacao=COALESCE(?,pos_graduacao),
                 registro_conselho=COALESCE(?,registro_conselho), data_admissao=COALESCE(?,data_admissao),
                 carga_horaria_semanal=COALESCE(?,carga_horaria_semanal), meta_pacientes=COALESCE(?,meta_pacientes),
                 foto_url=COALESCE(?,foto_url), observacoes=COALESCE(?,observacoes), ativo=? WHERE id=?',
                [title($nome), $val('form'), $val('pos'), $val('reg'), parse_date(cell($r, $c['adm'])), $num('carga'),
                 $num('meta'), $val('foto'), $val('obs'), str_starts_with($ativo, 'N') ? 0 : 1, $pid]);
            $mod = norm($val('mod') ?? '');
            if ($mod !== '') {
                q('UPDATE profissionais SET modalidade=? WHERE id=?',
                    [str_starts_with($mod, 'G') ? 'grupo' : (str_starts_with($mod, 'M') ? 'misto' : 'individual'), $pid]);
            }
            foreach (preg_split('/\s*;\s*/', $val('comp') ?? '') as $item) {
                if ($item === '') {
                    continue;
                }
                if (preg_match('/^(.+?)\s*[:=]\s*([1-5])\s*$/', $item, $m)) {
                    [$nc, $nivel] = [$m[1], (int) $m[2]];
                } else {
                    [$nc, $nivel] = [$item, null];
                }
                q('INSERT INTO competencias(profissional_id, competencia, nivel) VALUES (?,?,?)
                   ON CONFLICT(profissional_id, competencia) DO UPDATE SET nivel = excluded.nivel', [$pid, trim($nc), $nivel]);
            }
            $n++;
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return ['importados' => $n, 'avisos' => $avisos];
}

function importar_atendimentos(string $bytes): array
{
    [$head, $h, $rows] = read_sheet($bytes, 'DATA');
    [$iD, $iPac, $iProf, $iEsp, $iSt, $iVal] = [col($h, 'DATA'), col($h, 'PACIENTE'), col($h, 'PROFISSIONAL'), col($h, 'ESPECIALIDADE'), col($h, 'STATUS', 'PRESENCA'), col($h, 'VALOR')];
    $n = 0;
    $avisos = [];
    $pdo = db();
    $pdo->beginTransaction();
    try {
        foreach ($rows as $k => $r) {
            $linha = $k + 2;
            $d = parse_date(cell($r, $iD));
            $pac = trim((string) (cell($r, $iPac) ?? ''));
            $prof = trim((string) (cell($r, $iProf) ?? ''));
            if (!$d || $pac === '' || $prof === '') {
                continue;
            }
            $st = STATUS_ATEND[norm(cell($r, $iSt))] ?? null;
            if (!$st) {
                $avisos[] = "linha $linha: status '" . cell($r, $iSt) . "' não reconhecido";
                continue;
            }
            try {
                $prid = find_prof_any($prof, cell($r, $iEsp));
            } catch (RuntimeException $e) {
                $avisos[] = "linha $linha: " . $e->getMessage();
                continue;
            }
            $v = cell($r, $iVal);
            q('INSERT OR REPLACE INTO atendimentos(data, paciente_id, profissional_id, status, valor) VALUES (?,?,?,?,?)',
                [$d, pac_id($pac), $prid, $st, (is_int($v) || is_float($v)) ? (float) $v : null]);
            $n++;
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return ['importados' => $n, 'avisos' => array_slice($avisos, 0, 50)];
}

function importar_avaliacoes(string $bytes): array
{
    [$head, $h, $rows] = read_sheet($bytes, 'DATA');
    [$iD, $iPac, $iProf, $iEsp, $iNota, $iCom] = [col($h, 'DATA'), col($h, 'PACIENTE'), col($h, 'PROFISSIONAL'), col($h, 'ESPECIALIDADE'), col($h, 'NOTA'), col($h, 'COMENTARIO', 'OBSERVA')];
    $n = 0;
    $avisos = [];
    $pdo = db();
    $pdo->beginTransaction();
    try {
        foreach ($rows as $k => $r) {
            $linha = $k + 2;
            $d = parse_date(cell($r, $iD));
            $nota = cell($r, $iNota);
            if (!$d || !(is_int($nota) || is_float($nota)) || $nota < 0 || $nota > 10) {
                if (array_filter($r, fn($x) => $x !== null && $x !== '')) {
                    $avisos[] = "linha $linha: data ou nota (0–10) inválida";
                }
                continue;
            }
            $pac = trim((string) (cell($r, $iPac) ?? ''));
            $prof = trim((string) (cell($r, $iProf) ?? ''));
            try {
                $prid = $prof !== '' ? find_prof_any($prof, cell($r, $iEsp)) : null;
            } catch (RuntimeException $e) {
                $avisos[] = "linha $linha: " . $e->getMessage();
                continue;
            }
            $pid = $pac !== '' ? pac_id($pac) : null;
            $com = trim((string) (cell($r, $iCom) ?? '')) ?: null;
            $dup = one('SELECT 1 FROM avaliacoes WHERE data=? AND IFNULL(paciente_id,0)=IFNULL(?,0) AND IFNULL(profissional_id,0)=IFNULL(?,0) AND nota=?',
                [$d, $pid, $prid, (int) $nota]);
            if (!$dup) {
                q('INSERT INTO avaliacoes(data, paciente_id, profissional_id, nota, comentario) VALUES (?,?,?,?,?)', [$d, $pid, $prid, (int) $nota, $com]);
                $n++;
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return ['importados' => $n, 'avisos' => array_slice($avisos, 0, 50)];
}

const IMPORTADORES = ['saidas' => 'importar_saidas', 'ativos' => 'importar_ativos', 'profissionais' => 'importar_profissionais',
                      'atendimentos' => 'importar_atendimentos', 'avaliacoes' => 'importar_avaliacoes', 'hipo' => 'importar_hipo', 'hipo_sessoes' => 'importar_hipo_sessoes'];

// ------------------------------------------------------------------ escrita de xlsx (planilhas-modelo)
function xml_esc($s): string
{
    return htmlspecialchars((string) $s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

function col_letter(int $i): string
{
    $s = '';
    for ($i++; $i > 0; $i = intdiv($i - 1, 26)) {
        $s = chr(65 + ($i - 1) % 26) . $s;
    }
    return $s;
}

function sheet_xml(array $rows, array $widths, bool $header): string
{
    $x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    if ($header) {
        $x .= '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
    }
    $x .= '<cols>';
    foreach ($widths as $i => $w) {
        $x .= '<col min="' . ($i + 1) . '" max="' . ($i + 1) . '" width="' . $w . '" customWidth="1"/>';
    }
    $x .= '</cols><sheetData>';
    foreach ($rows as $ri => $r) {
        $x .= '<row r="' . ($ri + 1) . '">';
        foreach (array_values($r) as $ci => $v) {
            if ($v === null || $v === '') {
                continue;
            }
            $ref = col_letter($ci) . ($ri + 1);
            $st = ($header && $ri === 0) ? ' s="1"' : '';
            $x .= (is_int($v) || is_float($v)) ? "<c r=\"$ref\"$st><v>$v</v></c>"
                : "<c r=\"$ref\" t=\"inlineStr\"$st><is><t xml:space=\"preserve\">" . xml_esc($v) . '</t></is></c>';
        }
        $x .= '</row>';
    }
    return $x . '</sheetData></worksheet>';
}

function build_xlsx(array $headers, array $rows, array $instrucoes): string
{
    $widths = array_map(fn($h) => max(14, mb_strlen($h) + 4), $headers);
    $sheets = [['Dados', sheet_xml(array_merge([$headers], $rows), $widths, true)]];
    if ($instrucoes) {
        $sheets[] = ['Instruções', sheet_xml(array_map(fn($l) => [$l], $instrucoes), [110], false)];
    }
    $ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
        . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
    $wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
    $rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    foreach ($sheets as $i => [$nome]) {
        $n = $i + 1;
        $ct .= "<Override PartName=\"/xl/worksheets/sheet$n.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>";
        $wb .= '<sheet name="' . xml_esc($nome) . "\" sheetId=\"$n\" r:id=\"rId$n\"/>";
        $rels .= "<Relationship Id=\"rId$n\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet$n.xml\"/>";
    }
    $ns = count($sheets) + 1;
    $rels .= "<Relationship Id=\"rId$ns\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>";
    $styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        . '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>'
        . '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F9AA8"/></patternFill></fill></fills>'
        . '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>'
        . '<cellXfs count="2"><xf xfId="0"/><xf xfId="0" fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    $tmp = tempnam(sys_get_temp_dir(), 'mdl');
    $zip = new ZipArchive();
    $zip->open($tmp, ZipArchive::OVERWRITE);
    $zip->addFromString('[Content_Types].xml', $ct . '</Types>');
    $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    $zip->addFromString('xl/workbook.xml', $wb . '</sheets></workbook>');
    $zip->addFromString('xl/_rels/workbook.xml.rels', $rels);
    $zip->addFromString('xl/styles.xml', $styles);
    foreach ($sheets as $i => [, $xml]) {
        $zip->addFromString('xl/worksheets/sheet' . ($i + 1) . '.xml', $xml);
    }
    $zip->close();
    $data = (string) file_get_contents($tmp);
    @unlink($tmp);
    return $data;
}

function modelo(string $tipo): string
{
    $esps = array_map(fn($r) => mb_strtoupper($r['nome'], 'UTF-8'), rows('SELECT nome FROM especialidades ORDER BY id'));
    if (!$esps) {
        $esps = array_values(array_unique(array_map(fn($v) => mb_strtoupper($v[0], 'UTF-8'), ESPECIALIDADES)));
    }
    $grupoDica = 'Paciente atendido em GRUPO por aquele profissional: escreva (G) depois do nome. Ex.: IURY (G) - ADRIANA.';
    switch ($tipo) {
        case 'profissionais':
            $rows = array_map(fn($r) => [$r['nome'], $r['esp'], $r['formacao'], $r['pos_graduacao'], $r['registro_conselho'], $r['data_admissao'],
                $r['carga_horaria_semanal'], $r['meta_pacientes'], mb_strtoupper($r['modalidade'] ?: 'individual'), $r['ativo'] ? 'S' : 'N', $r['comp'], $r['foto_url']],
                rows("SELECT p.*, e.nome esp, (SELECT group_concat(competencia || IFNULL(':'||nivel,''), '; ') FROM competencias c WHERE c.profissional_id=p.id) comp
                      FROM profissionais p JOIN especialidades e ON e.id=p.especialidade_id ORDER BY e.nome, p.nome"));
            return build_xlsx(['NOME', 'ESPECIALIDADE', 'FORMAÇÃO', 'PÓS-GRADUAÇÃO', 'REGISTRO CONSELHO', 'DATA ADMISSÃO', 'CARGA HORÁRIA SEMANAL',
                'META DE PACIENTES', 'MODALIDADE', 'ATIVO (S/N)', 'COMPETÊNCIAS', 'FOTO (URL)'], $rows, [
                'Já vem preenchida com os profissionais do banco. Complete as colunas e importe na aba Importar.',
                'COMPETÊNCIAS: separe por ponto e vírgula e, se quiser, informe o nível de 1 a 5. Ex.: ABA:4; Denver:3; Integração sensorial:5',
                'MODALIDADE: INDIVIDUAL, GRUPO (só atende grupos) ou MISTO (atende os dois; marque os pacientes de grupo com (G) nas planilhas).',
                'META DE PACIENTES: quantos pacientes ativos o profissional deveria ter na carteira.',
                'Datas no formato DD/MM/AAAA.']);
        case 'ativos':
            return build_xlsx(array_merge(['PACIENTE', 'CONVÊNIO', 'DATA INÍCIO'], $esps), [], [
                'Lista ATUAL de pacientes ativos. Cada importação substitui a anterior (quem não estiver na lista fica inativo).',
                "Nas colunas de especialidade, coloque o(s) profissional(is) que atende(m) o paciente, separados por ' - ' ou '/', como na planilha de saídas.",
                $grupoDica,
                'DATA INÍCIO: data de entrada do paciente na clínica (DD/MM/AAAA). Usada em pacientes ativos há mais tempo e na permanência.']);
        case 'atendimentos':
            return build_xlsx(['DATA', 'PACIENTE', 'PROFISSIONAL', 'ESPECIALIDADE', 'STATUS', 'VALOR'], [], [
                'Uma linha por sessão agendada. Pode ser a exportação da agenda.',
                'STATUS aceitos: REALIZADO, FALTA, FALTA JUSTIFICADA, CANCELADO CLINICA, CANCELADO PACIENTE (ou P / F / FJ).',
                'VALOR: opcional. Se vazio, usa o valor por sessão cadastrado no convênio do paciente (aba Cadastros).',
                'Reimportar a mesma data + paciente + profissional atualiza o registro, não duplica.']);
        case 'avaliacoes':
            return build_xlsx(['DATA', 'PACIENTE', 'PROFISSIONAL', 'ESPECIALIDADE', 'NOTA (0-10)', 'COMENTÁRIO'], [], [
                "Pesquisa de satisfação: 'De 0 a 10, quanto você recomendaria o atendimento?'",
                'PROFISSIONAL é opcional; sem ele a nota conta só para a clínica. Notas 9–10 = promotores, 0–6 = detratores (NPS).']);
        case 'saidas':
            return build_xlsx(array_merge(['PACIENTES', 'CONVÊNIO', 'MÊS'], $esps, ['OBSERVAÇÕES']), [], [
                'Mesmo formato da planilha original. MÊS pode ser o nome do mês (ano atual) ou uma data DD/MM/AAAA.',
                'Opcional: uma coluna CATEGORIA para definir a categoria do motivo manualmente.',
                $grupoDica,
                'Cada importação substitui as saídas importadas anteriormente.']);
    }
    throw new InvalidArgumentException('modelo desconhecido');
}
