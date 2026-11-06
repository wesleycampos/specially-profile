# Specially Profile

Painel de gestão do corpo clínico. Mostra o desempenho dos profissionais, a perda de pacientes e seus motivos, as áreas, os grupos e a satisfação.

- **No ar:** https://portal.specially.com.br/profile/ (precisa de login; o acesso está em `ACESSO-producao (nao compartilhar).txt`)
- **No computador:** dois cliques em `iniciar.bat`, que abre http://localhost:8765. Localmente não pede login. Precisa do PHP 8.3 instalado: `winget install PHP.PHP.8.3`.

## Estrutura
| Item | Caminho |
|---|---|
| Painel (HTML/CSS/JS) | `web/index.html`, `web/app.js`, `web/style.css` |
| API e login (PHP) | `web/api.php`, `web/index.php`, `web/lib/*.php` |
| Estrutura do banco | `web/lib/schema.sql` |
| Banco local (SQLite) | `db/clinica.db` |
| Planilha de saídas original | `dados/base_saidas.xlsx` |
| Modelos para preencher | `modelos/*.xlsx`, ou baixe pela aba **Importar** |
| Publicação | `deploy/deploy.sh` |
| Versão 1 (só a planilha) | `v1-planilha/` |

## Produção (Hostinger)
- Arquivos públicos: `public_html/portal/profile`. O banco e as fotos ficam fora da pasta pública, em `domains/specially.com.br/profile_data/`.
- **Publicar uma atualização:** `bash deploy/deploy.sh`. O banco do servidor **nunca é sobrescrito**; o `db/clinica.db` local só foi enviado na primeira publicação.
- **Os dados de produção são independentes dos locais.** Importações feitas no site ficam só no site.
- **Usuários:** no servidor, dentro de `public_html/portal/profile`:
  - `php adm.php usuario <login>`: cria o usuário ou gera uma nova senha
  - `php adm.php usuarios`: lista os usuários
  - `php adm.php remover <login>`: remove o usuário
- **Proteções:** login com bloqueio após 5 tentativas erradas e cookie de sessão seguro. As alterações exigem um cabeçalho próprio. O código, o banco, a configuração e o HTML não podem ser acessados direto pela web.

## O que cada importação libera
| Importar | Libera |
|---|---|
| **Saídas** (já importada) | Perdas, motivos, ranking, áreas, convênios |
| **Pacientes ativos** | Carteira, retenção ("quem mais mantém pacientes"), tempo de casa |
| **Cadastro de profissionais** | Formação, registro, admissão, meta, competências, modalidade |
| **Atendimentos** | Faltas por sessão e por paciente, produtividade, faturamento |
| **Avaliações** | NPS e satisfação |
| **Cadastro do Hipo Saúde** (`hipo-dados.json`) | Terapeutas com nome completo, unidade, contratação, admissão, registro e carga horária; quem está ativo; grade da semana para a aba **Lotação** |
| **Agenda semanal** (uma por unidade) | Aba **Agenda**: quem atende mais/menos, pacientes novos, de saída, sem autorização, ocupação dos horários e vagas em grupo. Vira a carteira ativa (libera retenção e carteira) e aparece na ficha de cada profissional |

Importar uma planilha sem nenhum paciente não apaga nada: o sistema recusa a importação.

## Atendimento em grupo
Há três formas de marcar um atendimento como grupo:
1. **Na planilha:** `IURY (G) - ADRIANA`. Também valem `[G]`, `GRUPO` ou `*`.
2. **No painel:** botão **G** na lista de saídas. Na ficha do profissional também dá para escolher qual grupo.
3. **No cadastro:** "Como atende" = *Só grupo* ou *Misto*. Os grupos (nome, horário, vagas) também são cadastrados ali.

Reimportar a planilha mantém as marcações feitas no painel. O filtro **Modalidade** separa individual de grupo em todas as telas.

## Perdas evitáveis e score
- **Perdas evitáveis** são as saídas por faltas, insatisfação ou mudança de clínica. A lista fica em `EVITAVEIS`, no arquivo `web/lib/core.php`.
- **Score (0–100):** compara o profissional só com a própria área. Pesos: retenção (só perdas individuais) 35%, satisfação 25%, assiduidade 20% e produtividade 20%. Ele usa apenas os componentes que já têm dados.

## Ajustes
- **Categorias de motivo:** `MOTIVOS` em `web/lib/importar.php`. Outra opção é criar uma coluna CATEGORIA na planilha.
- **Grafias de nomes de profissionais:** `PROF_ALIAS` em `web/lib/importar.php`.

## Agenda semanal das unidades
- **Formato:** a planilha de agenda como é usada hoje (AGENDA VILA, AGENDA FELICITTÁ). Uma aba por dia e período (`SEGUNDAMANHÃ`, `TERÇA TARDE`, `SÁBADO`…), coluna A com os horários, uma coluna por sala/profissional (`Profissional: Nome` no cabeçalho). Cada célula é um paciente; nas oficinas, linhas numeradas (`1- Fulano`, `2-`).
- **Marcações lidas nas células:** `PACIENTE DE ENTRADA`/`PCT DE ENTRADA` (novo), `DE SAÍDA`/`VAI SAIR` (saindo), `RETORNO`, `AJUSTE`/`ALTERAÇÃO`/`REMANEJAMENTO`, `SEM AUT`, `CONGELADO`, `FECHADO`/`não tem atendimento` (horário fechado) e datas como `A PARTIR DE 01/11`.
- **Importar:** aba **Importar** → *Agenda semanal da unidade*. Informe a unidade (ou deixe em branco para usar o nome do arquivo) e a data da agenda. Escolha o modo:
  - **Atualizar** (padrão): agenda de uma nova semana. A atual fica guardada como histórico, para comparar quem saiu e quem entrou. Se já existir agenda com a mesma data, ela é substituída.
  - **Sobrescrever**: corrige a agenda atual da unidade (mesma semana). A versão mais recente é apagada e trocada pela nova, sem histórico. O painel pede confirmação.
- **Importe toda semana:** o painel compara a agenda atual com a anterior de cada unidade e mostra quem **saiu** e quem **entrou** na agenda de cada profissional. Quem saiu de todas as agendas vira paciente inativo.
- **Profissionais novos:** quem não existe no cadastro é criado na área deduzida do cabeçalho (a importação avisa quais). Grafias diferentes: `AGENDA_PROF_ALIAS` em `web/lib/agenda.php`. Marcações e áreas: `AGENDA_MARCAS` e `AGENDA_AREAS` no mesmo arquivo.

## Hipo Saúde: cadastro dos terapeutas e lotação
O Hipo Saúde (https://specially.hiposaudeintegrada.com.br) vai ser descontinuado. Os dados foram extraídos uma vez, pelo navegador logado, e gravados em `dados/hipo/` (fora do Git):
- `hipo-dados.json`: 464 usuários do Hipo (só os campos de cadastro, sem CPF nem endereço) e a grade da semana de 02 a 06/11/2026 (3.424 registros). É este arquivo que se importa.
- **Importar:** aba **Importar** → *Cadastro do Hipo Saúde*. Faça o mesmo no site em produção para levar os dados para lá. Pode importar de novo sem duplicar.
- **O que a importação faz:**
  1. Casa cada terapeuta pelo nome. O Profile usa o nome curto ("Alice Marques") e o Hipo, o completo ("Alice Marques de Souza").
  2. Une os cadastros duplicados: a mesma pessoa em duas áreas, ou com grafia levemente diferente (Luttienny × Luttieny). O histórico passa para o cadastro que fica, e o nome curto é mantido porque é o que as planilhas usam.
  3. Completa os campos vazios: admissão, registro, carga horária, unidade e contratação.
  4. Marca ativo ou inativo conforme o Hipo. Quem não tem par no Hipo e não está na agenda atual vira inativo, e o histórico continua.
- **Conciliação:** aba **Cadastros → Conciliação Hipo** lista os ativos que ficaram sem par, com sugestões. Para cada um: **Unir** (é a mesma pessoa), **Marcar inativo** (já saiu) ou manter (é nova).
- **Especialidades do Hipo → áreas do Profile:** `HIPO_ESP` em `web/lib/hipo.php`. Aplicador ABA vira Acompanhamento Terapêutico, Coordenador ABA vira Psicologia, Jiu-Jitsu vira Psicomotricidade e Pedagogia vira Psicopedagogia.

### Lotação (aba Lotação)
- **Capacidade de cada terapeuta ativo** (horários por semana). Vale a primeira regra que se aplicar:
  1. O valor informado à mão (campo *Capacidade semanal*).
  2. A carga horária × 1,3 sessão por hora. A grade do Hipo tem 14 sessões de 45 min das 08h às 20h.
  3. O turno que ele já faz na agenda, do primeiro ao último horário de cada dia.
- **Aplicadores ABA sem agenda própria** entram como apoio: atendem na agenda de outro terapeuta e não somam horários.
- **Ocupação** = horários com paciente + bloqueados ÷ capacidade. Um horário de grupo conta uma vez.
- **Lotação máxima** = pacientes de hoje + vagas. Vagas = horários livres ÷ horários que cada paciente usa na área.
- **Ajuste fino:** na tabela *Capacidade por terapeuta*, preencha a carga horária ou a capacidade de quem está "sem dados". O total recalcula na hora.
- Parâmetros: `LOT_SESSOES_DIA`, `LOT_HORAS_DIA` e `LOT_DIAS_MAX` em `web/lib/hipo.php`.

## Cadastros (criar, editar, excluir)
A aba **Cadastros** tem uma aba para cada tabela:
- **Profissionais:** tela própria, com foto, competências e grupos. Tem **Excluir** e **Unir com outro cadastro** (junta duplicados sem perder histórico).
- **Demais tabelas:** pacientes, carteira (vínculos), saídas, atendimentos, avaliações, grupos, áreas, convênios e agendas importadas.
- **Onde se descreve cada tabela:** `crud_tabelas()` em `web/lib/crud.php` (campos, tipos e obrigatórios). A API e a tela usam essa mesma descrição.
- **Exclusões:**
  - Excluir um paciente ou profissional apaga o que depende dele. A tela mostra antes o que será apagado.
  - Áreas e convênios em uso não podem ser excluídos.
- **Registros criados à mão** ficam com origem `manual` e **não** são apagados quando a planilha correspondente é importada de novo. Os que vieram de planilha são refeitos a cada importação.

