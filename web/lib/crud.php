<?php
declare(strict_types=1);

// Cadastro genérico (criar / listar / editar / excluir) das tabelas do painel.
// Cada tabela é descrita uma vez aqui; a API e a tela de Cadastros usam a mesma descrição.
// Campo: [chave, rótulo, tipo, obrigatório?]
//   tipos: text | textarea | int | num | date | bool | sel:a|b|c | fk:<tabela> | multi:profissionais (só em saídas)
// Profissionais têm tela própria (foto, competências, grupos) — ver salvar_prof() e unir_profissionais().

const CRUD_STATUS_ATEND = 'realizado|falta|falta_justificada|cancelado_clinica|cancelado_paciente';

function crud_tabelas(): array
{
    $motivos = implode('|', array_unique(array_merge(array_column(MOTIVOS, 0), ['Outros'])));
    return [
        'pacientes' => ['titulo' => 'Pacientes', 'ordem' => 't.nome', 'campos' => [
            ['nome', 'Nome', 'text', true], ['convenio_id', 'Convênio', 'fk:convenios', false], ['data_inicio', 'Início na clínica', 'date', false],
            ['status', 'Situação', 'sel:ativo|inativo', true], ['observacoes', 'Observações', 'textarea', false]]],
        'vinculos' => ['titulo' => 'Carteira (paciente × profissional)', 'ordem' => 'pa.nome', 'campos' => [
            ['paciente_id', 'Paciente', 'fk:pacientes', true], ['profissional_id', 'Profissional', 'fk:profissionais', true],
            ['data_inicio', 'Início', 'date', false], ['data_fim', 'Fim (vazio = ativo)', 'date', false],
            ['modalidade', 'Modalidade', 'sel:|individual|grupo', false], ['grupo_id', 'Grupo', 'fk:grupos', false], ['origem', 'Origem', 'text', false]],
            'aviso' => 'Vínculos de origem "agenda:…", "ativos" ou "saidas" são refeitos quando a planilha correspondente é importada de novo; os de origem "manual" ficam.'],
        'saidas' => ['titulo' => 'Saídas de pacientes', 'ordem' => 't.data_saida DESC', 'campos' => [
            ['paciente_id', 'Paciente', 'fk:pacientes', true], ['data_saida', 'Data da saída', 'date', true], ['convenio_id', 'Convênio', 'fk:convenios', false],
            ['motivo_categoria', 'Categoria do motivo', "sel:$motivos", true], ['motivo_texto', 'Motivo (como foi relatado)', 'textarea', false],
            ['profissionais', 'Profissionais que atendiam', 'multi:profissionais', false], ['origem', 'Origem', 'text', false]],
            'aviso' => 'Saídas de origem "planilha" são substituídas quando a planilha de saídas é importada de novo; as lançadas aqui (origem "manual") ficam.'],
        'atendimentos' => ['titulo' => 'Atendimentos', 'ordem' => 't.data DESC', 'campos' => [
            ['data', 'Data', 'date', true], ['paciente_id', 'Paciente', 'fk:pacientes', true], ['profissional_id', 'Profissional', 'fk:profissionais', true],
            ['status', 'Status', 'sel:' . CRUD_STATUS_ATEND, true], ['valor', 'Valor (R$)', 'num', false]]],
        'avaliacoes' => ['titulo' => 'Avaliações de satisfação', 'ordem' => 't.data DESC', 'campos' => [
            ['data', 'Data', 'date', true], ['paciente_id', 'Paciente', 'fk:pacientes', false], ['profissional_id', 'Profissional', 'fk:profissionais', false],
            ['nota', 'Nota (0 a 10)', 'int', true], ['comentario', 'Comentário', 'textarea', false]]],
        'grupos' => ['titulo' => 'Grupos terapêuticos', 'ordem' => 't.nome', 'campos' => [
            ['nome', 'Nome do grupo', 'text', true], ['profissional_id', 'Profissional responsável', 'fk:profissionais', true],
            ['dia_horario', 'Dia / horário', 'text', false], ['capacidade', 'Vagas', 'int', false], ['ativo', 'Ativo', 'bool', true]]],
        'especialidades' => ['titulo' => 'Áreas / especialidades', 'ordem' => 't.nome', 'campos' => [
            ['nome', 'Nome', 'text', true], ['abrev', 'Abreviação', 'text', false]]],
        'convenios' => ['titulo' => 'Convênios', 'ordem' => 't.nome', 'campos' => [
            ['nome', 'Nome', 'text', true], ['valor_sessao', 'Valor por sessão (R$)', 'num', false]]],
        'remuneracao' => ['titulo' => 'Remuneração dos terapeutas', 'ordem' => 'profissional_id_rotulo, t.desde DESC', 'campos' => [
            ['profissional_id', 'Terapeuta', 'fk:profissionais', true], ['desde', 'Vale a partir de', 'date', true],
            ['tipo', 'Forma de pagamento', 'sel:fixo|hora|sessao|percentual', true], ['valor', 'Valor (R$ mês / hora / sessão, ou %)', 'num', true],
            ['obs', 'Observação', 'text', false]],
            'aviso' => 'Cada linha vale a partir da data informada até a próxima linha do mesmo terapeuta. Para um reajuste, crie uma linha nova: os meses anteriores continuam com o valor antigo. Tipos: fixo = valor mensal; hora = R$ por hora atendida; sessao = R$ por sessão; percentual = % do valor recebido.'],
        'agenda_versoes' => ['titulo' => 'Agendas importadas', 'ordem' => 't.unidade, t.data_ref DESC', 'campos' => [
            ['unidade', 'Unidade', 'text', true], ['data_ref', 'Agenda de', 'date', true], ['arquivo', 'Arquivo', 'text', false]],
            'sem_criar' => true, 'aviso' => 'Excluir uma agenda apaga os horários dela; a mais recente de cada unidade é a carteira ativa.'],
    ];
}

/** Rótulo de cada tabela referenciada (usado nas listas e nos campos de escolha). */
const CRUD_ROTULO = [
    'pacientes' => "(SELECT nome FROM pacientes WHERE id = %s)",
    'convenios' => "(SELECT nome FROM convenios WHERE id = %s)",
    'grupos' => "(SELECT nome FROM grupos WHERE id = %s)",
    'especialidades' => "(SELECT nome FROM especialidades WHERE id = %s)",
    'profissionais' => "(SELECT p.nome || ' · ' || e.nome FROM profissionais p JOIN especialidades e ON e.id = p.especialidade_id WHERE p.id = %s)",
];

function crud_def(string $t): array
{
    $d = crud_tabelas()[$t] ?? null;
    if (!$d) {
        throw new InvalidArgumentException('Cadastro desconhecido.');
    }
    return $d;
}

function crud_schema(): array
{
    $out = [];
    foreach (crud_tabelas() as $t => $d) {
        $out[$t] = ['titulo' => $d['titulo'], 'aviso' => $d['aviso'] ?? null, 'sem_criar' => $d['sem_criar'] ?? false,
                    'campos' => array_map(fn($c) => ['k' => $c[0], 'l' => $c[1], 't' => $c[2], 'req' => $c[3]], $d['campos'])];
    }
    return $out;
}

function crud_opcoes(): array
{
    return [
        'pacientes' => rows("SELECT id, nome label, status FROM pacientes ORDER BY nome"),
        'profissionais' => rows("SELECT p.id, p.nome || ' · ' || e.nome label, p.ativo FROM profissionais p JOIN especialidades e ON e.id = p.especialidade_id ORDER BY p.ativo DESC, p.nome"),
        'convenios' => rows('SELECT id, nome label FROM convenios ORDER BY nome'),
        'grupos' => rows('SELECT id, nome label FROM grupos ORDER BY nome'),
        'especialidades' => rows('SELECT id, nome label FROM especialidades ORDER BY nome'),
    ];
}

function crud_select(string $t, array $d): string
{
    $cols = ['t.*'];
    foreach ($d['campos'] as [$k, , $tipo]) {
        if (str_starts_with($tipo, 'fk:')) {
            $cols[] = sprintf(CRUD_ROTULO[substr($tipo, 3)], "t.$k") . " {$k}_rotulo";
        }
    }
    if ($t === 'saidas') {
        $cols[] = "(SELECT GROUP_CONCAT(p.nome, ', ') FROM saida_profissionais sp JOIN profissionais p ON p.id = sp.profissional_id WHERE sp.saida_id = t.id) profissionais_rotulo";
        $cols[] = "(SELECT GROUP_CONCAT(sp.profissional_id) FROM saida_profissionais sp WHERE sp.saida_id = t.id) profissionais";
    }
    if ($t === 'agenda_versoes') {
        $cols[] = '(SELECT COUNT(*) FROM agenda_slots s WHERE s.versao_id = t.id) horarios';
    }
    $join = in_array($t, ['vinculos'], true) ? ' LEFT JOIN pacientes pa ON pa.id = t.paciente_id' : '';
    return 'SELECT ' . implode(', ', $cols) . " FROM $t t$join";
}

function crud_listar(string $t, array $f): array
{
    $d = crud_def($t);
    $where = [];
    $args = [];
    $busca = norm($f['q'] ?? '');   // sem acento: filtrado no PHP (o SQLite não remove acentos)
    foreach ($d['campos'] as [$k, , $tipo]) {   // filtros exatos: ?f_paciente_id=12
        if (isset($f["f_$k"]) && $f["f_$k"] !== '') {
            $where[] = "t.$k = ?";
            $args[] = $f["f_$k"];
        }
    }
    $sql = crud_select($t, $d) . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . " ORDER BY {$d['ordem']}, t.id DESC";
    $todos = rows($sql, $args);
    if ($busca !== '') {
        $todos = array_values(array_filter($todos, function ($r) use ($busca) {
            return str_contains(norm(implode(' ', array_map(fn($v) => is_scalar($v) ? (string) $v : '', $r))), $busca);
        }));
    }
    $lim = max(1, min(500, (int) ($f['limite'] ?? 100)));
    $pag = max(0, (int) ($f['pagina'] ?? 0));
    return ['total' => count($todos), 'linhas' => array_slice($todos, $pag * $lim, $lim), 'limite' => $lim, 'pagina' => $pag];
}

function crud_ler(string $t, int $id): ?array
{
    $d = crud_def($t);
    $r = q(crud_select($t, $d) . ' WHERE t.id = ?', [$id])->fetch();
    return $r ?: null;
}

function crud_valor(array $campo, $v)
{
    [$k, $rot, $tipo, $req] = $campo;
    if (is_string($v)) {
        $v = trim($v);
    }
    if ($v === '' || $v === null) {
        if ($req && $tipo !== 'bool') {
            throw new InvalidArgumentException("Preencha: $rot.");
        }
        return $tipo === 'bool' ? 0 : null;
    }
    switch (true) {
        case $tipo === 'int':
            if (!is_numeric($v) || (int) $v != $v) {
                throw new InvalidArgumentException("$rot deve ser um número inteiro.");
            }
            if ($k === 'nota' && ($v < 0 || $v > 10)) {
                throw new InvalidArgumentException('A nota vai de 0 a 10.');
            }
            return (int) $v;
        case $tipo === 'num':
            $v = is_string($v) ? str_replace(',', '.', $v) : $v;
            if (!is_numeric($v)) {
                throw new InvalidArgumentException("$rot deve ser um número.");
            }
            return (float) $v;
        case $tipo === 'bool':
            return in_array($v, [true, 1, '1', 'true', 'on', 'sim'], true) ? 1 : 0;
        case $tipo === 'date':
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $v)) {
                throw new InvalidArgumentException("$rot: data inválida.");
            }
            return $v;
        case str_starts_with($tipo, 'sel:'):
            if (!in_array((string) $v, explode('|', substr($tipo, 4)), true)) {
                throw new InvalidArgumentException("$rot: opção inválida.");
            }
            return $v;
        case str_starts_with($tipo, 'fk:'):
            $ref = substr($tipo, 3);
            if (!one("SELECT id FROM $ref WHERE id = ?", [(int) $v])) {
                throw new InvalidArgumentException("$rot: cadastro não encontrado.");
            }
            return (int) $v;
        default:
            return mb_substr((string) $v, 0, $tipo === 'textarea' ? 5000 : 300);
    }
}

function crud_salvar(string $t, ?int $id, array $body): array
{
    $d = crud_def($t);
    if ($id === null && !empty($d['sem_criar'])) {
        throw new InvalidArgumentException('Este cadastro é criado pela importação.');
    }
    $vals = [];
    $multi = null;
    foreach ($d['campos'] as $c) {
        if (str_starts_with($c[2], 'multi:')) {
            if (array_key_exists($c[0], $body)) {
                $multi = array_values(array_unique(array_filter(array_map('intval', (array) $body[$c[0]]))));
            }
            continue;
        }
        if ($id !== null && !array_key_exists($c[0], $body)) {
            continue;   // edição parcial
        }
        $vals[$c[0]] = crud_valor($c, $body[$c[0]] ?? null);
    }
    if ($t === 'pacientes' && isset($vals['nome'])) {
        $vals['nome'] = title($vals['nome']);   // mesmo padrão da importação, que procura o paciente pelo nome
    }
    if ($t === 'saidas' && $id === null) {
        $vals['origem'] ??= 'manual';
    }
    if ($t === 'vinculos' && $id === null) {
        $vals['origem'] ??= 'manual';
    }
    $pdo = db();
    $pdo->beginTransaction();
    try {
        if ($id === null) {
            if (!$vals) {
                throw new InvalidArgumentException('Nada para salvar.');
            }
            q("INSERT INTO $t(" . implode(', ', array_keys($vals)) . ') VALUES (' . implode(', ', array_fill(0, count($vals), '?')) . ')', array_values($vals));
            $id = (int) $pdo->lastInsertId();
        } elseif ($vals) {
            if (!one("SELECT id FROM $t WHERE id = ?", [$id])) {
                throw new InvalidArgumentException('Registro não encontrado.');
            }
            q("UPDATE $t SET " . implode(', ', array_map(fn($k) => "$k = ?", array_keys($vals))) . ' WHERE id = ?', [...array_values($vals), $id]);
        }
        if ($t === 'saidas' && $multi !== null) {
            $in = $multi ? implode(',', array_fill(0, count($multi), '?')) : 'NULL';
            q("DELETE FROM saida_profissionais WHERE saida_id = ? AND profissional_id NOT IN ($in)", [$id, ...$multi]);
            foreach ($multi as $pid) {
                q('INSERT OR IGNORE INTO saida_profissionais(saida_id, profissional_id) VALUES (?, ?)', [$id, $pid]);
            }
        }
        $pdo->commit();
    } catch (PDOException $e) {
        $pdo->rollBack();
        if (str_contains($e->getMessage(), 'UNIQUE')) {
            throw new InvalidArgumentException('Já existe um registro igual (mesmo nome ou mesma data/paciente/profissional).');
        }
        throw $e;
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return crud_ler($t, $id) ?? ['id' => $id];
}

/** O que será apagado junto (para a confirmação na tela). */
function crud_dependencias(string $t, int $id): array
{
    $c = fn(string $sql) => (int) one($sql, [$id]);
    return match ($t) {
        'pacientes' => array_filter(['saídas' => $c('SELECT COUNT(*) FROM saidas WHERE paciente_id = ?'), 'vínculos' => $c('SELECT COUNT(*) FROM vinculos WHERE paciente_id = ?'),
                                     'atendimentos' => $c('SELECT COUNT(*) FROM atendimentos WHERE paciente_id = ?'), 'horários na agenda' => $c('SELECT COUNT(*) FROM agenda_pacientes WHERE paciente_id = ?')]),
        'profissionais' => array_filter(['saídas ligadas' => $c('SELECT COUNT(*) FROM saida_profissionais WHERE profissional_id = ?'), 'vínculos' => $c('SELECT COUNT(*) FROM vinculos WHERE profissional_id = ?'),
                                         'atendimentos' => $c('SELECT COUNT(*) FROM atendimentos WHERE profissional_id = ?'), 'horários na agenda' => $c('SELECT COUNT(*) FROM agenda_slots WHERE profissional_id = ?'),
                                         'grupos' => $c('SELECT COUNT(*) FROM grupos WHERE profissional_id = ?')]),
        'agenda_versoes' => array_filter(['horários' => $c('SELECT COUNT(*) FROM agenda_slots WHERE versao_id = ?')]),
        'grupos' => array_filter(['vínculos em grupo' => $c('SELECT COUNT(*) FROM vinculos WHERE grupo_id = ?')]),
        default => [],
    };
}

function crud_excluir(string $t, int $id): array
{
    if ($t !== 'profissionais') {
        crud_def($t);
    }
    try {
        $n = q("DELETE FROM $t WHERE id = ?", [$id])->rowCount();
    } catch (PDOException $e) {
        if (str_contains($e->getMessage(), 'FOREIGN KEY')) {
            throw new InvalidArgumentException('Não dá para excluir: este cadastro ainda é usado em outros registros. Troque-o nesses registros primeiro.');
        }
        throw $e;
    }
    if (!$n) {
        throw new InvalidArgumentException('Registro não encontrado.');
    }
    return ['ok' => true];
}
