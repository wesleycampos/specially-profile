/* Ícone "i" com a explicação de cada indicador.
   As explicações ficam em INFO, pelo nome que aparece na tela (sem acento, sem maiúsculas).
   O ícone é colocado sozinho em cartões, colunas de tabela, barras comparativas e títulos que tenham explicação. */
const INFO = {
  /* ---------- perdas (planilha de saídas) ---------- */
  'pacientes perdidos': 'Quantas saídas de pacientes foram registradas na planilha de saídas no período e nos filtros escolhidos. Se o mesmo paciente saiu duas vezes, conta duas. Embaixo aparece a média por mês. Na ficha e no painel individual, conta as saídas em que o profissional atendia o paciente.',
  'pacientes que sairam': 'Quantos pacientes diferentes saíram no período (planilha de saídas). Quem saiu mais de uma vez conta uma vez só.',
  'saidas por faltas': 'Parte das saídas cujo motivo foi faltas: faltas consecutivas, ausência ou paciente que sumiu sem retorno. É a categoria "Faltas / ausências".',
  'perdas por faltas': 'Parte das saídas deste profissional cujo motivo foi faltas (faltas consecutivas, ausência, sem retorno). A comparação é com a média da área.',
  'perdas evitaveis': 'Parte das saídas por motivos em que a clínica tem influência: faltas/ausências, insatisfação/adaptação e mudança de clínica. Convênio, mudança de cidade, rotina da família e alta são causas externas e não entram. Quanto menor, melhor.',
  'perdas em grupo': 'Saídas de pacientes que este profissional atendia em grupo (marcados com (G), pelo botão G ou porque o profissional atende só em grupo). Perda em grupo tem outra dinâmica e não pesa no score.',
  'taxa de perda': 'Saídas ÷ (pacientes ativos + saídas). Mostra quanto da base de pacientes foi perdida no período. Precisa da carteira ativa (lista de pacientes ativos ou agenda).',
  'retencao': 'Quanto da carteira o profissional manteve: 100% − saídas ÷ (pacientes ativos + saídas). Quanto maior, mais ele segura os pacientes. Precisa da carteira ativa (lista de pacientes ativos ou agenda).',
  'pacientes ativos': 'Pacientes em atendimento hoje. Vem da lista de pacientes ativos ou da agenda semanal mais recente de cada unidade.',
  'carteira ativa': 'Pacientes que o profissional atende hoje (lista de pacientes ativos ou agenda). A linha de referência é a meta de carteira do cadastro; sem meta, a média da área.',
  'carteira': 'Pacientes ativos atendidos hoje (lista de pacientes ativos ou agenda semanal).',
  'saidas': 'Pacientes que saíram no período, pela planilha de saídas. Nas áreas, cada saída conta uma vez na área, mesmo com vários profissionais da mesma área.',
  'por profissional': 'Saídas da área ÷ número de profissionais da área com movimento.',
  'saidas/prof.': 'Saídas da área ÷ número de profissionais da área com movimento. Mostra a perda média por profissional.',
  'saidas por profissional': 'Média de pacientes perdidos por profissional em cada área: saídas da área ÷ profissionais da área com movimento.',
  '% por faltas': 'Parte das saídas causada por faltas (faltas consecutivas, ausência, sem retorno).',
  '% faltas': 'Parte das saídas causada por faltas (faltas consecutivas, ausência, sem retorno).',
  '% das saidas causadas por faltas': 'Em cada área, quanto das saídas veio de faltas consecutivas ou ausência. Área com percentual alto perde pacientes principalmente por falta de adesão.',
  'evitaveis': 'Parte das saídas por motivos em que a clínica tem influência (faltas, insatisfação, mudança de clínica).',
  'em grupo': 'Na lista de perdas: saídas de pacientes atendidos em grupo. Na agenda: atendimentos da semana feitos em grupo/oficina.',
  'motivo principal': 'Categoria de motivo que mais aparece nas saídas.',
  'evolucao das saidas': 'Saídas por mês, divididas pela categoria do motivo. A categoria vem da coluna OBSERVAÇÕES da planilha de saídas, classificada automaticamente.',
  'por que estamos perdendo pacientes': 'Quantas saídas há em cada categoria de motivo e quanto isso representa do total.',
  'atencao: mais perdas no periodo': 'Profissionais com mais saídas no período. A barra colorida mostra a divisão por motivo. Número absoluto: quem tem carteira grande tende a aparecer aqui.',
  'areas': 'Saídas por especialidade: total, média por profissional e quanto foi por faltas.',
  'saidas por convenio': 'Saídas de cada convênio, separando as causadas por faltas das demais.',
  'convenio × motivo': 'Quantas saídas cada convênio teve em cada categoria de motivo. Cores mais fortes indicam mais saídas.',
  'area × motivo de saida': 'Quantas saídas cada área teve em cada categoria de motivo. Cores mais fortes indicam mais saídas.',
  'individual × grupo': 'Compara as perdas de pacientes atendidos individualmente com as de pacientes atendidos em grupo. Cada par paciente × profissional conta uma vez.',
  'profissionais que mais perderam pacientes': 'Profissionais ordenados pelo número de saídas. Clique para ver paciente, data, convênio e motivo de cada saída.',
  'todas as saidas': 'Lista completa das saídas do período, com os profissionais que atendiam o paciente. O botão G marca se aquele atendimento era em grupo.',
  'saidas 12m': 'Saídas registradas na planilha de saídas nos últimos 12 meses para este profissional.',

  /* ---------- atendimentos, faturamento, satisfação ---------- */
  'faltas nas sessoes': 'Faltas (inclusive justificadas) ÷ sessões agendadas (realizadas + faltas). Vem da planilha de atendimentos.',
  'faltas sessoes': 'Faltas (inclusive justificadas) ÷ sessões agendadas na área. Vem da planilha de atendimentos.',
  'faturamento': 'Soma do valor das sessões realizadas no período. Quando a sessão não traz valor, usa o valor por sessão do convênio do paciente (aba Cadastros).',
  'fat./prof.': 'Faturamento da área ÷ número de profissionais da área com movimento.',
  'nps': 'Net Promoter Score: % de notas 9 e 10 (promotores) menos % de notas 0 a 6 (detratores). Vai de −100 a +100; acima de 50 é muito bom.',
  'nota media': 'Média das notas de satisfação (0 a 10) no período.',
  'satisfacao': 'Nota média de satisfação (0 a 10) dada pelos pacientes/famílias ao profissional.',
  'respostas': 'Quantas avaliações de satisfação foram respondidas no período.',
  'nps por area': 'NPS das avaliações de cada área: % de promotores (9–10) menos % de detratores (0–6).',
  'profissionais melhor e pior avaliados': 'Os 5 com maior e os 5 com menor nota média de satisfação. Só entra quem tem pelo menos 3 avaliações.',

  /* ---------- score e comparações ---------- */
  'score na area': 'Nota de 0 a 100 que compara o profissional só com colegas da mesma área. Pesos: retenção 35%, satisfação 25%, assiduidade dos pacientes 20% e produtividade 20%. Usa só o que já tem dados; hoje a retenção considera as perdas evitáveis em atendimento individual.',
  'score medio': 'Média do score (0 a 100) dos profissionais da área.',
  'score geral': 'Nota de 0 a 100 que compara o profissional com a própria área (retenção, satisfação, assiduidade e produtividade, com os dados disponíveis).',
  'desempenho no periodo': 'Cada barra compara o profissional com a média da área (linha vertical). Verde: melhor que a média. Laranja: perto da média. Vermelho: pior.',
  'comparado a media da area': 'Cada barra compara o profissional com a média da área (linha vertical). Verde: melhor que a média. Laranja: perto da média. Vermelho: pior.',
  'ranking dos profissionais': 'Escolha o critério nos botões. À esquerda, quem vai melhor; à direita, quem precisa de atenção. Cada critério exige um mínimo (por exemplo, 5 saídas) para não premiar quem tem poucos pacientes.',
  'profissionais': 'Profissionais da área que tiveram algum movimento (saída, carteira ou atendimento).',
  'comparativo entre areas': 'Indicadores de cada especialidade lado a lado. Clique numa área para filtrar o painel inteiro por ela.',
  'pacientes perdidos por mes': 'Saídas do profissional em cada mês (linha cheia) comparadas com a média por profissional da mesma área (linha tracejada).',
  'perdas por convenio': 'Saídas do profissional separadas pelo convênio do paciente.',
  'motivos das perdas': 'Saídas do profissional separadas pela categoria do motivo.',

  /* ---------- pacientes ---------- */
  'saíram mais de uma vez': 'Pacientes que têm mais de uma saída registrada no período: voltaram e saíram de novo.',
  'sairam mais de uma vez': 'Pacientes que têm mais de uma saída registrada no período: voltaram e saíram de novo.',
  'pacientes ativos ha mais tempo': 'Pacientes ativos ordenados pela data de início na clínica (lista de pacientes ativos).',
  'pacientes que mais faltam': 'Pacientes com mais faltas nas sessões agendadas do período. Muitas faltas costumam vir antes de uma saída.',
  'pacientes com mais de uma saida registrada': 'Pacientes que voltaram para a clínica e saíram de novo.',

  /* ---------- agenda semanal ---------- */
  'atendimentos por semana': 'Quantos atendimentos a agenda da semana tem: cada paciente em cada horário conta 1, e cada vaga ocupada em grupo/oficina também. Pacientes congelados não contam. Embaixo: quantos horários da grade têm pelo menos um paciente.',
  'pacientes na agenda': 'Pacientes diferentes na agenda mais recente de cada unidade (quem tem vários horários conta uma vez). Embaixo: quantos profissionais têm agenda.',
  'ocupacao dos horarios': 'Horários com paciente ÷ (horários com paciente + horários vagos). Horários marcados como fechado não entram na conta. Embaixo: quantos estão vagos e quantos fechados.',
  'ocupacao': 'Horários com paciente ÷ (horários com paciente + horários vagos). Horários fechados não entram.',
  'pacientes novos': 'Pacientes marcados na agenda como "PACIENTE DE ENTRADA" ou "PCT DE ENTRADA".',
  'novos': 'Pacientes marcados na agenda como "PACIENTE DE ENTRADA" / "PCT DE ENTRADA".',
  'de saida': 'Pacientes marcados na agenda como "DE SAÍDA" ou "VAI SAIR". Quando existe uma agenda anterior da unidade, aparece também quantos sumiram da agenda desde ela.',
  'sem autorizacao': 'Pacientes marcados "SEM AUT" na agenda: ainda sem autorização do convênio. Embaixo: "em ajuste" são os marcados AJUSTE / ALTERAÇÃO / REMANEJAMENTO; "congelados" estão pausados e não contam como atendimento.',
  'sem aut.': 'Pacientes marcados "SEM AUT" na agenda (sem autorização do convênio).',
  'vagas livres em grupo': 'Lugares vazios nas oficinas e grupos: linhas numeradas sem nome na agenda (por exemplo "3-"). São vagas que podem receber pacientes.',
  'atend./sem': 'Atendimentos na agenda da semana: cada paciente em cada horário conta 1, inclusive vagas ocupadas em grupo. Congelados não contam.',
  'atend.': 'Atendimentos na agenda da semana (cada paciente em cada horário; congelados não contam).',
  'por prof.': 'Atendimentos da área ÷ profissionais da área com agenda.',
  'prof.': 'Profissionais da área com agenda.',
  'perdas': 'Na agenda: pacientes marcados "de saída" mais os que sumiram da agenda desde a anterior.',
  'pacientes': 'Pacientes diferentes na agenda (quem tem vários horários conta uma vez).',
  'terapeutas': 'Terapeutas com horário nesta sala ou área.',
  'horarios': 'Horários da grade com pelo menos um paciente.',
  'vagos': 'Horários sem paciente na grade da semana. Os marcados como fechado não contam.',
  'fechados': 'Horários marcados como "FECHADO" ou "não tem atendimento".',
  'sairam': 'Pacientes que estavam na agenda anterior deste profissional e não estão na atual.',
  'entraram': 'Pacientes que estão na agenda atual e não estavam na anterior.',
  'dias': 'Dias da semana em que o profissional tem horário na agenda.',
  'agenda semanal das unidades': 'Indicadores da agenda mais recente de cada unidade. Importe a agenda toda semana para comparar quem entrou e quem saiu.',
  'acompanhamento por sala / area': 'Atendimentos, pacientes, horários e terapeutas de uma sala ou de uma área escolhida, com a grade da semana.',
  'rankings da agenda': 'Quem mais e quem menos atende, pelo critério escolhido nos botões. Alguns critérios exigem um mínimo de atendimentos.',
  'atendimentos por dia e periodo': 'Pacientes agendados em cada dia e período da semana (cada vaga de grupo conta). Cores mais fortes indicam mais atendimentos.',
  'por area': 'Atendimentos da semana, média por profissional, ocupação dos horários, novos e perdas de cada área.',
  'pacientes em movimento': 'Listas de pacientes novos, de saída, que saíram ou entraram na agenda, sem autorização, em ajuste e congelados.',
  'todos os profissionais na agenda': 'Indicadores da agenda de cada profissional. Clique no cabeçalho para ordenar.',
  'agenda semanal': 'Grade da semana do profissional na agenda mais recente de cada unidade.',

  /* ---------- lotação (grade da semana do Hipo) ---------- */
  'terapeutas ativos': 'Profissionais marcados como ativos no cadastro (vindos do Hipo ou conciliados). Aplicadores ABA sem agenda própria entram como apoio: atendem na agenda de outro terapeuta e não somam horários.',
  'capacidade semanal': 'Soma dos horários de atendimento por semana de todos os terapeutas ativos. Para cada um vale, nesta ordem: a capacidade informada à mão; a carga horária × 1,3 sessão por hora (grade do Hipo: 14 sessões de 45 min em 10h45); ou o turno que ele já faz na agenda, do primeiro ao último horário de cada dia.',
  'capacidade': 'Horários de atendimento por semana. Informada à mão, calculada pela carga horária ou estimada pelo turno na agenda (veja a coluna Origem). Nunca fica menor do que o que já está agendado.',
  'horarios ocupados': 'Horários da semana com paciente agendado, mais os bloqueados pelo profissional (folga, fechamento de turno). Vários pacientes no mesmo horário (grupo) contam um horário só.',
  'ocupados': 'Horários da semana com paciente agendado mais os bloqueados. Um horário com grupo conta uma vez.',
  'livres': 'Capacidade menos os horários ocupados e bloqueados: onde ainda cabe paciente.',
  'ocupacao da capacidade': 'Horários ocupados e bloqueados ÷ capacidade semanal. Acima de 90% (vermelho) a área está praticamente lotada; entre 75% e 90% (laranja), perto do limite.',
  'uso da capacidade': 'Horários ocupados e bloqueados ÷ capacidade. Vermelho a partir de 90%, laranja a partir de 75%.',
  'pacientes na semana': 'Pacientes diferentes com pelo menos uma sessão na grade da semana do Hipo.',
  'horarios por paciente': 'Quantos horários por semana cada paciente usa, em média, na área (ocupados ÷ pacientes). Serve para converter horários livres em vagas.',
  'vagas': 'Quantos pacientes a mais cabem: horários livres ÷ horários que cada paciente usa na área.',
  'lotacao maxima': 'Quantos pacientes a clínica (ou a área) comporta com a equipe ativa atual: os de hoje mais as vagas. No total da clínica, como o mesmo paciente faz várias terapias, a conta segue a proporção atual de pacientes por horário.',
  'origem': 'De onde veio a capacidade: informada (à mão), carga horária (do Hipo ou do cadastro), turno na agenda (estimada) ou sem dados (preencha a carga).',
};

const infoKey = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[▲▼🏆⚠️]/gu, '').replace(/\(\d+\)\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();

const INFO_N = {};
Object.entries(INFO).forEach(([k, v]) => INFO_N[infoKey(k)] = v);

// onde procurar rótulos de indicadores
const INFO_SEL = '.kpi .lb, .ind-kpi .lb, .bullet .lb, th, .card h2, .ind-panel > h3';

function addInfoIcons(root = document){
  root.querySelectorAll(INFO_SEL).forEach(el => {
    if (el.querySelector(':scope > .ii')) return;
    const txt = [...el.childNodes].filter(n => n.nodeType === 3 || (n.nodeType === 1 && !n.classList.contains('ii'))).map(n => n.textContent).join('');
    const tip = INFO_N[infoKey(txt)];
    if (!tip) return;
    const i = document.createElement('span');
    i.className = 'ii'; i.tabIndex = 0; i.setAttribute('role', 'button'); i.setAttribute('aria-label', 'O que é: ' + txt.trim());
    i.dataset.tip = tip; i.textContent = 'i';
    el.appendChild(i);
  });
}

// balão único, posicionado junto ao ícone (não é cortado por tabelas com rolagem)
const tipBox = document.createElement('div');
tipBox.className = 'ii-tip'; tipBox.setAttribute('role', 'tooltip'); tipBox.hidden = true;
document.addEventListener('DOMContentLoaded', () => document.body.appendChild(tipBox));
let tipFor = null;
function showTip(i){
  // janelas abertas (ficha, cadastro) ficam numa camada acima da página: o balão precisa estar dentro delas
  const casa = i.closest('dialog[open]') || document.body;
  if (tipBox.parentNode !== casa) casa.appendChild(tipBox);
  tipFor = i; tipBox.textContent = i.dataset.tip; tipBox.hidden = false;
  const r = i.getBoundingClientRect(), w = Math.min(320, innerWidth - 24);
  tipBox.style.width = w + 'px';
  const left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2));
  const h = tipBox.offsetHeight;
  const top = r.bottom + 8 + h < innerHeight ? r.bottom + 8 : Math.max(8, r.top - h - 8);
  tipBox.style.left = left + 'px'; tipBox.style.top = top + 'px';
}
function hideTip(){ tipFor = null; tipBox.hidden = true; }
document.addEventListener('mouseover', e => { const i = e.target.closest?.('.ii'); if (i) showTip(i); });
document.addEventListener('mouseout', e => { if (e.target.closest?.('.ii') && !e.relatedTarget?.closest?.('.ii')) hideTip(); });
document.addEventListener('focusin', e => { if (e.target.classList?.contains('ii')) showTip(e.target); });
document.addEventListener('focusout', e => { if (e.target.classList?.contains('ii')) hideTip(); });
document.addEventListener('click', e => {
  const i = e.target.closest?.('.ii');
  if (i) { e.preventDefault(); e.stopPropagation(); tipFor === i && !tipBox.hidden ? hideTip() : showTip(i); }
  else hideTip();
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
addEventListener('scroll', hideTip, true);

// coloca os ícones sempre que uma tela é desenhada
new MutationObserver(muts => {
  if (muts.some(m => [...m.addedNodes].some(n => n.nodeType === 1 && !n.classList.contains('ii')))) addInfoIcons();
}).observe(document.documentElement, {childList: true, subtree: true});
document.addEventListener('DOMContentLoaded', () => addInfoIcons());
