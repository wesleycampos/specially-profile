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
