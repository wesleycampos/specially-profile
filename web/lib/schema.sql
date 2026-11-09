-- Gestão do Corpo Clínico — esquema SQLite (v1)
-- Datas sempre em texto ISO: AAAA-MM-DD
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS especialidades (
  id      INTEGER PRIMARY KEY,
  nome    TEXT NOT NULL UNIQUE,
  abrev   TEXT
);

CREATE TABLE IF NOT EXISTS convenios (
  id            INTEGER PRIMARY KEY,
  nome          TEXT NOT NULL UNIQUE,
  valor_sessao  REAL            -- valor médio pago por sessão (usado na rentabilidade quando o atendimento não traz valor)
);

CREATE TABLE IF NOT EXISTS profissionais (
  id                     INTEGER PRIMARY KEY,
  nome                   TEXT NOT NULL,
  especialidade_id       INTEGER NOT NULL REFERENCES especialidades(id),
  formacao               TEXT,   -- graduação / instituição
  pos_graduacao          TEXT,   -- especializações, mestrado...
  registro_conselho      TEXT,   -- CRP, CREFITO, CRFa...
  data_admissao          TEXT,
  carga_horaria_semanal  REAL,
  meta_pacientes         INTEGER, -- capacidade/meta de carteira ativa
  modalidade             TEXT NOT NULL DEFAULT 'individual', -- individual | grupo | misto (como costuma atender)
  foto_url               TEXT,
  ativo                  INTEGER NOT NULL DEFAULT 1,
  observacoes            TEXT,
  hipo_id                INTEGER, -- id do usuário no Hipo Saúde (importação única do cadastro)
  nome_completo          TEXT,
  unidade                TEXT,   -- unidade principal no Hipo (Matriz / Vila)
  contratacao            TEXT,   -- CLT | PJ | Temporário
  capacidade_semanal     INTEGER, -- horários de atendimento por semana (sobrepõe o cálculo pela carga horária)
  UNIQUE (nome, especialidade_id)
);

-- Grupos terapêuticos conduzidos por um profissional
CREATE TABLE IF NOT EXISTS grupos (
  id               INTEGER PRIMARY KEY,
  nome             TEXT NOT NULL,
  profissional_id  INTEGER NOT NULL REFERENCES profissionais(id) ON DELETE CASCADE,
  dia_horario      TEXT,
  capacidade       INTEGER,
  ativo            INTEGER NOT NULL DEFAULT 1
);

-- Habilidades, abordagens, certificações e competências avaliadas (nível 1–5)
CREATE TABLE IF NOT EXISTS competencias (
  id               INTEGER PRIMARY KEY,
  profissional_id  INTEGER NOT NULL REFERENCES profissionais(id) ON DELETE CASCADE,
  competencia      TEXT NOT NULL,
  tipo             TEXT NOT NULL DEFAULT 'habilidade', -- habilidade | abordagem | certificacao | comportamental
  nivel            INTEGER CHECK (nivel BETWEEN 1 AND 5),
  UNIQUE (profissional_id, competencia)
);

CREATE TABLE IF NOT EXISTS pacientes (
  id           INTEGER PRIMARY KEY,
  nome         TEXT NOT NULL UNIQUE,
  convenio_id  INTEGER REFERENCES convenios(id),
  data_inicio  TEXT,            -- entrada na clínica
  status       TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  observacoes  TEXT
);

-- Carteira: qual profissional atende qual paciente, e desde quando
CREATE TABLE IF NOT EXISTS vinculos (
  id               INTEGER PRIMARY KEY,
  paciente_id      INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  profissional_id  INTEGER NOT NULL REFERENCES profissionais(id) ON DELETE CASCADE,
  data_inicio      TEXT,
  data_fim         TEXT,          -- NULL = vínculo ativo
  origem           TEXT,
  modalidade       TEXT,          -- individual | grupo | NULL = herda do cadastro do profissional
  grupo_id         INTEGER REFERENCES grupos(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_vinculo ON vinculos(paciente_id, profissional_id, IFNULL(data_fim,''));

CREATE TABLE IF NOT EXISTS saidas (
  id                INTEGER PRIMARY KEY,
  paciente_id       INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  convenio_id       INTEGER REFERENCES convenios(id),
  data_saida        TEXT NOT NULL,
  motivo_texto      TEXT,
  motivo_categoria  TEXT NOT NULL,
  origem            TEXT
);

CREATE TABLE IF NOT EXISTS saida_profissionais (
  saida_id         INTEGER NOT NULL REFERENCES saidas(id) ON DELETE CASCADE,
  profissional_id  INTEGER NOT NULL REFERENCES profissionais(id) ON DELETE CASCADE,
  modalidade       TEXT,          -- individual | grupo | NULL = herda do cadastro do profissional
  grupo_id         INTEGER REFERENCES grupos(id) ON DELETE SET NULL,
  PRIMARY KEY (saida_id, profissional_id)
);

CREATE TABLE IF NOT EXISTS atendimentos (
  id               INTEGER PRIMARY KEY,
  data             TEXT NOT NULL,
  paciente_id      INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  profissional_id  INTEGER NOT NULL REFERENCES profissionais(id) ON DELETE CASCADE,
  status           TEXT NOT NULL CHECK (status IN ('realizado','falta','falta_justificada','cancelado_clinica','cancelado_paciente')),
  valor            REAL,
  origem           TEXT,          -- hipo | manual | NULL (planilha)
  UNIQUE (data, paciente_id, profissional_id)
);

-- Satisfação do paciente/família (nota 0–10, estilo NPS)
CREATE TABLE IF NOT EXISTS avaliacoes (
  id               INTEGER PRIMARY KEY,
  data             TEXT NOT NULL,
  paciente_id      INTEGER REFERENCES pacientes(id) ON DELETE SET NULL,
  profissional_id  INTEGER REFERENCES profissionais(id) ON DELETE SET NULL,
  nota             INTEGER NOT NULL CHECK (nota BETWEEN 0 AND 10),
  comentario       TEXT
);

-- Agenda semanal das unidades: cada importação da planilha de agenda gera uma versão
CREATE TABLE IF NOT EXISTS agenda_versoes (
  id            INTEGER PRIMARY KEY,
  unidade       TEXT NOT NULL,          -- VILA, FELICITTÁ...
  data_ref      TEXT NOT NULL,          -- data a que a agenda se refere (AAAA-MM-DD)
  importado_em  TEXT NOT NULL DEFAULT (datetime('now')),
  arquivo       TEXT,
  UNIQUE (unidade, data_ref)
);

-- Um horário (dia × período × hora) de uma coluna (sala/profissional) da agenda
CREATE TABLE IF NOT EXISTS agenda_slots (
  id               INTEGER PRIMARY KEY,
  versao_id        INTEGER NOT NULL REFERENCES agenda_versoes(id) ON DELETE CASCADE,
  dia              INTEGER NOT NULL,     -- 1 = segunda ... 6 = sábado
  periodo          TEXT NOT NULL,        -- manha | tarde | noite
  hora             TEXT NOT NULL,        -- HH:MM
  profissional_id  INTEGER NOT NULL REFERENCES profissionais(id) ON DELETE CASCADE,
  sala             TEXT,
  aplicadores      TEXT,
  situacao         TEXT NOT NULL,        -- ocupado | vago | fechado
  modalidade       TEXT NOT NULL,        -- individual | grupo
  vagas_grupo      INTEGER NOT NULL DEFAULT 0,
  obs              TEXT
);

-- Paciente em um horário da agenda, com as marcações da célula
CREATE TABLE IF NOT EXISTS agenda_pacientes (
  id           INTEGER PRIMARY KEY,
  slot_id      INTEGER NOT NULL REFERENCES agenda_slots(id) ON DELETE CASCADE,
  paciente_id  INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  texto        TEXT,                    -- como estava escrito na planilha
  novo         INTEGER NOT NULL DEFAULT 0,   -- PACIENTE DE ENTRADA
  retorno      INTEGER NOT NULL DEFAULT 0,
  saida        INTEGER NOT NULL DEFAULT 0,   -- DE SAÍDA / VAI SAIR
  ajuste       INTEGER NOT NULL DEFAULT 0,   -- AJUSTE / ALTERAÇÃO / REMANEJAMENTO
  sem_aut      INTEGER NOT NULL DEFAULT 0,   -- sem autorização do convênio
  congelado    INTEGER NOT NULL DEFAULT 0,
  data_marca   TEXT,                    -- data citada na marcação ("A PARTIR DE 01/11", "DE SAÍDA 01/12")
  obs          TEXT
);
CREATE INDEX IF NOT EXISTS ix_agslot_versao ON agenda_slots(versao_id, profissional_id);
CREATE INDEX IF NOT EXISTS ix_agpac_slot ON agenda_pacientes(slot_id);

CREATE INDEX IF NOT EXISTS ix_saidas_data ON saidas(data_saida);
CREATE INDEX IF NOT EXISTS ix_atend_prof ON atendimentos(profissional_id, data);
CREATE INDEX IF NOT EXISTS ix_aval_prof ON avaliacoes(profissional_id, data);

-- Acesso ao painel publicado (usuários criados com: php adm.php usuario <login>)
CREATE TABLE IF NOT EXISTS users (
  username   TEXT PRIMARY KEY,
  pass_hash  TEXT NOT NULL,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT NOT NULL, ts INTEGER NOT NULL);

-- Configurações e referências gerais (valor em JSON)
-- Tabela de remuneração do terapeuta: cada linha vale a partir de "desde" (reajuste = linha nova)
CREATE TABLE IF NOT EXISTS remuneracao (
  id               INTEGER PRIMARY KEY,
  profissional_id  INTEGER NOT NULL REFERENCES profissionais(id) ON DELETE CASCADE,
  desde            TEXT NOT NULL,      -- início da vigência (AAAA-MM-DD)
  tipo             TEXT NOT NULL CHECK (tipo IN ('fixo','hora','sessao','percentual')),
  valor            REAL NOT NULL,      -- R$ por mês / por hora / por sessão, ou % do recebido
  obs              TEXT,
  simulado         INTEGER NOT NULL DEFAULT 0,  -- 1 = valor de teste, apagado ao carregar a tabela real
  UNIQUE (profissional_id, desde)
);
-- editar uma linha simulada pela tela de Cadastros a torna real
CREATE TRIGGER IF NOT EXISTS remuneracao_real AFTER UPDATE OF desde, tipo, valor ON remuneracao WHEN OLD.simulado = 1
BEGIN UPDATE remuneracao SET simulado = 0 WHERE id = NEW.id; END;

CREATE TABLE IF NOT EXISTS config (
  chave  TEXT PRIMARY KEY,
  valor  TEXT
);

-- Grade da semana exportada do Hipo Saúde (base da lotação). Substituída a cada importação.
CREATE TABLE IF NOT EXISTS hipo_grade (
  id             INTEGER PRIMARY KEY,   -- id da sessão no Hipo
  data           TEXT,
  dia_semana     INTEGER NOT NULL,      -- 0 = segunda ... 5 = sábado
  hora_inicio    TEXT NOT NULL,
  hora_fim       TEXT,
  hipo_prof      INTEGER NOT NULL,      -- profissionais.hipo_id
  hipo_paciente  INTEGER,
  paciente       TEXT,
  especialidade  TEXT,
  unidade        TEXT,                  -- Matriz | Vila
  tipo           TEXT NOT NULL,         -- consulta | bloqueio
  tipo_agenda    TEXT,
  convenio       TEXT,
  sala           TEXT,
  motivo         TEXT
);
CREATE INDEX IF NOT EXISTS ix_hipo_grade_prof ON hipo_grade(hipo_prof);

-- Histórico da agenda diária do Hipo (todas as sessões, inclusive agendadas e desmarcadas). Base dos atendimentos de origem "hipo".
CREATE TABLE IF NOT EXISTS hipo_sessoes (
  id             INTEGER PRIMARY KEY,   -- id da sessão no Hipo
  data           TEXT NOT NULL,
  hora_inicio    TEXT,
  hora_fim       TEXT,
  hipo_prof      INTEGER NOT NULL,      -- profissionais.hipo_id
  hipo_paciente  INTEGER,
  paciente       TEXT,
  especialidade  TEXT,
  convenio       TEXT,
  sala           TEXT,
  status         TEXT,                  -- Atendida, Faltou, Falta Justificáveis, Desmarcada…, Aguardando, Congelado…
  avaliacao      TEXT,                  -- "Avaliada" = evolução registrada; senão o motivo/observação
  unidade        TEXT,                  -- Matriz | Vila
  procedimento   TEXT,
  codigo         TEXT,
  tipo_guia      TEXT,
  obs            TEXT
);
CREATE INDEX IF NOT EXISTS ix_hipo_sessoes_prof ON hipo_sessoes(hipo_prof, data);
CREATE INDEX IF NOT EXISTS ix_hipo_sessoes_data ON hipo_sessoes(data);
