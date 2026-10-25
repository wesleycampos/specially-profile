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
