/* Painel do Corpo Clínico — front-end (sem build, só Chart.js) */
const MOT_ORDER = ['Faltas / ausências','Convênio / plano','Decisão da família','Logística / rotina','Mudança de clínica','Insatisfação / adaptação','Não informado','Outros'];
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
let META = null, D = null, AG = null, PROFS_ALL = null, section = 'visao';
const charts = {};

/* ---------------- utilitários ---------------- */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = n => n == null ? '—' : Number(n).toLocaleString('pt-BR', {maximumFractionDigits:1});
const money = n => n == null ? '—' : Number(n).toLocaleString('pt-BR', {style:'currency', currency:'BRL', maximumFractionDigits:0});
const pctf = n => n == null ? '—' : fmt(n) + '%';
const mesL = ym => { if (!ym) return '—'; const [y,m] = ym.split('-'); return MESES[+m-1] + '/' + y.slice(2); };
const dataL = d => { if (!d) return '—'; const [y,m,dd] = d.split('-'); return dd === '01' && !d.includes('T') ? mesL(d.slice(0,7)) : `${dd}/${m}/${y}`; };
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const SERIES = () => [1,2,3,4,5,6,7,8].map(i => css('--s'+i));
const motColor = m => SERIES()[MOT_ORDER.indexOf(m)] ?? css('--muted');
const mean = xs => { xs = xs.filter(x => x != null); return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null; };
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase();
function toast(msg, ms = 3500){ const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), ms); }
async function api(path, opts = {}){
  const r = await fetch(path, {...opts, headers:{'X-Requested-With':'profile', ...(opts.headers || {})}});
  if (r.status === 401) { location.reload(); throw new Error('Sessão expirada'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || r.statusText);
  return j;
}
function espColor(espId){
  const i = (META?.especialidades || []).findIndex(e => e.id === espId);
  return SERIES()[(i < 0 ? 0 : i) % 8];
}
function initials(n){ const p = String(n).split(' ').filter(w => w.length > 2 || w === w.toUpperCase()); return ((p[0]?.[0] || '') + (p.length > 1 ? p.at(-1)[0] : '')).toUpperCase(); }
function avatar(p, cls = ''){
  if (p.foto || p.foto_url) return `<img class="av ${cls}" src="${esc(p.foto || p.foto_url)}" alt="">`;
  return `<span class="av ${cls}" style="background:${espColor(p.esp_id ?? p.especialidade_id)}">${esc(initials(p.nome))}</span>`;
}
const who = p => `<div class="who">${avatar(p)}<div style="min-width:0"><div class="nm">${esc(p.nome)}</div><div class="es">${esc(p.esp)}</div></div></div>`;
function status(v, ref, lowerBetter){
  if (v == null || ref == null) return 'na';
  if (ref === 0) return v === 0 ? 'good' : (lowerBetter ? 'bad' : 'good');
  const r = (v - ref) / Math.abs(ref);
  const better = lowerBetter ? r < -0.1 : r > 0.1, worse = lowerBetter ? r > 0.1 : r < -0.1;
  return better ? 'good' : worse ? 'bad' : 'warn';
}
const scoreChip = s => s == null ? `<span class="score" style="background:var(--surface-2);color:var(--muted)">sem score</span>`
  : `<span class="score" style="background:${s>=66?'var(--good)':s>=40?'var(--warn)':'var(--bad)'};color:#fff" title="Score 0–100 (comparado à própria área)">${s}</span>`;

/* ---------------- Chart.js ---------------- */
function baseOpts(horizontal, onPick){
  const grid = css('--grid'), txt = css('--text-2');
  return {
    responsive:true, maintainAspectRatio:false, indexAxis: horizontal ? 'y' : 'x', animation:{duration:250},
    plugins:{ legend:{display:false},
      tooltip:{backgroundColor:css('--surface'), titleColor:css('--text'), bodyColor:css('--text-2'), borderColor:css('--border'), borderWidth:1, padding:10, cornerRadius:8, boxPadding:4} },
    scales:{
      x:{grid:{color: horizontal ? grid : 'transparent'}, ticks:{color:txt, precision:0}, border:{display:false}},
      y:{grid:{color: horizontal ? 'transparent' : grid}, ticks:{color:txt, precision:0, autoSkip:false}, border:{display:false}} },
    onClick:(e, els) => { if (els.length && onPick) onPick(els[0]); },
    onHover:(e, els) => { e.native.target.style.cursor = els.length && onPick ? 'pointer' : 'default'; }
  };
}
const bar = (data, color, label) => ({label, data, backgroundColor:color, borderRadius:4, borderSkipped:'start', maxBarThickness:22});
function draw(id, cfg){ charts[id]?.destroy(); const el = $(id); if (el) charts[id] = new Chart(el, cfg); }
Chart.register({ id:'valueLabels', afterDatasetsDraw(chart){
  if (chart.config.options.indexAxis !== 'y' || chart.data.datasets.length !== 1) return;
  const {ctx} = chart, ds = chart.data.datasets[0]; ctx.save();
  ctx.fillStyle = chart.options.plugins.valueLabels?.color || css('--text-2'); ctx.font = '12px "Segoe UI",system-ui'; ctx.textBaseline = 'middle';
  chart.getDatasetMeta(0).data.forEach((b,i) => ctx.fillText(ds.labelsFmt?.[i] ?? fmt(ds.data[i]), b.x + 6, b.y));
  ctx.restore();
}});
Chart.register({ id:'pointLabels', afterDatasetsDraw(chart, args, opts){
  if (!opts || !opts.on) return;
  const {ctx} = chart; ctx.save(); ctx.font = '600 12px "Segoe UI",system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = opts.color || css('--text');
  chart.data.datasets.forEach((ds, di) => { if (ds.noLabels || !chart.isDatasetVisible(di)) return;
    chart.getDatasetMeta(di).data.forEach((el, i) => { const v = ds.data[i]; if (v) ctx.fillText(fmt(v), el.x, el.y - 10); }); });
  ctx.restore();
}});
function hbar(id, labels, values, colors, fmtFn, onPick){
  $(id).parentElement.style.height = Math.max(150, labels.length * 30 + 40) + 'px';
  const ds = bar(values, colors, ''); if (fmtFn) ds.labelsFmt = values.map(fmtFn);
  const o = baseOpts(true, onPick); o.layout = {padding:{right:70}};
  draw(id, {type:'bar', data:{labels, datasets:[ds]}, options:o});
}
function heat(tableId, rows, cols, get, rowLabel = r => r, colLabel = c => c){
  const steps = css('--seq').split(',').map(s => s.trim());
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  let max = 1; rows.forEach(r => cols.forEach(c => max = Math.max(max, get(r,c))));
  let h = `<tr><th class="rh"></th>${cols.map(c => `<th class="num">${esc(colLabel(c))}</th>`).join('')}<th class="num">Total</th></tr>`;
  rows.forEach(r => {
    let tot = 0;
    h += `<tr><td class="rh">${esc(rowLabel(r))}</td>` + cols.map(c => {
      const v = get(r,c); tot += v; if (!v) return `<td style="color:var(--muted)">·</td>`;
      const t = 0.1 + 0.85 * v / max, bg = steps[Math.round(t * (steps.length - 1))];
      const fg = dark ? (t > .55 ? '#0b0b0b' : '#fff') : (t > .5 ? '#fff' : '#0b0b0b');
      return `<td style="background:${bg};color:${fg}" title="${esc(rowLabel(r))} · ${esc(colLabel(c))}: ${v}">${v}</td>`;
    }).join('') + `<td class="num" style="font-weight:600;color:var(--text-2)">${tot}</td></tr>`;
  });
  $(tableId).innerHTML = rows.length ? h : `<tr><td class="empty">Sem dados no período</td></tr>`;
}

/* ---------------- filtros e carga ---------------- */
function qs(){
  const p = new URLSearchParams();
  if ($('fDe').value) p.set('de', $('fDe').value);
  if ($('fAte').value) p.set('ate', $('fAte').value);
  if ($('fEsp').value) p.set('esp', $('fEsp').value);
  if ($('fConv').value) p.set('conv', $('fConv').value);
  if ($('fMod').value) p.set('mod', $('fMod').value);
  return p.toString();
}
async function loadMeta(){
  META = await api('api/meta');
  const keep = id => $(id).value;
  const [de, ate, esp, conv] = ['fDe','fAte','fEsp','fConv'].map(keep);
  $('fDe').innerHTML = '<option value="">início</option>' + META.meses.map(m => `<option value="${m}">${mesL(m)}</option>`).join('');
  $('fAte').innerHTML = '<option value="">hoje</option>' + META.meses.map(m => `<option value="${m}">${mesL(m)}</option>`).join('');
  $('fEsp').innerHTML = '<option value="">Todas</option>' + META.especialidades.map(e => `<option value="${e.id}">${esc(e.nome)}</option>`).join('');
  $('fConv').innerHTML = '<option value="">Todos</option>' + META.convenios.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  $('fDe').value = de; $('fAte').value = ate; $('fEsp').value = esp; $('fConv').value = conv;
}
async function refresh(){
  [D, AG] = await Promise.all([api('api/dashboard?' + qs()), api('api/agenda?' + agQs())]);
  mergeAgenda();
  const c = META.contagens;
  $('sub').textContent = `${c.profissionais} profissionais (${fmt(c.profissionais_ativos)} ativos · ${fmt(c.profissionais - c.profissionais_ativos)} inativos) · ${c.pacientes} pacientes · ${c.saidas} saídas · ${c.atendimentos} atendimentos · ${c.avaliacoes} avaliações`;
  renderSection();
}
function go(){
  section = (location.hash || '#visao').slice(1);
  if (!$('s-' + section)) section = 'visao';
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('on', s.id === 's-' + section));
  document.querySelectorAll('nav.side a[data-s]').forEach(a => a.classList.toggle('on', a.dataset.s === section));
  $('cfgBtn').classList.toggle('on', section === 'importar');
  $('topFiltros').hidden = section === 'repasse';   // o repasse tem filtros próprios (meses, área, forma de pagamento)
  const titles = {visao:'Visão geral do corpo clínico', ranking:'Ranking — melhores e piores', agenda:'Agenda — quem atende mais, novos e saídas', individual:'Painel individual', profissionais:'Equipe', areas:'Áreas / especialidades', perdas:'Perda de pacientes', pacientes:'Pacientes', satisfacao:'Satisfação', cadastros:'Cadastros', importar:'Importar dados', lotacao:'Lotação — capacidade e ocupação da clínica', repasse:'Repasse — quanto pagamos e quanto recebemos por terapeuta'};
  $('title').textContent = titles[section];
  if (D) renderSection();
}
function renderSection(){
  ({visao:rVisao, ranking:rRanking, agenda:rAgenda, individual:rIndividual, profissionais:rEquipe, areas:rAreas, perdas:rPerdas, pacientes:rPacientes, satisfacao:rSatisfacao, cadastros:rCadastros, importar:rImportar, lotacao:rLotacao, repasse:rRepasse})[section]();
}

/* Clique numa área filtra o painel; clicar de novo na mesma área tira o filtro */
function alternaArea(id, nome){
  const sai = $('fEsp').value === String(id);
  $('fEsp').value = sai ? '' : id; refresh();
  toast(sai ? 'Filtro de área removido' : `Filtrando pela área: ${nome} — clique de novo para tirar`, 2500);
}
const areaSel = id => $('fEsp').value === String(id) ? 'sel' : '';
const AREA_TIP = 'title="Clique para filtrar por esta área; clique de novo para tirar o filtro"';

/* ---------------- VISÃO GERAL ---------------- */
const ICON = {
  out:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>',
  users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a5 5 0 0 0-4-5"/></svg>',
  pct:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 5L5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
  cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M9 14l6 4M15 14l-6 4"/></svg>',
  money:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  star:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
};
const kpi = (ic, lb, v, d = '', na = false) => `<div class="kpi ${na?'na':''}"><div class="ic">${ICON[ic]}</div><div class="lb">${lb}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
const naTxt = 'sem dados — <a href="#importar">importar</a>';
function rVisao(){
  const k = D.kpis, a = D.disponivel;
  const falta = [];
  if (!a.ativos) falta.push('<b>pacientes ativos</b> (carteira, taxa de perda, tempo de casa)');
  if (!a.atendimentos) falta.push('<b>atendimentos</b> (faltas por sessão, produtividade, faturamento)');
  if (!a.avaliacoes) falta.push('<b>avaliações de satisfação</b> (NPS)');
  if (!a.cadastro) falta.push('<b>cadastro dos profissionais</b> (formação, competências, meta)');
  $('avisos').innerHTML = falta.length ? `<div class="notice"><span>📥</span><div>Hoje o painel usa só a planilha de saídas. Para liberar os demais indicadores, importe: ${falta.join(' · ')}. <a href="#importar">Ir para Importar →</a></div></div>` : '';
  $('kpis').innerHTML =
    kpi('out', 'Pacientes perdidos', fmt(k.saidas), `${fmt(k.saidas / k.meses)} por mês em média`) +
    kpi('pct', 'Saídas por faltas', pctf(k.pct_faltas_saida), 'principal causa de perda') +
    kpi('pct', 'Perdas evitáveis', pctf(k.pct_evitaveis), `${fmt(k.evitaveis)} por faltas, insatisfação ou troca de clínica`) +
    kpi('users', 'Pacientes ativos', a.ativos ? fmt(k.ativos) : naTxt, a.ativos ? '' : '', !a.ativos) +
    kpi('pct', 'Taxa de perda', a.ativos ? pctf(k.taxa_perda) : naTxt, a.ativos ? 'saídas ÷ (ativos + saídas)' : '', !a.ativos) +
    kpi('cal', 'Faltas nas sessões', a.atendimentos ? pctf(k.taxa_falta) : naTxt, a.atendimentos ? `${fmt(k.faltas)} faltas em ${fmt(k.sessoes + k.faltas)} agendadas` : '', !a.atendimentos) +
    kpi('money', 'Faturamento', a.atendimentos && a.valores ? money(k.faturamento) : naTxt, a.atendimentos ? `${fmt(k.sessoes)} sessões realizadas` : '', !(a.atendimentos && a.valores)) +
    kpi('star', 'NPS', a.avaliacoes ? fmt(k.nps) : naTxt, a.avaliacoes ? `nota média ${fmt(k.nota)} · ${k.n_aval} respostas` : '', !a.avaliacoes);

  const mots = MOT_ORDER.filter(m => D.motivos.some(x => x[0] === m));
  $('legMot').innerHTML = mots.map(m => `<span><span class="sw" style="background:${motColor(m)}"></span>${esc(m)}</span>`).join('');
  const o = baseOpts(false); o.scales.x.stacked = o.scales.y.stacked = true;
  o.plugins.tooltip.mode = 'index'; o.plugins.tooltip.filter = i => i.raw > 0;
  o.plugins.tooltip.callbacks = {footer: it => 'Total: ' + it.reduce((s,i) => s + i.raw, 0)};
  draw('cSerie', {type:'bar', data:{labels:D.serie.map(s => mesL(s.mes)),
    datasets: mots.map(m => ({...bar(D.serie.map(s => s.saidas[m] || 0), motColor(m), m), borderRadius:0, borderSkipped:false, borderColor:css('--surface'), borderWidth:{top:2}}))}, options:o});

  const mo = [...D.motivos].sort((x,y) => MOT_ORDER.indexOf(x[0]) - MOT_ORDER.indexOf(y[0]));
  hbar('cMotivos', mo.map(m => m[0]), mo.map(m => m[1]), mo.map(m => motColor(m[0])), v => `${v} (${pctf(100 * v / k.saidas)})`);

  const top = D.profissionais.filter(p => p.saidas).slice(0, 8);
  $('atencao').innerHTML = top.length ? '<table><tbody>' + top.map(p => `<tr class="click" data-p="${p.id}"><td>${who(p)}</td>
    <td style="width:40%"><div class="minibar">${Object.entries(p.motivos).sort((a,b)=>MOT_ORDER.indexOf(a[0])-MOT_ORDER.indexOf(b[0])).map(([m,n]) => `<span title="${esc(m)}: ${n}" style="flex:${n};background:${motColor(m)}"></span>`).join('')}</div></td>
    <td class="num"><b>${p.saidas}</b> saídas<div style="font-size:11.5px;color:var(--muted)">${pctf(p.pct_evitaveis)} evitáveis${p.saidas_grupo ? ' · ' + p.saidas_grupo + ' em grupo' : ''}</div></td></tr>`).join('') + '</tbody></table>' : '<div class="empty">Nenhuma saída no período</div>';
  bindProfClicks($('atencao'));

  $('areasMini').innerHTML = `<table><thead><tr><th>Área</th><th class="num">Saídas</th><th class="num">Por profissional</th><th class="num">% faltas</th>${a.ativos?'<th class="num">Taxa de perda</th>':''}</tr></thead><tbody>` +
    D.areas.map(x => `<tr><td><span class="tag"><span class="sw" style="background:${espColor(x.id)}"></span>${esc(x.nome)}</span></td><td class="num">${x.saidas}</td><td class="num">${fmt(x.saidas_por_prof)}</td><td class="num">${pctf(x.pct_faltas_saida)}</td>${a.ativos?`<td class="num">${pctf(x.taxa_perda)}</td>`:''}</tr>`).join('') + '</tbody></table>';
}
function bindProfClicks(root){ root.querySelectorAll('[data-p]').forEach(el => el.onclick = e => { e.preventDefault(); openProf(+el.dataset.p); }); }

/* ---------------- RANKING (melhores × piores) ---------------- */
let rkMetric = 'evitaveis';
function rkDefs(){
  const a = D.disponivel;
  return [
    {id:'retencao', k:'taxa_retencao', l:'Retenção', high:true, f:pctf, need:a.ativos, min:p => p.carteira + p.saidas >= 5,
      best:'Quem mais mantém pacientes', worst:'Quem menos mantém', hint:'% dos pacientes do profissional que continuam em atendimento: carteira ÷ (carteira + saídas). Mínimo de 5 pacientes.'},
    {id:'evitaveis', k:'pct_evitaveis', l:'Perdas evitáveis', high:false, f:pctf, min:p => p.saidas >= 5,
      best:'Perdas por causas externas', worst:'Mais perdas evitáveis',
      hint:`% das saídas por motivos em que a clínica tem influência (${D.evitaveis.join(', ')}). Mínimo de 5 saídas. Nos destaques, quem perdeu pacientes principalmente por causas externas (convênio, mudança, alta).`},
    {id:'score', k:'score', l:'Score geral', high:true, f:v => 'score ' + v, best:'Melhores no geral', worst:'Piores no geral',
      hint:'Score 0–100 comparando cada profissional com a própria área: retenção (perdas individuais), satisfação, assiduidade dos pacientes e produtividade, com os dados disponíveis.'},
    {id:'perdas', k:'saidas', l:'Nº de perdas', high:false, f:v => v + ' saídas', onlyWorst:!a.ativos, min:p => p.saidas > 0 || a.ativos,
      best:'Menos perdas', worst:'Mais perdas', hint:'Número absoluto de pacientes perdidos no período.'},
    {id:'faltas', k:'taxa_falta', l:'Faltas nas sessões', high:false, f:pctf, need:a.atendimentos, min:p => p.sessoes + p.faltas >= 10,
      best:'Pacientes mais assíduos', worst:'Mais faltas', hint:'Faltas ÷ sessões agendadas (mínimo de 10).'},
    {id:'nota', k:'nota', l:'Satisfação', high:true, f:v => 'nota ' + fmt(v), need:a.avaliacoes, min:p => p.n_aval >= 3,
      best:'Mais bem avaliados', worst:'Pior avaliados', hint:'Nota média de satisfação (mínimo de 3 avaliações).'},
    {id:'fat', k:'faturamento', l:'Faturamento', high:true, f:money, need:a.atendimentos && a.valores, min:p => p.sessoes > 0,
      best:'Maior faturamento', worst:'Menor faturamento', hint:'Soma das sessões realizadas no período.'},
    {id:'carteira', k:'carteira', l:'Carteira', high:true, f:v => v + ' pacientes', need:a.ativos, min:p => p.carteira > 0,
      best:'Maiores carteiras', worst:'Menores carteiras', hint:'Pacientes ativos hoje.'},
    {id:'ag_atend', k:'ag_atend', l:'Atendimentos/semana', high:true, f:v => v + ' atend.', need:!!AG && !AG.vazio, min:p => p.ag_atend != null,
      best:'Quem mais atende', worst:'Quem menos atende', hint:'Pacientes agendados por semana na agenda das unidades (cada vaga de grupo conta). Veja mais na aba Agenda.'},
    {id:'ag_novos', k:'ag_novos', l:'Pacientes novos', high:true, f:v => v + ' novos', need:!!AG && !AG.vazio, min:p => p.ag_atend != null,
      best:'Mais pacientes novos', worst:'Menos pacientes novos', hint:'Pacientes marcados como "paciente de entrada" na agenda atual.'},
  ];
}
const modBadge = p => p.modalidade === 'grupo' ? '<span class="modbadge" title="Atende só em grupo">GRUPO</span>' : p.modalidade === 'misto' ? '<span class="modbadge misto" title="Atende individual e em grupo">MISTO</span>' : '';
function podiumHtml(top, d, bad){
  if (!top.length) return '<div class="empty" style="grid-column:1/-1">Sem profissionais suficientes para esta métrica</div>';
  return [1,0,2].filter(i => top[i]).map(i => { const p = top[i]; return `
    <div class="pod p${i+1}" data-p="${p.id}">
      <div class="badge">${avatar(p,'xl')}<i>${i+1}</i></div>
      <div class="val">${esc(d.f(p[d.k]))}</div>
      <div class="block"><div class="n">${esc(p.nome)}</div><div class="e">${esc(p.esp)}</div><div class="medal">${bad ? (i===0?'🚩':'') : (i===0?'🏆':'🏅')}</div></div>
    </div>`; }).join('');
}
function rkRows(list, d, start){
  return `<thead><tr><th class="num">#</th><th>Profissional</th><th class="num">${esc(d.l)}</th><th class="num">Saídas</th><th class="num">Em grupo</th><th class="num">Evitáveis</th></tr></thead><tbody>` +
    list.map((p,i) => `<tr class="click" data-p="${p.id}"><td class="num">${start + i}</td><td>${who(p)}</td><td class="num"><b>${esc(d.f(p[d.k]))}</b></td><td class="num">${p.saidas}</td><td class="num">${p.saidas_grupo || '—'}</td><td class="num">${pctf(p.pct_evitaveis)}</td></tr>`).join('') + '</tbody>';
}
function rRanking(){
  const defs = rkDefs();
  const se = $('rkEsp'), cur = se.value;
  se.innerHTML = '<option value="">Todas (cada um vs sua área)</option>' + META.especialidades.map(e => `<option value="${e.id}" ${String(e.id)===cur?'selected':''}>${esc(e.nome)}</option>`).join('');
  $('rkMetric').innerHTML = defs.map(d => `<button data-m="${d.id}" class="${d.id===rkMetric?'on':''}" ${d.need===false?'disabled title="Sem dados — importe na aba Importar" style="opacity:.45"':''}>${d.l}</button>`).join('');
  $('rkMetric').querySelectorAll('button').forEach(b => b.onclick = () => { rkMetric = b.dataset.m; rRanking(); });
  const d = defs.find(x => x.id === rkMetric && x.need !== false) || defs[1];
  let hint = esc(d.hint);
  if (d.id === 'score' && D.profissionais.every(p => Object.keys(p.score_partes || {}).length <= 1))
    hint += ' <b>Hoje o score usa só as perdas evitáveis em atendimento individual</b>; importe carteira, atendimentos e avaliações para completá-lo.';
  if (D.kpis.saidas_com_grupo) hint += ` · ${D.kpis.saidas_com_grupo} saídas envolvem atendimento em grupo — use o filtro <b>Modalidade</b> para separar.`;
  $('rkHint').innerHTML = hint;
  const list = D.profissionais.filter(p => p[d.k] != null && (!cur || String(p.esp_id) === cur) && (!d.min || d.min(p)))
    .sort((a,b) => (d.high ? b[d.k] - a[d.k] : a[d.k] - b[d.k]) || (d.high ? a.saidas - b.saidas : b.saidas - a.saidas));
  const n = Math.min(15, Math.ceil(list.length / 2));
  const best = list.slice(0, n), worst = [...list].reverse().slice(0, n);
  $('rkBestT').textContent = d.best; $('rkWorstT').textContent = d.worst;
  $('rkWorstH').textContent = `${list.length} profissionais elegíveis`;
  if (d.onlyWorst){
    $('rkBestH').textContent = '';
    $('podBest').innerHTML = `<div class="empty" style="grid-column:1/-1">Para saber <b>quem mais mantém pacientes</b> é preciso a carteira ativa: sem ela, ter poucas saídas pode ser só ter poucos pacientes.<br><br><a class="btn primary" href="#importar">Importar pacientes ativos</a><br><br>Enquanto isso, veja a métrica <b>Perdas evitáveis</b>.</div>`;
    $('rkBest').innerHTML = '';
  } else {
    $('rkBestH').textContent = `${list.length} profissionais elegíveis`;
    $('podBest').innerHTML = podiumHtml(best.slice(0,3), d, false);
    $('rkBest').innerHTML = rkRows(best.slice(3), d, 4);
  }
  $('podWorst').innerHTML = podiumHtml(worst.slice(0,3), d, true);
  $('rkWorst').innerHTML = rkRows(worst.slice(3), d, 4);
  ['podBest','rkBest','podWorst','rkWorst'].forEach(id => bindProfClicks($(id)));
}

/* ---------------- AGENDA ---------------- */
const DIAS = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const PERIODOS = {manha:'Manhã', tarde:'Tarde', noite:'Noite'};
const agBadge = {novo:['Novo','var(--good)'], retorno:['Retorno','var(--s3)'], saida:['De saída','var(--bad)'], ajuste:['Ajuste','var(--warn)'], sem_aut:['Sem aut.','var(--s6)'], congelado:['Congelado','var(--muted)']};
const agTag = k => `<span class="agb" style="background:${agBadge[k][1]}">${agBadge[k][0]}</span>`;
function agQs(){
  const p = new URLSearchParams();
  const u = $('agUni')?.value; if (u) p.set('unidade', u);
  if ($('fEsp').value) p.set('esp', $('fEsp').value);
  return p.toString();
}
function mergeAgenda(){
  SALAS = null; SALA_KEY = null;   // recarrega o quadro por sala depois de importar ou trocar a unidade
  const byId = {}; (AG?.profissionais || []).forEach(x => byId[x.id] = x);
  D.profissionais.forEach(p => { const x = byId[p.id]; p.ag_atend = x ? x.atendimentos : null; p.ag_novos = x ? x.novos : null; p.ag = x || null; });
}
let agMetric = 'atend', agLs = 'novos', agSort = {k:'atendimentos', d:-1};
function agDefs(){
  const k = AG.kpis, comp = AG.versoes.some(v => v.anterior);
  return [
    {id:'atend', k:'atendimentos', l:'Atendimentos', high:true, f:v => v + ' atend./sem', best:'Quem mais atende', worst:'Quem menos atende',
      hint:'Pacientes agendados por semana (cada vaga de grupo conta como um atendimento; congelados não contam).'},
    {id:'pac', k:'pacientes', l:'Pacientes', high:true, f:v => v + ' pacientes', best:'Mais pacientes diferentes', worst:'Menos pacientes', hint:'Pacientes diferentes na agenda da semana.'},
    {id:'novos', k:'novos', l:'Pacientes novos', high:true, f:v => v + ' novos', best:'Mais pacientes novos', worst:'Menos pacientes novos', min:p => p.atendimentos >= 5,
      hint:'Pacientes marcados como "PACIENTE DE ENTRADA" / "PCT DE ENTRADA". Mínimo de 5 atendimentos na semana.'},
    {id:'perdas', k:'perdas', l:'Perdas', high:false, f:v => v + ' saindo', best:'Menos perdas', worst:'Mais perdas', min:p => p.atendimentos >= 5,
      hint:'Pacientes marcados "DE SAÍDA" / "VAI SAIR"' + (comp ? ' + pacientes que estavam na agenda anterior e não estão mais.' : '. Importe a agenda de novo nas próximas semanas para ver também quem sumiu da agenda.') + ' Para o histórico de saídas, veja a aba Perdas.'},
    {id:'ocup', k:'ocupacao', l:'Ocupação', high:true, f:pctf, best:'Agenda mais cheia', worst:'Mais horários vagos', min:p => p.horarios + p.vagos >= 5,
      hint:'Horários com paciente ÷ (horários com paciente + horários vazios). Horários "fechado" não entram.'},
    {id:'vagos', k:'vagos', l:'Horários vagos', high:false, f:v => v + ' vagos', best:'Menos horários vagos', worst:'Mais horários vagos', min:p => p.horarios + p.vagos >= 5,
      hint:'Horários sem paciente na grade da semana (não conta os marcados como fechado).'},
  ];
}
function agRows(list, d, start){
  return `<thead><tr><th class="num">#</th><th>Profissional</th><th class="num">${esc(d.l)}</th><th class="num">Atend.</th><th class="num">Novos</th><th class="num">Perdas</th></tr></thead><tbody>` +
    list.map((p,i) => `<tr class="click" data-p="${p.id}"><td class="num">${start + i}</td><td>${who(p)}</td><td class="num"><b>${esc(d.f(p[d.k]))}</b></td><td class="num">${p.atendimentos}</td><td class="num">${p.novos || '—'}</td><td class="num">${p.perdas || '—'}</td></tr>`).join('') + '</tbody>';
}
function rAgenda(){
  const sel = $('agUni'), cur = sel.value;
  sel.innerHTML = '<option value="">Todas</option>' + (AG.unidades || []).map(u => `<option ${u.unidade===cur?'selected':''}>${esc(u.unidade)}</option>`).join('');
  const parts = ['agKpis','agMetric','agPodBest','agBest','agPodWorst','agWorst','agGrade','agAreas','agLista','agTabela','agLsTabs'];
  if (AG.vazio){
    $('agInfo').textContent = 'Nenhuma agenda importada ainda';
    $('agVazio').innerHTML = `<div class="card"><div class="empty" style="padding:40px 20px">
      <div style="font-size:40px">📅</div>
      <h2 style="margin:8px 0 6px;color:var(--text)">Nenhuma agenda importada ainda</h2>
      <div style="max-width:560px;margin:0 auto 16px">Importe a planilha de agenda de cada unidade (AGENDA VILA, AGENDA FELICITTÁ) para ver quem atende mais, quem atende menos, quem tem pacientes novos e quem está perdendo pacientes. Importe de novo toda semana para acompanhar quem saiu da agenda.</div>
      <a class="btn primary" href="#importar">⬆ Importar agenda</a></div></div>`;
    parts.forEach(id => $(id).innerHTML = '');
    $('agConteudo').style.display = 'none';
    return;
  }
  $('agVazio').innerHTML = '';
  $('agConteudo').style.display = 'grid';
  $('agInfo').innerHTML = AG.versoes.map(v => `<b>${esc(v.unidade)}</b>: agenda de ${dataL(v.data_ref)}${v.anterior ? ` (comparada com ${dataL(v.anterior)})` : ''}`).join(' · ') +
    ($('fEsp').value ? ' · filtrando pela área escolhida no topo' : '');
  const k = AG.kpis, comp = AG.versoes.some(v => v.anterior);
  $('agKpis').innerHTML =
    kpi('cal', 'Atendimentos por semana', fmt(k.atendimentos), `${fmt(k.horarios)} horários ocupados`) +
    kpi('users', 'Pacientes na agenda', fmt(k.pacientes), `${k.profissionais} profissionais`) +
    kpi('pct', 'Ocupação dos horários', pctf(k.ocupacao), `${fmt(k.vagos)} horários vagos · ${fmt(k.fechados)} fechados`) +
    kpi('users', 'Pacientes novos', fmt(k.novos), 'marcados "de entrada"') +
    kpi('out', 'De saída', fmt(k.saidas), comp ? `+ ${k.saiu_agenda} saíram da agenda desde a anterior` : 'marcados "de saída" / "vai sair"') +
    kpi('pct', 'Sem autorização', fmt(k.sem_aut), `${k.ajustes} em ajuste · ${k.congelados} congelados`) +
    kpi('users', 'Vagas livres em grupo', fmt(k.vagas_grupo), 'linhas numeradas vazias nas oficinas');

  // ranking
  const defs = agDefs();
  $('agMetric').innerHTML = defs.map(d => `<button data-m="${d.id}" class="${d.id===agMetric?'on':''}">${d.l}</button>`).join('');
  $('agMetric').querySelectorAll('button').forEach(b => b.onclick = () => { agMetric = b.dataset.m; rAgenda(); });
  const d = defs.find(x => x.id === agMetric) || defs[0];
  $('agRkHint').textContent = d.hint;
  const prof = AG.profissionais.map(p => ({...p, foto_url:p.foto}));
  const incluiAT = $('agAT').checked;
  const list = prof.filter(p => p[d.k] != null && (!d.min || d.min(p)) && (incluiAT || !/acompanhamento terap/i.test(p.esp)))
    .sort((a,b) => (d.high ? b[d.k] - a[d.k] : a[d.k] - b[d.k]) || b.atendimentos - a.atendimentos);
  const n = Math.min(15, Math.ceil(list.length / 2));
  const best = list.slice(0, n), worst = [...list].reverse().slice(0, n);
  $('agBestT').textContent = d.best; $('agWorstT').textContent = d.worst;
  $('agBestH').textContent = $('agWorstH').textContent = `${list.length} profissionais`;
  $('agPodBest').innerHTML = podiumHtml(best.slice(0,3), d, false); $('agBest').innerHTML = agRows(best.slice(3), d, 4);
  $('agPodWorst').innerHTML = podiumHtml(worst.slice(0,3), d, true); $('agWorst').innerHTML = agRows(worst.slice(3), d, 4);

  // grade dia × período
  const pers = Object.keys(PERIODOS).filter(p => [1,2,3,4,5,6].some(di => AG.grade[di + '|' + p]));
  const dias = [1,2,3,4,5,6].filter(di => pers.some(p => AG.grade[di + '|' + p]));
  heat('agGrade', dias, pers, (r,c) => AG.grade[r + '|' + c] || 0, r => DIAS[r], c => PERIODOS[c]);

  // áreas
  $('agAreas').innerHTML = `<thead><tr><th>Área</th><th class="num">Prof.</th><th class="num">Atend.</th><th class="num">Por prof.</th><th class="num">Ocupação</th><th class="num">Novos</th><th class="num">Perdas</th></tr></thead><tbody>` +
    AG.areas.map(a => `<tr class="click ${areaSel(a.id)}" data-e="${a.id}" ${AREA_TIP}><td><span class="tag"><span class="sw" style="background:${espColor(a.id)}"></span>${esc(a.nome)}</span></td><td class="num">${a.profissionais}</td><td class="num">${a.atendimentos}</td><td class="num">${fmt(a.por_prof)}</td><td class="num">${pctf(a.ocupacao)}</td><td class="num">${a.novos}</td><td class="num">${a.perdas}</td></tr>`).join('') + '</tbody>';
  $('agAreas').querySelectorAll('tr[data-e]').forEach(tr => tr.onclick = () => alternaArea(tr.dataset.e, tr.querySelector('td').textContent.trim()));

  rAgLista(); rAgTabela(); rSala();
  ['agPodBest','agBest','agPodWorst','agWorst'].forEach(id => bindProfClicks($(id)));
}
/* --- acompanhamento por sala / área --- */
let salaModo = 'area', salaValor = {area:null, sala:null}, SALAS = null, SALAS_UNI = null, SALA = null, SALA_KEY = null;
const diaCurto = d => DIAS[d].slice(0, 3);
async function rSala(){
  const uni = $('agUni').value;
  if (!SALAS || SALAS_UNI !== uni) { SALAS = await api('api/agenda/salas?' + new URLSearchParams(uni ? {unidade:uni} : {})); SALAS_UNI = uni; }
  $('agSalaModo').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === salaModo));
  const ops = salaModo === 'area' ? SALAS.areas : SALAS.salas;
  if (!ops.some(o => o.valor === salaValor[salaModo]))
    salaValor[salaModo] = (ops.find(o => /fonoaudiologia/i.test(o.nome)) || ops[0])?.valor ?? null;
  $('agSalaSel').innerHTML = ops.map(o => `<option value="${esc(o.valor)}" ${o.valor === salaValor[salaModo] ? 'selected' : ''}>${esc(o.nome)} — ${o.atendimentos} atend. · ${o.terapeutas} terapeuta(s)${uni ? '' : ' · ' + esc(o.unidades.join('/'))}</option>`).join('');
  if (!salaValor[salaModo]) return;
  const key = [uni, salaModo, salaValor[salaModo]].join('|');
  if (SALA_KEY !== key) {
    SALA = await api('api/agenda/sala?' + new URLSearchParams({modo:salaModo, valor:salaValor[salaModo], ...(uni ? {unidade:uni} : {})}));
    SALA_KEY = key;
    const profs = [...new Map(SALA.map(s => [s.prof_id, s.prof])).entries()].sort((a,b) => a[1].localeCompare(b[1]));
    const cur = $('agSalaProf').value;
    $('agSalaProf').innerHTML = '<option value="">Todos os terapeutas</option>' + profs.map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join('');
    $('agSalaProf').value = profs.some(([id]) => String(id) === cur) ? cur : '';
  }
  rSalaConteudo();
}
function rSalaConteudo(){
  const uni = $('agUni').value, pf = $('agSalaProf').value, q = norm($('agSalaBusca').value);
  const flags = p => Object.keys(agBadge).filter(k => +p[k]);
  // terapeutas (sempre da sala inteira)
  const ter = {};
  SALA.forEach(s => {
    const t = ter[s.prof_id] ??= {id:s.prof_id, nome:s.prof, esp:s.esp, esp_id:s.esp_id, foto_url:s.foto, atend:0, pacs:new Set(), hor:0, vagos:0, novos:new Set(), saida:new Set(), unis:new Set()};
    t.unis.add(s.unidade);
    if (s.situacao === 'ocupado') t.hor++; else if (s.situacao === 'vago') t.vagos++;
    s.pacientes.forEach(p => { if (!+p.congelado) t.atend++; t.pacs.add(p.paciente_id); if (+p.novo) t.novos.add(p.paciente_id); if (+p.saida) t.saida.add(p.paciente_id); });
  });
  const ters = Object.values(ter).sort((a,b) => b.atend - a.atend);
  $('agSalaTer').innerHTML = `<thead><tr><th>Terapeuta</th><th class="num">Atend./sem</th><th class="num">Pacientes</th><th class="num">Horários</th><th class="num">Vagos</th><th class="num">Novos</th><th class="num">De saída</th><th></th></tr></thead><tbody>` +
    ters.map(t => `<tr class="click ${String(t.id) === pf ? 'sel' : ''}" data-t="${t.id}"><td>${who({...t, esp: t.esp + (uni ? '' : ' · ' + [...t.unis].join('/'))})}</td><td class="num"><b>${t.atend}</b></td><td class="num">${t.pacs.size}</td><td class="num">${t.hor}</td><td class="num">${t.vagos || '—'}</td><td class="num">${t.novos.size || '—'}</td><td class="num">${t.saida.size || '—'}</td><td><a href="#" data-p="${t.id}" title="Abrir ficha">ficha</a></td></tr>`).join('') + '</tbody>';
  $('agSalaTer').querySelectorAll('tr[data-t]').forEach(tr => tr.onclick = e => { if (e.target.closest('[data-p]')) return; $('agSalaProf').value = $('agSalaProf').value === tr.dataset.t ? '' : tr.dataset.t; rSalaConteudo(); });
  bindProfClicks($('agSalaTer'));

  // recorte: terapeuta escolhido e busca de paciente
  const slots = SALA.filter(s => !pf || String(s.prof_id) === pf)
    .map(s => ({...s, pacientes: s.pacientes.filter(p => !q || norm(p.nome).includes(q))}))
    .filter(s => !q || s.pacientes.length);
  const pacs = {};
  let atend = 0, hor = 0, vagos = 0;
  slots.forEach(s => {
    if (s.situacao === 'ocupado') hor++; else if (s.situacao === 'vago') vagos++;
    s.pacientes.forEach(p => {
      if (!+p.congelado) atend++;
      const x = pacs[p.paciente_id] ??= {nome:p.nome, horarios:[], ters:new Set(), flags:new Set()};
      x.horarios.push(`${diaCurto(s.dia)} ${s.hora}`); x.ters.add(s.prof); flags(p).forEach(f => x.flags.add(f));
    });
  });
  const pl = Object.values(pacs).sort((a,b) => a.nome.localeCompare(b.nome));
  const nNovos = pl.filter(p => p.flags.has('novo')).length, nSaida = pl.filter(p => p.flags.has('saida')).length;
  $('agSalaKpis').innerHTML =
    kpi('cal', 'Atendimentos por semana', fmt(atend), `${fmt(hor)} horários ocupados`) +
    kpi('users', 'Pacientes', fmt(pl.length), `${nNovos} novos · ${nSaida} de saída`) +
    kpi('users', 'Terapeutas', fmt(pf ? 1 : ters.length), pf ? esc(ter[pf]?.nome || '') : 'atendendo nesta ' + (salaModo === 'area' ? 'área' : 'sala')) +
    kpi('pct', 'Ocupação', pctf(hor + vagos ? 100 * hor / (hor + vagos) : null), `${fmt(vagos)} horários vagos`);
  $('agSalaPac').innerHTML = pl.length ? `<thead><tr><th>Paciente</th><th>Horários</th><th>Terapeuta(s)</th></tr></thead><tbody>` +
    pl.map(p => `<tr><td><b>${esc(p.nome)}</b> ${[...p.flags].map(agTag).join(' ')}</td><td style="font-size:12px">${p.horarios.map(esc).join(', ')}</td><td style="font-size:12px">${[...p.ters].map(esc).join(', ')}</td></tr>`).join('') + '</tbody>'
    : '<tr><td class="empty">Nenhum paciente</td></tr>';

  GRADE_SLOTS = slots; GRADE_UNI = uni; GRADE_BUSCA = !!q;
  rGrade();
}

/* ---------------- grade da semana: três visões ----------------
   Por terapeuta (linha = terapeuta, coluna = dia), Ocupação (mapa hora × dia, clique abre o horário) e Grade (hora × dia enxuta). */
let GRADE_SLOTS = [], GRADE_UNI = '', GRADE_BUSCA = false;
let gradeModo = (() => { try { return localStorage.getItem('agGradeModo') || 'terapeuta'; } catch { return 'terapeuta'; } })();
const agFlags = p => Object.keys(agBadge).filter(k => +p[k]);
const nomeCurto = n => { const w = String(n || '').trim().split(/\s+/); return w.length > 2 ? `${w[0]} ${w[w.length - 1]}` : w.join(' '); };
function gradeSlots(){
  const soMarc = $('agSoMarc').checked, vagos = $('agVagos').checked && !GRADE_BUSCA, ter = norm($('agGradeBusca').value.trim());
  return GRADE_SLOTS.filter(s => (!ter || norm(s.prof).includes(ter)) && (s.pacientes.length ? (!soMarc || s.pacientes.some(p => agFlags(p).length)) : (vagos && !soMarc && s.situacao !== 'fechado')));
}
function rGrade(){
  $('agGradeModo').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === gradeModo));
  $('agGradeLeg').innerHTML = gradeModo === 'mapa'
    ? '<span>Cada horário mostra <b>ocupados / total</b> (fechados não contam). Cor mais forte = mais cheio. Clique num horário para ver quem atende.</span>'
    : `<span class="gc nv">novo</span><span class="gc sd">de saída</span><span class="gc aj">ajuste / retorno / sem aut.</span><span class="gc grp">grupo</span><span class="gc vg">vago</span>`;
  const slots = gradeSlots();
  const box = $('agGradeBox');
  if (!slots.length) { box.innerHTML = `<div class="empty">${$('agGradeBusca').value.trim() ? `Nenhum terapeuta com "${esc($('agGradeBusca').value.trim())}" nesta área ou sala.` : 'Nenhum horário com esses filtros.'}</div>`; return; }
  const dias = [1,2,3,4,5,6].filter(d => GRADE_SLOTS.some(s => s.dia === d));
  if (gradeModo === 'terapeuta') return gradeTerapeuta(box, slots, dias);
  if (gradeModo === 'mapa') return gradeMapa(box, dias);
  return gradeHora(box, slots, dias);
}
// fichinha de um horário: "08:00 Heitor", colorida pela marcação
function gradeChips(s){
  const t = esc(s.hora);
  if (!s.pacientes.length) return `<span class="gc vg" title="Horário vago${s.sala_nome ? ' · ' + esc(s.sala_nome) : ''}">${t} vago</span>`;
  const cls = p => { const f = agFlags(p); return f.includes('saida') ? 'sd' : f.includes('novo') ? 'nv' : f.length ? 'aj' : ''; };
  const tip = p => esc(p.nome) + (agFlags(p).length ? ' · ' + agFlags(p).map(k => agBadge[k][0]).join(', ') : '');
  if (s.modalidade === 'grupo') {
    const f = s.pacientes.map(cls).find(Boolean) || '';
    return `<span class="gc grp ${f}" title="${esc(s.sala_nome || '')} · grupo: ${s.pacientes.map(tip).join('; ')}">${t} grupo (${s.pacientes.length})</span>`;
  }
  return s.pacientes.map(p => `<span class="gc ${cls(p)}" title="${tip(p)}${s.sala_nome ? ' · ' + esc(s.sala_nome) : ''}">${t} ${esc(nomeCurto(p.nome))}</span>`).join('');
}
function gradeTerapeuta(box, slots, dias){
  const T = {};
  slots.forEach(s => {
    const t = T[s.prof_id] ??= {id:s.prof_id, nome:s.prof, esp:s.esp, esp_id:s.esp_id, foto_url:s.foto, unis:new Set(), dias:{}, pac:new Set(), ocup:0, vagos:0};
    t.unis.add(s.unidade); (t.dias[s.dia] ??= []).push(s);
    if (s.pacientes.length) { t.ocup++; s.pacientes.forEach(p => t.pac.add(p.paciente_id)); } else t.vagos++;
  });
  const L = Object.values(T).sort((a, b) => a.nome.localeCompare(b.nome));
  box.innerHTML = `<div class="tablewrap" style="max-height:680px"><table class="aggrid agter"><thead><tr><th>Terapeuta</th>${dias.map(d => `<th>${DIAS[d]}</th>`).join('')}</tr></thead><tbody>` +
    L.map(t => `<tr><td class="agter-who"><a href="#" data-p="${t.id}" style="color:inherit;text-decoration:none">${who({...t, esp: t.esp + (GRADE_UNI ? '' : ' · ' + [...t.unis].join('/'))})}</a>
        <div class="agter-res">${t.pac.size} pacientes · ${t.ocup} horários${t.vagos ? ` · <span class="st-warn">${t.vagos} vagos</span>` : ''}${t.ocup + t.vagos ? ` · ${Math.round(100 * t.ocup / (t.ocup + t.vagos))}%` : ''}</div></td>` +
      dias.map(d => `<td>${(t.dias[d] || []).sort((a, b) => a.hora.localeCompare(b.hora)).map(gradeChips).join('') || '<span style="color:var(--muted)">—</span>'}</td>`).join('') + '</tr>').join('') +
    '</tbody></table></div>';
  bindProfClicks(box);
}
function gradeMapa(box, dias){
  const ter = norm($('agGradeBusca').value.trim());
  const base = GRADE_SLOTS.filter(s => s.situacao !== 'fechado' && (!ter || norm(s.prof).includes(ter)));
  const soMarc = $('agSoMarc').checked;
  const horas = [...new Set(base.map(s => s.hora))].sort();
  const cel = (d, h) => {
    const ss = base.filter(s => s.dia === d && s.hora === h);
    const oc = ss.filter(s => s.pacientes.length), marc = oc.filter(s => s.pacientes.some(p => agFlags(p).length));
    return {tot: ss.length, oc: oc.length, marc: marc.length, pac: oc.reduce((n, s) => n + s.pacientes.length, 0)};
  };
  box.innerHTML = `<div class="tablewrap" style="max-height:520px"><table class="agmapa"><thead><tr><th>Hora</th>${dias.map(d => `<th>${DIAS[d]}</th>`).join('')}</tr></thead><tbody>` +
    horas.map(h => `<tr><td class="num"><b>${h}</b></td>${dias.map(d => { const c = cel(d, h); if (!c.tot) return '<td></td>';
      const r = c.oc / c.tot;
      return `<td><button class="mc" data-d="${d}" data-h="${h}" style="background:color-mix(in srgb, var(--brand) ${Math.round(12 + 70 * r)}%, var(--surface))${r > 0.55 ? ';color:#fff' : ''}" title="${c.oc} de ${c.tot} horários ocupados · ${c.pac} pacientes${c.marc ? ' · ' + c.marc + ' com marcação' : ''}">
        <b>${c.oc}/${c.tot}</b><small>${soMarc ? (c.marc ? c.marc + ' marc.' : '—') : c.pac + ' pac'}</small></button></td>`; }).join('')}</tr>`).join('') +
    `</tbody></table></div>`;
  box.querySelectorAll('.mc').forEach(b => b.onclick = () => gradeMapaPopup(+b.dataset.d, b.dataset.h));
}
// detalhe de um horário do mapa em janela, sem rolar a página
function gradeMapaPopup(d, h){
  const ss = gradeSlots().filter(s => s.dia === d && s.hora === h).sort((a, b) => a.prof.localeCompare(b.prof));
  const oc = ss.filter(s => s.pacientes.length), dlg = $('dlg');
  dlg.innerHTML = `<div class="mhead"><h2 style="flex:1">${DIAS[d]} · ${esc(h)}</h2><span class="hint" style="margin:0">${oc.length} ocupados · ${oc.reduce((n, s) => n + s.pacientes.length, 0)} pacientes${ss.length > oc.length ? ` · ${ss.length - oc.length} vagos` : ''}</span><button class="ghost" id="mClose" aria-label="Fechar">✕</button></div>
    <div class="mbody"><div class="agdet">${ss.map(s => `<div class="agc ${s.modalidade === 'grupo' ? 'grp' : ''} ${s.pacientes.length ? '' : 'vago'}"><div class="agt"><a href="#" data-p="${s.prof_id}" style="color:inherit;text-decoration:none">${esc(s.prof)}</a>${GRADE_UNI ? '' : ` <span>${esc(s.unidade)}</span>`}${s.modalidade === 'grupo' ? ' <span>· grupo</span>' : ''}</div>${s.pacientes.length ? s.pacientes.map(p => `<div>${esc(p.nome)} ${agFlags(p).map(agTag).join(' ')}</div>`).join('') : 'vago'}</div>`).join('') || '<div class="empty">Nada neste horário com esses filtros.</div>'}</div></div>`;
  $('mClose').onclick = () => dlg.close();
  dlg.querySelectorAll('[data-p]').forEach(el => el.onclick = e => { e.preventDefault(); dlg.close(); openProf(+el.dataset.p); });
  if (!dlg.open) dlg.showModal();
}
function gradeHora(box, slots, dias){
  const horas = [...new Set(slots.map(s => s.hora))].sort();
  const MAX = 6;
  const cel = (d, h) => {
    const ss = slots.filter(s => s.dia === d && s.hora === h).sort((a, b) => a.prof.localeCompare(b.prof));
    const linhas = ss.filter(s => s.pacientes.length).map(s => `<div class="agl ${s.modalidade === 'grupo' ? 'grp' : ''}"><b>${esc(nomeCurto(s.prof))}</b>${GRADE_UNI ? '' : ` <span class="agu">${esc(s.unidade)}</span>`} · ${s.modalidade === 'grupo'
        ? `<span title="${esc(s.pacientes.map(p => p.nome).join(', '))}">grupo (${s.pacientes.length})</span> ${[...new Set(s.pacientes.flatMap(agFlags))].map(agTag).join(' ')}`
        : s.pacientes.map(p => `${esc(nomeCurto(p.nome))} ${agFlags(p).map(agTag).join(' ')}`).join(', ')}</div>`);
    const vag = ss.filter(s => !s.pacientes.length);
    if (vag.length) linhas.push(`<div class="agl vg" title="${esc(vag.map(s => s.prof).join(', '))}">vago: ${esc(vag.map(s => nomeCurto(s.prof).split(' ')[0]).join(', '))}</div>`);
    return linhas.length > MAX + 1 ? `<div class="agcel">${linhas.slice(0, MAX).join('')}<div class="agmais" hidden>${linhas.slice(MAX).join('')}</div><button class="agver">+${linhas.length - MAX} mais</button></div>` : linhas.join('');
  };
  box.innerHTML = `<div class="tablewrap" style="max-height:680px"><table class="aggrid aghora"><thead><tr><th>Hora</th>${dias.map(d => `<th>${DIAS[d]}</th>`).join('')}</tr></thead><tbody>` +
    horas.map(h => `<tr><td class="num"><b>${h}</b></td>${dias.map(d => `<td>${cel(d, h)}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>';
  box.querySelectorAll('.agver').forEach(b => b.onclick = () => { const m = b.previousElementSibling; m.hidden = !m.hidden; b.textContent = m.hidden ? `+${m.children.length} mais` : 'mostrar menos'; });
}
function rAgLista(){
  const nome = id => AG.profissionais.find(p => p.id === id)?.nome || '—';
  const tabs = [['novos','Novos', AG.listas.novos], ['saidas','De saída', AG.listas.saidas], ['saiu','Saíram da agenda', AG.movimento.saiu], ['entrou','Entraram na agenda', AG.movimento.entrou],
                ['sem_aut','Sem autorização', AG.listas.sem_aut], ['ajustes','Ajuste / alteração', AG.listas.ajustes], ['congelados','Congelados', AG.listas.congelados]];
  $('agLsTabs').innerHTML = tabs.map(([id,l,xs]) => `<button data-t="${id}" class="${id===agLs?'on':''}">${l} <span style="color:var(--muted)">${xs.length}</span></button>`).join('');
  $('agLsTabs').querySelectorAll('button').forEach(b => b.onclick = () => { agLs = b.dataset.t; rAgLista(); });
  const [, , xs] = tabs.find(t => t[0] === agLs);
  const q = norm($('agLsBusca').value);
  const rows = xs.filter(x => !q || norm(x.paciente + ' ' + nome(x.prof_id)).includes(q));
  const mov = agLs === 'saiu' || agLs === 'entrou';
  $('agLsHint').textContent = mov ? 'Comparação entre a agenda atual e a importada antes dela, por profissional' : 'Marcações feitas na própria agenda';
  $('agLista').innerHTML = rows.length ? `<thead><tr><th>Paciente</th><th>Profissional</th><th>Unidade</th><th>${mov ? 'Entre as agendas de' : 'Horário'}</th><th>${mov ? '' : 'Como está na agenda'}</th></tr></thead><tbody>` +
    rows.map(x => `<tr class="click" data-p="${x.prof_id}"><td><b>${esc(x.paciente)}</b></td><td>${esc(nome(x.prof_id))}</td><td>${esc(x.unidade)}</td>
      <td>${mov ? `${dataL(x.de)} → ${dataL(x.ate)}` : `${DIAS[x.dia]} ${esc(x.hora)}`}</td><td style="color:var(--text-2)">${mov ? '' : esc(x.texto)}${x.data ? ` <span class="tag">${dataL(x.data)}</span>` : ''}</td></tr>`).join('') + '</tbody>'
    : `<tr><td class="empty">${mov && !AG.versoes.some(v => v.anterior) ? 'Só existe uma agenda importada por unidade. Importe a agenda de novo nas próximas semanas para ver quem saiu e quem entrou.' : 'Nenhum paciente nesta lista'}</td></tr>`;
  bindProfClicks($('agLista'));
}
const AG_COLS = [['nome','Profissional'], ['unidades','Unidade'], ['atendimentos','Atend./sem'], ['atend_grupo','Em grupo'], ['pacientes','Pacientes'], ['novos','Novos'],
                 ['saidas','De saída'], ['saiu_agenda','Saíram'], ['entrou_agenda','Entraram'], ['ocupacao','Ocupação'], ['vagos','Vagos'], ['fechados','Fechados'],
                 ['sem_aut','Sem aut.'], ['dias','Dias'], ['saidas_12m','Saídas 12m']];
function agFiltrados(){
  const q = norm($('agBusca').value);
  return AG.profissionais.filter(p => !q || norm(p.nome + ' ' + p.esp).includes(q))
    .sort((a,b) => { const u = a[agSort.k], v = b[agSort.k]; return (typeof u === 'string' || Array.isArray(u) ? String(u).localeCompare(String(v)) : (u ?? -1) - (v ?? -1)) * agSort.d; });
}
function rAgTabela(){
  const rows = agFiltrados();
  $('agTabela').innerHTML = `<thead><tr>${AG_COLS.map(([k,l]) => `<th data-k="${k}" class="${k==='nome'||k==='unidades'?'':'num'}" title="${k==='saidas_12m'?'Saídas registradas na planilha de saídas nos últimos 12 meses':''}">${l}${agSort.k===k?(agSort.d>0?' ▲':' ▼'):''}</th>`).join('')}</tr></thead><tbody>` +
    rows.map(p => `<tr class="click" data-p="${p.id}">${AG_COLS.map(([k]) => k === 'nome' ? `<td>${who({...p, foto_url:p.foto})}</td>` : k === 'unidades' ? `<td>${p.unidades.map(esc).join(', ')}</td>`
      : `<td class="num">${k === 'ocupacao' ? pctf(p[k]) : (p[k] || (k === 'atendimentos' ? 0 : '—'))}</td>`).join('')}</tr>`).join('') + '</tbody>';
  $('agTabela').querySelectorAll('th').forEach(th => th.onclick = () => { agSort = {k:th.dataset.k, d: agSort.k === th.dataset.k ? -agSort.d : (th.dataset.k === 'nome' ? 1 : -1)}; rAgTabela(); });
  bindProfClicks($('agTabela'));
}
function csvAgenda(){
  const head = ['Profissional','Área', ...AG_COLS.slice(1).map(c => c[1])];
  const lines = [head, ...agFiltrados().map(p => [p.nome, p.esp, ...AG_COLS.slice(1).map(([k]) => Array.isArray(p[k]) ? p[k].join(' / ') : (p[k] ?? ''))])];
  const blob = new Blob(['﻿' + lines.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n')], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'agenda_profissionais.csv'; a.click();
}
/** Grade semanal do profissional, para a ficha. */
function agendaGrid(slots){
  if (!slots.length) return '<div class="empty">Este profissional não aparece nas agendas importadas</div>';
  const unis = [...new Set(slots.map(s => s.unidade))];
  return unis.map(u => {
    const ss = slots.filter(s => s.unidade === u);
    const dias = [1,2,3,4,5,6].filter(d => ss.some(s => s.dia === d));
    const horas = [...new Set(ss.map(s => s.hora))].sort();
    const cell = (d, h) => ss.filter(s => s.dia === d && s.hora === h).map(s => {
      if (s.situacao === 'fechado') return `<div class="agc fech" title="${esc(s.obs)}">fechado</div>`;
      if (!s.pacientes.length) return `<div class="agc vago">vago</div>`;
      return `<div class="agc ${s.modalidade === 'grupo' ? 'grp' : ''}" title="${esc(s.sala || '')}${s.aplicadores ? ' · ' + esc(s.aplicadores) : ''}">${s.modalidade === 'grupo' ? `<div class="agg">grupo${s.vagas_grupo ? ` · ${s.vagas_grupo} vaga(s)` : ''}</div>` : ''}` +
        s.pacientes.map(p => `<div>${esc(p.nome)} ${Object.keys(agBadge).filter(k => +p[k]).map(agTag).join(' ')}</div>`).join('') + '</div>';
    }).join('');
    return `${unis.length > 1 ? `<h3 style="margin:10px 0 6px;font-size:13px">${esc(u)}</h3>` : ''}<div class="tablewrap" style="max-height:460px"><table class="aggrid"><thead><tr><th>Hora</th>${dias.map(d => `<th>${DIAS[d]}</th>`).join('')}</tr></thead><tbody>` +
      horas.map(h => `<tr><td class="num"><b>${h}</b></td>${dias.map(d => `<td>${cell(d, h)}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>';
  }).join('');
}

/* ---------------- PAINEL INDIVIDUAL ---------------- */
let indProf = null, indEsp = '';
const navyOpts = horizontal => baseOpts(horizontal);
function linksOf(pid){ return D.saidas.filter(s => s.profs.some(x => x.id === pid && x.conta)); }
function rIndividual(){
  const ps = D.profissionais.filter(p => p.saidas || p.carteira || p.sessoes);
  const espIds = new Set(ps.map(p => p.esp_id));
  $('indEsp').innerHTML = `<button data-e="" class="${indEsp===''?'on':''}">Todas as áreas</button>` +
    META.especialidades.filter(e => espIds.has(e.id)).map(e => `<button data-e="${e.id}" class="${String(e.id)===indEsp?'on':''}">${esc(e.nome)}</button>`).join('');
  $('indEsp').querySelectorAll('button').forEach(b => b.onclick = () => { indEsp = b.dataset.e; indProf = null; rIndividual(); });
  const q = norm($('indBusca').value);
  const lst = ps.filter(p => (!indEsp || String(p.esp_id) === indEsp) && (!q || norm(p.nome).includes(q))).sort((a,b) => b.saidas - a.saidas || a.nome.localeCompare(b.nome));
  if (!indProf || !ps.some(p => p.id === indProf)) indProf = lst[0]?.id ?? ps[0]?.id;
  $('indProfs').innerHTML = lst.map(p => `<button data-id="${p.id}" class="${p.id===indProf?'on':''}" title="${esc(p.nome)} — ${esc(p.esp)}">${esc(p.nome)} <span style="opacity:.7">(${p.saidas})</span></button>`).join('') || '<div style="color:var(--muted);font-size:12px">Nenhum</div>';
  $('indProfs').querySelectorAll('button').forEach(b => b.onclick = () => { indProf = +b.dataset.id; rIndividual(); });
  $('indProfs').querySelector('.on')?.scrollIntoView({block:'nearest'});
  const p = ps.find(x => x.id === indProf);
  if (!p) return;
  const area = D.profissionais.filter(x => x.esp_id === p.esp_id && (x.saidas || x.carteira || x.sessoes));
  const avg = k => mean(area.map(x => x[k]));
  const mine = linksOf(p.id);

  $('indPhoto').innerHTML = `${avatar(p)}<div class="nm">${esc(p.nome)}</div><div class="es">${esc(p.esp)} ${modBadge(p)}</div>
    <div class="es">${p.formacao ? '🎓 ' + esc(p.formacao) : ''}</div><button id="indFicha">Abrir ficha completa</button>`;
  $('indFicha').onclick = () => openProf(p.id);
  const conv = {}; mine.forEach(s => conv[s.convenio || '—'] = (conv[s.convenio || '—'] || 0) + 1);
  const convE = Object.entries(conv).sort((a,b) => b[1] - a[1]);
  $('indMini').innerHTML = `<tr><td colspan="2" style="color:var(--text);font-weight:650;padding-bottom:4px">Perdas por convênio</td></tr>` +
    convE.map(([c,n]) => `<tr><td>${esc(c)}</td><td class="num">${n}</td></tr>`).join('') + `<tr class="tot"><td>Total</td><td class="num">${mine.length}</td></tr>`;

  const a = D.disponivel;
  const cmp = (v, r, low, f = fmt) => r == null || v == null ? '' : `<div class="cmp">média da área ${f(r)} ${status(v, r, low) === 'good' ? '✅' : status(v, r, low) === 'bad' ? '🔻' : '➖'}</div>`;
  const ik = (svg, v, lb, extra = '') => `<div class="ind-kpi">${svg}<div><div class="v">${v}</div><div class="lb">${lb}</div>${extra}</div></div>`;
  const I = {
    out:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>',
    warn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/></svg>',
    cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M9 14l6 4M15 14l-6 4"/></svg>',
    grp:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20a6 6 0 0 1 12 0M10 20a6 6 0 0 1 12 0"/></svg>',
    star:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
    shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    money:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  };
  $('indKpis').innerHTML =
    ik(I.out, fmt(p.saidas), 'Pacientes perdidos', cmp(p.saidas, avg('saidas'), true)) +
    ik(I.warn, pctf(p.pct_evitaveis), 'Perdas evitáveis', cmp(p.pct_evitaveis, avg('pct_evitaveis'), true, pctf)) +
    ik(I.cal, pctf(p.pct_faltas_saida), 'Perdas por faltas', cmp(p.pct_faltas_saida, avg('pct_faltas_saida'), true, pctf)) +
    ik(I.grp, fmt(p.saidas_grupo), 'Perdas em grupo', `<div class="cmp">${pctf(p.pct_grupo)} das perdas</div>`) +
    (a.ativos ? ik(I.shield, pctf(p.taxa_retencao), 'Retenção', cmp(p.taxa_retencao, avg('taxa_retencao'), false, pctf)) : '') +
    (a.avaliacoes ? ik(I.star, fmt(p.nota), 'Satisfação', cmp(p.nota, avg('nota'), false)) : '') +
    (a.atendimentos && a.valores ? ik(I.money, money(p.faturamento), 'Faturamento', cmp(p.faturamento, avg('faturamento'), false, money)) : '') +
    ik(I.star, p.score ?? '—', 'Score na área', '<div class="cmp">0 a 100</div>');

  // linha mensal: profissional × média por profissional da área
  const meses = D.serie.map(s => s.mes);
  const meu = meses.map(m => mine.filter(s => s.data.startsWith(m)).length);
  const nArea = Math.max(1, area.filter(x => x.saidas).length);
  const med = meses.map(m => +(D.saidas.filter(s => s.data.startsWith(m)).reduce((t,s) => t + s.profs.filter(x => x.conta && x.esp_id === p.esp_id).length, 0) / nArea).toFixed(1));
  const o = navyOpts(false);
  o.plugins.pointLabels = {on:true, color:css('--text')};
  o.scales.y.beginAtZero = true; o.scales.y.suggestedMax = Math.max(...meu, ...med) + 1;
  o.plugins.tooltip.mode = 'index'; o.plugins.tooltip.intersect = false;
  draw('cIndMes', {type:'line', data:{labels: meses.map(mesL), datasets:[
    {label:p.nome, data:meu, borderColor:css('--brand'), backgroundColor:css('--brand'), borderWidth:2.5, tension:.4, pointRadius:5, pointHoverRadius:7},
    {label:'Média da área', data:med, borderColor:css('--s2'), backgroundColor:css('--s2'), borderWidth:2, borderDash:[6,4], tension:.4, pointRadius:0, noLabels:true}]}, options:o});

  $('cIndConv').parentElement.style.height = Math.max(160, convE.length * 34 + 40) + 'px';
  const oc = navyOpts(true); oc.layout = {padding:{right:40}};
  draw('cIndConv', {type:'bar', data:{labels: convE.map(c => c[0]), datasets:[bar(convE.map(c => c[1]), css('--s1'), 'Perdas')]}, options:oc});

  const mots = MOT_ORDER.filter(m => p.motivos[m]);
  const om = navyOpts(false); om.plugins.pointLabels = {on:true, color:css('--text')}; om.scales.y.suggestedMax = Math.max(1, ...mots.map(m => p.motivos[m])) + 1;
  om.scales.x.ticks.callback = function(v){ const l = this.getLabelForValue(v); return l.length > 14 ? l.split(' / ') : l; };
  draw('cIndMot', {type:'bar', data:{labels: mots, datasets:[bar(mots.map(m => p.motivos[m]), mots.map(motColor), 'Perdas')]}, options:om});

  $('indBul').innerHTML = profBullets(p);
  $('indPac').innerHTML = mine.length ? `<table><thead><tr><th>Data</th><th>Paciente</th><th>Motivo</th><th>Mod.</th></tr></thead><tbody>${[...mine].reverse().map(s => {
    const l = s.profs.find(x => x.id === p.id);
    return `<tr><td>${dataL(s.data)}</td><td title="${esc(s.texto)}">${esc(s.paciente)}<div style="font-size:11px;color:var(--muted)">${esc(s.convenio || '')} · ${esc(s.texto || '')}</div></td><td><span class="tag"><span class="sw" style="background:${motColor(s.motivo)}"></span>${esc(s.motivo)}</span></td><td>${gTog(s.id, l)}</td></tr>`; }).join('')}</tbody></table>`
    : '<div class="empty">Nenhuma saída no período</div>';
  bindGToggles($('indPac'));
}

/* ---------------- marcação de grupo ---------------- */
function gTog(sid, l){
  const cls = l.mod === 'grupo' ? (l.marcado ? 'on' : 'herdado') : '';
  const tip = l.mod === 'grupo' ? (l.marcado ? (l.grupo ? 'Grupo: ' + l.grupo : 'Marcado como grupo') + ' — clique para marcar como individual' : 'Grupo (padrão do cadastro do profissional) — clique para marcar como individual')
    : 'Individual — clique para marcar como atendimento em grupo';
  return `<button class="gtog ${cls}" data-sid="${sid}" data-pid="${l.id}" data-mod="${l.mod}" title="${esc(tip)}">G</button>`;
}
function bindGToggles(root){
  root.querySelectorAll('.gtog[data-sid]').forEach(b => b.onclick = async e => {
    e.preventDefault(); e.stopPropagation();
    const mod = b.dataset.mod === 'grupo' ? 'individual' : 'grupo';
    await api(`api/saida/${b.dataset.sid}/prof/${b.dataset.pid}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({modalidade: mod})});
    toast(mod === 'grupo' ? 'Marcado como atendimento em grupo' : 'Marcado como atendimento individual', 1800);
    await refresh();
  });
}

/* ---------------- EQUIPE (cards) ---------------- */
function areaAvg(espId, key, filt = p => true){
  return mean(D.profissionais.filter(p => p.esp_id === espId && (p.saidas || p.carteira || p.sessoes) && filt(p)).map(p => p[key]));
}
function bulletRow(label, v, ref, lowerBetter, fmtFn, max, sub){
  const st = status(v, ref, lowerBetter);
  const w = v == null || !max ? 0 : Math.min(100, 100 * v / max), rx = ref == null || !max ? null : Math.min(100, 100 * ref / max);
  return `<div class="bullet"><span class="lb">${label}</span>
    <div class="bar">${v != null ? `<div class="fill bg-${st}" style="width:${w}%"></div>` : ''}${rx != null ? `<div class="ref" style="left:${rx}%" title="média da área: ${fmtFn(ref)}"></div>` : ''}</div>
    <span class="val ${v==null?'':'st-'+st}">${v == null ? '—' : fmtFn(v)}</span>
    <span class="sub">${sub ?? (ref != null ? 'média da área: ' + fmtFn(ref) : '')}</span></div>`;
}
function profBullets(p){
  const a = D.disponivel;
  const all = D.profissionais.filter(x => x.esp_id === p.esp_id);
  const mx = k => Math.max(1, ...all.map(x => x[k] || 0));
  const av = areaAvg(p.esp_id, 'saidas');
  let h = bulletRow('Pacientes perdidos', p.saidas, av, true, fmt, mx('saidas') * 1.1,
    (av != null ? 'média da área: ' + fmt(av) : '') + (p.saidas_grupo ? ` · ${p.saidas_grupo} em grupo` : ''));
  h += bulletRow('Perdas evitáveis', p.pct_evitaveis, areaAvg(p.esp_id, 'pct_evitaveis'), true, pctf, 100);
  h += bulletRow('Perdas por faltas', p.pct_faltas_saida, areaAvg(p.esp_id, 'pct_faltas_saida'), true, pctf, 100);
  if (a.ativos) {
    h += bulletRow('Carteira ativa', p.carteira, p.meta ?? areaAvg(p.esp_id, 'carteira'), false, fmt, Math.max(mx('carteira'), p.meta || 0) * 1.1, p.meta ? 'meta: ' + p.meta : null);
    h += bulletRow('Retenção', p.taxa_retencao, areaAvg(p.esp_id, 'taxa_retencao'), false, pctf, 100);
  }
  if (a.atendimentos) h += bulletRow('Faltas nas sessões', p.taxa_falta, areaAvg(p.esp_id, 'taxa_falta'), true, pctf, 100);
  if (a.avaliacoes) h += bulletRow('Satisfação', p.nota, areaAvg(p.esp_id, 'nota'), false, fmt, 10);
  if (a.atendimentos && a.valores) h += bulletRow('Faturamento', p.faturamento, areaAvg(p.esp_id, 'faturamento'), false, money, mx('faturamento') * 1.1);
  return h;
}
function rEquipe(){
  const q = norm($('pcBusca').value), sort = $('pcSort').value, mov = $('pcMov').checked, sit = $('pcSit').value;
  // filtros de busca e movimento primeiro: os totais por situação respeitam esses filtros
  const base = D.profissionais.filter(p => (!mov || p.saidas || p.carteira || p.sessoes) &&
    (!q || norm([p.nome, p.esp, p.formacao, p.pos, ...p.competencias.map(c => c.nome)].join(' ')).includes(q)));
  let list = base.filter(p => !sit || (sit === 'ativos' ? p.ativo : !p.ativo));
  const nAt = base.filter(p => p.ativo).length, nIn = base.length - nAt;
  $('pcConta').innerHTML = `<div class="seg" role="group" aria-label="Situação">${[['ativos', 'Ativos', nAt], ['inativos', 'Inativos', nIn], ['', 'Todos', base.length]]
      .map(([v, l, n]) => `<button data-sit="${v}" class="${sit === v ? 'on' : ''}">${l} <b>${fmt(n)}</b></button>`).join('')}</div>` +
    `<span class="hint" style="margin:0">${[$('fEsp').value ? 'na área escolhida' : '', mov ? 'só com movimento no período' : '', q ? 'na busca' : ''].filter(Boolean).join(' · ')}` +
    `${list.length > 120 ? `${mov || q || $('fEsp').value ? ' · ' : ''}mostrando os 120 primeiros de ${fmt(list.length)}` : ''}</span>` +
    (!mov && !q && sit !== 'ativos' && D.cadastro && D.cadastro.inativos > nIn
      ? `<span class="hint" style="margin:0">+ ${fmt(D.cadastro.inativos - nIn)} inativos sem nenhum movimento ficam de fora (sem dados para mostrar) — veja todos em <a href="#cadastros">Cadastros</a></span>` : '');
  $('pcConta').querySelectorAll('[data-sit]').forEach(b => b.onclick = () => { $('pcSit').value = b.dataset.sit; rEquipe(); });
  const key = sort.replace('_asc','');
  list.sort((a,b) => sort === 'nome' ? a.nome.localeCompare(b.nome) : sort.endsWith('_asc') ? (a[key] ?? 999) - (b[key] ?? 999) : (b[key] ?? -1) - (a[key] ?? -1));
  $('pcards').innerHTML = list.slice(0, 120).map(p => `
    <div class="pcard" data-p="${p.id}">
      <div class="top">
        <div class="who">${avatar(p,'lg')}<div style="min-width:0"><h3>${esc(p.nome)}</h3><div class="es">${esc(p.esp)} ${modBadge(p)}</div></div></div>
        ${scoreChip(p.score)}
      </div>
      <div class="form">${p.formacao ? '🎓 ' + esc(p.formacao) : '<span style="color:var(--muted)">Formação não cadastrada</span>'}${p.competencias.length ? '<br>' + p.competencias.slice(0,4).map(c => `<span class="tag">${esc(c.nome)}${c.nivel?' · '+c.nivel:''}</span>`).join('') : ''}</div>
      ${profBullets(p)}
    </div>`).join('') || '<div class="empty">Nenhum profissional encontrado</div>';
  bindProfClicks($('pcards'));
}

/* ---------------- ÁREAS ---------------- */
let arSort = {k:'saidas', d:-1};
function rAreas(){
  const a = D.disponivel;
  const cols = [
    ['nome','Área'], ['profissionais','Profissionais'], ['saidas','Saídas'], ['saidas_por_prof','Saídas/prof.'], ['pct_faltas_saida','% por faltas'], ['motivo_top','Motivo principal'],
    ...(a.ativos ? [['carteira','Carteira'], ['taxa_perda','Taxa de perda']] : []),
    ...(a.atendimentos ? [['taxa_falta','Faltas sessões'], ['faturamento','Faturamento'], ['fat_por_prof','Fat./prof.']] : []),
    ...(a.avaliacoes ? [['nps','NPS']] : []), ['score','Score médio'],
  ];
  const f = {saidas_por_prof:fmt, pct_faltas_saida:pctf, taxa_perda:pctf, taxa_falta:pctf, faturamento:money, fat_por_prof:money};
  const rows = [...D.areas].sort((x,y) => { const u = x[arSort.k], v = y[arSort.k]; return (typeof u === 'string' ? u.localeCompare(v) : (u ?? -1) - (v ?? -1)) * arSort.d; });
  $('areasTable').innerHTML = `<thead><tr>${cols.map(([k,l]) => `<th data-k="${k}" class="${k==='nome'||k==='motivo_top'?'':'num'}">${l}${arSort.k===k?(arSort.d>0?' ▲':' ▼'):''}</th>`).join('')}</tr></thead><tbody>` +
    rows.map(x => `<tr class="click ${areaSel(x.id)}" data-e="${x.id}" ${AREA_TIP}>${cols.map(([k]) => k === 'nome' ? `<td><span class="tag"><span class="sw" style="background:${espColor(x.id)}"></span>${esc(x.nome)}</span></td>`
      : k === 'motivo_top' ? `<td>${x.motivo_top ? `<span class="tag"><span class="sw" style="background:${motColor(x.motivo_top)}"></span>${esc(x.motivo_top)}</span>` : '—'}</td>`
      : `<td class="num">${(f[k] || fmt)(x[k])}</td>`).join('')}</tr>`).join('') + '</tbody>';
  $('areasTable').querySelectorAll('th').forEach(th => th.onclick = () => { arSort = {k:th.dataset.k, d: arSort.k === th.dataset.k ? -arSort.d : -1}; rAreas(); });
  $('areasTable').querySelectorAll('tr[data-e]').forEach(tr => tr.onclick = () => alternaArea(tr.dataset.e, tr.querySelector('td').textContent.trim()));
  const s1 = [...D.areas].filter(x => x.saidas_por_prof != null).sort((x,y) => y.saidas_por_prof - x.saidas_por_prof);
  hbar('cAreaSP', s1.map(x => x.nome), s1.map(x => x.saidas_por_prof), s1.map(x => espColor(x.id)), fmt);
  const s2 = [...D.areas].filter(x => x.pct_faltas_saida != null).sort((x,y) => y.pct_faltas_saida - x.pct_faltas_saida);
  hbar('cAreaF', s2.map(x => x.nome), s2.map(x => x.pct_faltas_saida), s2.map(x => espColor(x.id)), v => pctf(v) + '');
  const mots = MOT_ORDER.filter(m => D.motivos.some(x => x[0] === m));
  heat('heatArea', D.areas.map(x => x.nome), mots, (r,c) => D.areas.find(x => x.nome === r).motivos[c] || 0);
}

/* ---------------- PERDAS ---------------- */
function rModalidade(){
  const M = D.modalidade, a = D.disponivel;
  const col = (mod, titulo) => { const x = M[mod], n = x.vinculos_perdidos; const ev = D.evitaveis.reduce((t,k) => t + (x.motivos[k] || 0), 0);
    return `<div class="kpi" style="box-shadow:none"><div class="lb"><b>${titulo}</b></div><div class="v">${fmt(n)}</div><div class="d">perdas (paciente × profissional) · ${x.profissionais} profissionais</div>
      <div class="minibar" style="margin:8px 0">${MOT_ORDER.filter(m => x.motivos[m]).map(m => `<span title="${esc(m)}: ${x.motivos[m]}" style="flex:${x.motivos[m]};background:${motColor(m)}"></span>`).join('')}</div>
      <div class="d">${n ? `${pctf(100 * (x.motivos['Faltas / ausências'] || 0) / n)} por faltas · ${pctf(100 * ev / n)} evitáveis` : 'nenhuma perda registrada nesta modalidade'}${a.ativos ? ` · carteira ${x.carteira}` : ''}</div></div>`; };
  $('modCmp').innerHTML = `<div class="grid g2">${col('individual', 'Individual')}${col('grupo', 'Grupo')}</div>` +
    (!M.grupo.vinculos_perdidos ? `<div class="notice" style="margin-top:10px"><span>👥</span><div>Nenhuma perda está marcada como <b>grupo</b> ainda. Três formas de marcar:<br>1) Na planilha, escreva <b>(G)</b> depois do nome: <code>IURY (G) - ADRIANA</code><br>2) No botão <span class="gtog">G</span> ao lado de cada profissional na lista de saídas abaixo<br>3) Em Cadastros, defina o profissional como <b>Só grupo</b> (todas as perdas dele contam como grupo) ou <b>Misto</b>.</div></div>` : '');
  const G = D.grupos;
  $('grpTable').innerHTML = G.length ? `<div class="tablewrap" style="max-height:300px"><table><thead><tr><th>Grupo</th><th>Profissional</th><th>Dia/horário</th><th class="num">Capac.</th>${a.ativos?'<th class="num">Ativos</th>':''}<th class="num">Perdas</th></tr></thead><tbody>${G.map(g => `<tr class="click" data-p="${g.profissional_id}"><td>${esc(g.nome)}${g.ativo ? '' : ' <span class="st-bad">(inativo)</span>'}</td><td>${esc(g.profissional)}<div style="font-size:11px;color:var(--muted)">${esc(g.esp)}</div></td><td>${esc(g.dia_horario || '—')}</td><td class="num">${g.capacidade ?? '—'}</td>${a.ativos?`<td class="num">${g.carteira}</td>`:''}<td class="num">${g.saidas}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="empty">Nenhum grupo cadastrado. Em <a href="#cadastros">Cadastros</a>, abra o profissional e adicione os grupos que ele conduz (nome, dia/horário, capacidade). Depois, na ficha do profissional, associe cada paciente que saiu ao grupo.</div>`;
  bindProfClicks($('grpTable'));
}
function rPerdas(){
  rModalidade();
  const cv = D.convenios;
  $('cConv').parentElement.style.height = Math.max(160, cv.length * 32 + 60) + 'px';
  const o = baseOpts(true); o.scales.x.stacked = o.scales.y.stacked = true;
  o.plugins.legend = {display:true, position:'top', align:'start', labels:{color:css('--text-2'), boxWidth:10, boxHeight:10, useBorderRadius:true, borderRadius:3}};
  o.plugins.tooltip.mode = 'index';
  draw('cConv', {type:'bar', data:{labels: cv.map(c => c.nome), datasets:[
    {...bar(cv.map(c => c.faltas), motColor('Faltas / ausências'), 'Por faltas'), borderRadius:0, borderSkipped:false},
    {...bar(cv.map(c => c.saidas - c.faltas), css('--muted'), 'Outros motivos'), borderSkipped:false}]}, options:o});
  const mots = MOT_ORDER.filter(m => D.motivos.some(x => x[0] === m));
  heat('heatConv', cv.map(c => c.nome), mots, (r,c) => D.saidas.filter(s => s.convenio === r && s.motivo === c).length, r => r, c => c.split(' /')[0]);

  // por profissional (expansível)
  const q = norm($('plBusca').value);
  const lst = D.profissionais.filter(p => p.saidas && (!q || norm(p.nome + ' ' + p.esp).includes(q)));
  $('perdasProf').innerHTML = lst.slice(0, 60).map(p => {
    const ss = D.saidas.filter(s => s.profs.some(x => x.id === p.id && x.conta));
    return `<details class="ploss"><summary><div class="who">${avatar(p)}<div style="min-width:0"><div class="nm">${esc(p.nome)} ${modBadge(p)}</div><div class="es">${esc(p.esp)}${p.saidas_grupo ? ` · ${p.saidas_grupo} em grupo` : ''} · ${pctf(p.pct_evitaveis)} evitáveis</div></div></div><b class="num" style="text-align:right">${p.saidas}</b>
      <div class="minibar">${Object.entries(p.motivos).sort((a,b)=>MOT_ORDER.indexOf(a[0])-MOT_ORDER.indexOf(b[0])).map(([m,n]) => `<span title="${esc(m)}: ${n}" style="flex:${n};background:${motColor(m)}"></span>`).join('')}</div><span>▾</span></summary>
      <div class="inner"><table><thead><tr><th>Data</th><th>Paciente</th><th>Convênio</th><th>Motivo</th><th>Observação</th></tr></thead><tbody>
      ${ss.map(s => `<tr><td>${dataL(s.data)}</td><td>${esc(s.paciente)} ${gTog(s.id, s.profs.find(x => x.id === p.id))}</td><td>${esc(s.convenio)}</td><td><span class="tag"><span class="sw" style="background:${motColor(s.motivo)}"></span>${esc(s.motivo)}</span></td><td style="max-width:380px">${esc(s.texto)}</td></tr>`).join('')}
      </tbody></table><button style="margin-top:8px" data-p="${p.id}">Abrir ficha do profissional →</button></div></details>`;
  }).join('') || '<div class="empty">Nenhuma saída</div>';
  bindProfClicks($('perdasProf')); bindGToggles($('perdasProf'));

  const sel = $('sdMot'), cur = sel.value;
  sel.innerHTML = '<option value="">Todos os motivos</option>' + mots.map(m => `<option ${m===cur?'selected':''}>${esc(m)}</option>`).join('');
  rSaidasTable();
}
function saidasFiltradas(){
  const q = norm($('sdBusca').value), m = $('sdMot').value;
  return D.saidas.filter(s => (!m || s.motivo === m) && (!q || norm([s.paciente, s.convenio, s.texto, s.motivo, ...s.profs.map(p => p.nome)].join(' ')).includes(q)));
}
function rSaidasTable(){
  const l = saidasFiltradas();
  $('sdCount').textContent = `${l.length} de ${D.saidas.length} saídas no período`;
  $('sdTable').innerHTML = `<thead><tr><th>Data</th><th>Paciente</th><th>Convênio</th><th>Motivo</th><th>Profissionais</th><th>Observação</th></tr></thead><tbody>` +
    [...l].reverse().map(s => `<tr><td>${dataL(s.data)}</td><td>${esc(s.paciente)}</td><td>${esc(s.convenio)}</td>
      <td><span class="tag"><span class="sw" style="background:${motColor(s.motivo)}"></span>${esc(s.motivo)}</span></td>
      <td>${s.profs.map(p => `<span class="tag" style="${p.conta ? '' : 'opacity:.5'}"><a href="#" data-p="${p.id}" style="color:inherit;text-decoration:none">${esc(p.esp)}: ${esc(p.nome)}</a>${gTog(s.id, p)}</span>`).join('')}</td>
      <td style="max-width:360px">${esc(s.texto)}</td></tr>`).join('') + '</tbody>';
  bindProfClicks($('sdTable')); bindGToggles($('sdTable'));
}
function csvSaidas(){
  const rows = [['Data','Paciente','Convênio','Motivo','Observação','Profissionais'], ...saidasFiltradas().map(s => [s.data, s.paciente, s.convenio, s.motivo, s.texto, s.profs.map(p => p.esp + ': ' + p.nome).join(' | ')])];
  const csv = '﻿' + rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g,'""') + '"').join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'})); a.download = 'saidas.csv'; a.click();
}

/* ---------------- PACIENTES ---------------- */
function rPacientes(){
  const a = D.disponivel, P = D.pacientes, k = D.kpis;
  $('pacKpis').innerHTML =
    kpi('users', 'Pacientes ativos', a.ativos ? fmt(k.ativos) : naTxt, '', !a.ativos) +
    kpi('out', 'Pacientes que saíram', fmt(k.pacientes_saida), 'no período') +
    kpi('cal', 'Faltas nas sessões', a.atendimentos ? pctf(k.taxa_falta) : naTxt, a.atendimentos ? `${fmt(k.faltas)} faltas` : '', !a.atendimentos) +
    kpi('out', 'Saíram mais de uma vez', fmt(P.reincidentes.length), 'no período');
  $('pacAntigos').innerHTML = P.antigos.length ? `<div class="tablewrap" style="max-height:420px"><table><thead><tr><th>Paciente</th><th>Desde</th><th class="num">Tempo</th><th>Convênio</th><th>Profissionais</th></tr></thead><tbody>${P.antigos.map(p => `<tr><td>${esc(p.nome)}</td><td>${dataL(p.inicio)}</td><td class="num">${p.dias >= 365 ? fmt(p.dias/365) + ' anos' : Math.round(p.dias/30) + ' meses'}</td><td>${esc(p.convenio)}</td><td>${p.profs.map(n => `<span class="tag">${esc(n)}</span>`).join('')}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="empty">Importe a lista de <b>pacientes ativos</b> com a data de início para ver quem está há mais tempo na clínica. <a href="#importar">Importar →</a></div>`;
  $('pacFaltosos').innerHTML = P.faltosos.length ? `<div class="tablewrap" style="max-height:420px"><table><thead><tr><th>Paciente</th><th class="num">Faltas</th><th class="num">Sessões</th><th class="num">% faltas</th><th>Status</th></tr></thead><tbody>${P.faltosos.map(p => `<tr><td>${esc(p.nome)}</td><td class="num"><b>${p.faltas}</b></td><td class="num">${p.sessoes}</td><td class="num st-${p.taxa>=30?'bad':p.taxa>=15?'warn':'good'}">${pctf(p.taxa)}</td><td>${esc(p.status)}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="empty">Importe os <b>atendimentos</b> (agenda com presença/falta) para acompanhar faltas por paciente. <a href="#importar">Importar →</a></div>`;
  $('pacReinc').innerHTML = P.reincidentes.length ? P.reincidentes.map(p => `<span class="tag">${esc(p.nome)} · ${p.saidas} saídas</span>`).join(' ') : '<div class="empty">Nenhum paciente com mais de uma saída no período</div>';
}

/* ---------------- SATISFAÇÃO ---------------- */
function rSatisfacao(){
  const a = D.disponivel, k = D.kpis;
  $('satKpis').innerHTML = kpi('star', 'NPS', a.avaliacoes ? fmt(k.nps) : naTxt, '', !a.avaliacoes) + kpi('star', 'Nota média', a.avaliacoes ? fmt(k.nota) : naTxt, '', !a.avaliacoes) + kpi('users', 'Respostas', fmt(k.n_aval), 'no período');
  const ar = D.areas.filter(x => x.nps != null).sort((x,y) => y.nps - x.nps);
  if (ar.length) hbar('cNpsArea', ar.map(x => x.nome), ar.map(x => x.nps), ar.map(x => espColor(x.id)), v => fmt(v));
  else { charts.cNpsArea?.destroy(); $('cNpsArea').parentElement.innerHTML = '<canvas id="cNpsArea"></canvas><div class="empty" style="position:absolute;inset:0;display:grid;place-items:center">Sem avaliações importadas. <a href="#importar">Importar →</a></div>'; }
  const pr = D.profissionais.filter(p => p.n_aval >= 3).sort((x,y) => y.nota - x.nota);
  const row = p => `<tr class="click" data-p="${p.id}"><td>${who(p)}</td><td class="num"><b>${fmt(p.nota)}</b></td><td class="num">${p.nps}</td><td class="num">${p.n_aval}</td></tr>`;
  $('satProf').innerHTML = pr.length ? `<table><thead><tr><th>Melhores</th><th class="num">Nota</th><th class="num">NPS</th><th class="num">Resp.</th></tr></thead><tbody>${pr.slice(0,5).map(row).join('')}</tbody>
    <thead><tr><th>A melhorar</th><th></th><th></th><th></th></tr></thead><tbody>${pr.slice(-5).reverse().map(row).join('')}</tbody></table>` : '<div class="empty">Sem dados suficientes</div>';
  bindProfClicks($('satProf'));
  $('satCom').innerHTML = D.avaliacoes.filter(x => x.comentario).slice(0, 30).map(x => `<div style="border-bottom:1px solid var(--grid);padding:8px 0"><span class="score" style="background:${x.nota>=9?'var(--good)':x.nota>=7?'var(--warn)':'var(--bad)'};color:#fff">${x.nota}</span> <b>${esc(x.profissional || 'Clínica')}</b> <span style="color:var(--muted)">· ${dataL(x.data)} · ${esc(x.paciente || '')}</span><div>${esc(x.comentario)}</div></div>`).join('') || '<div class="empty">Sem comentários</div>';
}

/* ---------------- FICHA DO PROFISSIONAL ---------------- */
async function openProf(id){
  const [f, agSlots] = await Promise.all([api('api/profissional/' + id), api('api/agenda/prof/' + id)]);
  const ag = AG?.profissionais?.find(x => x.id === id);
  const p = D.profissionais.find(x => x.id === id) || {...f, esp_id:f.especialidade_id, saidas:0, motivos:{}, competencias:[]};
  const dlg = $('dlg');
  const stars = n => n ? `<span class="stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(5-n)}</span></span>` : '';
  const anos = f.data_admissao ? ((Date.now() - new Date(f.data_admissao)) / 31557600000) : null;
  dlg.innerHTML = `
    <div class="mhead">${avatar({...f, esp_id:f.especialidade_id}, 'lg')}
      <div style="flex:1;min-width:0"><h2>${esc(f.nome)}</h2><div class="es">${esc(f.esp)}${f.registro_conselho ? ' · ' + esc(f.registro_conselho) : ''}${anos != null ? ' · ' + fmt(anos) + ' anos de casa' : ''}${f.ativo ? '' : ' · <b class="st-bad">inativo</b>'}</div></div>
      ${modBadge({modalidade:f.modalidade})}${scoreChip(p.score)}<button id="mInd">Painel individual</button><button id="mEdit">Editar cadastro</button><button class="ghost" id="mClose">✕</button></div>
    <div class="mbody">
      <div class="grid g2">
        <div class="card"><h2>Desempenho no período</h2><div class="hint">Comparado à média de ${esc(f.esp)}</div>${profBullets(p)}
          ${p.score_partes && Object.keys(p.score_partes).length ? `<div class="hint" style="margin-top:10px">Componentes do score: ${Object.entries(p.score_partes).map(([k,v]) => `${({retencao:'retenção',satisfacao:'satisfação',assiduidade:'assiduidade',produtividade:'produtividade'})[k]} ${v}`).join(' · ')}</div>` : ''}</div>
        <div class="card"><h2>Formação e competências</h2>
          <div style="display:grid;gap:6px;margin-top:8px;font-size:13px">
            <div><b>Formação:</b> ${esc(f.formacao) || '<span style="color:var(--muted)">não cadastrada</span>'}</div>
            <div><b>Pós-graduação:</b> ${esc(f.pos_graduacao) || '<span style="color:var(--muted)">—</span>'}</div>
            <div><b>Admissão:</b> ${dataL(f.data_admissao)} · <b>Carga:</b> ${f.carga_horaria_semanal ? fmt(f.carga_horaria_semanal) + 'h/sem' : '—'} · <b>Meta de carteira:</b> ${f.meta_pacientes ?? '—'}</div>
            <div>${f.competencias.length ? f.competencias.map(c => `<span class="tag">${esc(c.nome)} ${stars(c.nivel)}</span>`).join(' ') : '<span style="color:var(--muted)">Nenhuma competência cadastrada — clique em Editar cadastro.</span>'}</div>
            ${f.observacoes ? `<div style="color:var(--text-2)">${esc(f.observacoes)}</div>` : ''}
          </div></div>
      </div>
      <div class="card"><h2>Pacientes que saíram (${f.saidas.length})</h2><div class="hint">Histórico completo, independente do filtro de período. Na coluna <b>Atendimento</b> indique se o paciente era de grupo (e qual).</div>
        ${f.saidas.length ? `<div class="tablewrap" style="max-height:340px"><table><thead><tr><th>Data</th><th>Paciente</th><th>Convênio</th><th>Motivo</th><th>Atendimento</th><th>Observação</th></tr></thead><tbody>${f.saidas.map(s => `<tr><td>${dataL(s.data)}</td><td>${esc(s.paciente)}</td><td>${esc(s.convenio)}</td><td><span class="tag"><span class="sw" style="background:${motColor(s.motivo)}"></span>${esc(s.motivo)}</span></td>
          <td><select class="modsel" data-sid="${s.sid}">
            <option value="" ${!s.modalidade?'selected':''}>Padrão (${f.modalidade === 'grupo' ? 'grupo' : 'individual'})</option>
            <option value="individual" ${s.modalidade==='individual'?'selected':''}>Individual</option>
            <option value="grupo" ${s.modalidade==='grupo'&&!s.grupo_id?'selected':''}>Grupo</option>
            ${f.grupos.map(g => `<option value="grupo:${g.id}" ${s.grupo_id===g.id?'selected':''}>Grupo: ${esc(g.nome)}</option>`).join('')}
          </select></td><td style="max-width:340px">${esc(s.texto)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nenhuma saída registrada</div>'}</div>
      <div class="grid g2">
        <div class="card"><h2>Carteira ativa (${f.carteira.length})</h2>${f.carteira.length ? `<div class="tablewrap" style="max-height:280px"><table><tbody>${f.carteira.map(c => `<tr><td>${esc(c.paciente)}</td><td>${esc(c.convenio)}</td><td>${dataL(c.inicio)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Sem carteira importada</div>'}</div>
        <div class="card"><h2>Avaliações (${f.avaliacoes.length})</h2>${f.avaliacoes.length ? f.avaliacoes.slice(0,15).map(a => `<div style="padding:6px 0;border-bottom:1px solid var(--grid)"><b>${a.nota}</b>/10 <span style="color:var(--muted)">${dataL(a.data)} · ${esc(a.paciente||'')}</span><div>${esc(a.comentario||'')}</div></div>`).join('') : '<div class="empty">Sem avaliações</div>'}</div>
      </div>
      ${agSlots.length ? `<div class="card"><h2>Agenda semanal</h2><div class="hint">${ag ? `${ag.atendimentos} atendimentos/semana · ${ag.pacientes} pacientes · ${ag.novos} novos · ${ag.perdas} de saída · ocupação ${pctf(ag.ocupacao)}` : 'Agenda mais recente de cada unidade'}</div>${agendaGrid(agSlots)}</div>` : ''}
      <div class="card"><div class="card-head"><div><h2>Remuneração</h2><div class="hint" style="margin:0">${f.remuneracao.length ? `${f.remuneracao[0].tipo === 'fixo' ? 'Fixo' : 'Variável'} · vale desde ${dataL(f.remuneracao[0].desde)}${f.remuneracao[0].simulado ? ' · <span class="st-warn">simulado</span>' : ''}` : 'Ainda não cadastrada'}</div></div><button id="mRp">Ver mês a mês / alterar</button></div>
        <div style="font-size:16px;margin-top:4px">${f.remuneracao.length ? `<span class="tag rp-${f.remuneracao[0].tipo}">${RP_TIPO[f.remuneracao[0].tipo]}</span> <b>${rpRegra(f.remuneracao[0])}</b>` : rpRegra(null)}</div></div>
      <div class="card" id="hipoAg"></div>
      ${f.atend_mes.length ? `<div class="card"><h2>Sessões e faltas por mês</h2><div class="chartbox" style="height:220px"><canvas id="cProfAt"></canvas></div></div>` : ''}
    </div>`;
  dlg.showModal();
  hipoAgenda(id);
  $('mClose').onclick = () => dlg.close();
  $('mEdit').onclick = () => editProf(f);
  $('mRp').onclick = () => rpProf(id);
  $('mInd').onclick = () => { indProf = id; indEsp = ''; dlg.close(); location.hash = 'individual'; go(); };
  dlg.querySelectorAll('.modsel').forEach(sel => sel.onchange = async () => {
    const [mod, gid] = sel.value.split(':');
    await api(`api/saida/${sel.dataset.sid}/prof/${id}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({modalidade: mod || null, grupo_id: gid ? +gid : null})});
    toast('Atendimento atualizado', 1500); await refresh();
  });
  if (f.atend_mes.length){
    const o = baseOpts(false); o.plugins.legend = {display:true, labels:{color:css('--text-2'), boxWidth:10}}; o.scales.x.stacked = o.scales.y.stacked = true;
    draw('cProfAt', {type:'bar', data:{labels:f.atend_mes.map(m => mesL(m.mes)), datasets:[bar(f.atend_mes.map(m => m.sessoes), css('--s1'), 'Realizadas'), {...bar(f.atend_mes.map(m => m.faltas), css('--s2'), 'Faltas'), borderSkipped:false}]}, options:o});
  }
}
/* Agenda do Hipo na ficha: semana a semana, com status e evolução de cada sessão */
const HIPO_ST = s => { const n = norm(s);
  return n === 'ATENDIDA' ? 'good' : /^FALT/.test(n) ? 'bad' : /^(DESMARCADA|CANCELAD)/.test(n) ? 'warn' : ''; };
const diaSem = d => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(d + 'T12:00').getDay()];
async function hipoAgenda(id, semana){
  const box = $('hipoAg'); if (!box) return;
  const r = await api(`api/hipo/agenda/${id}` + (semana ? '?semana=' + semana : ''));
  if (!$('hipoAg')) return;
  if (!r.tem) { box.remove(); return; }
  const dc = d => d.split('-').reverse().join('/');
  const fim = new Date(r.semana + 'T12:00'); fim.setDate(fim.getDate() + 5);
  const dias = {}; r.sessoes.forEach(x => (dias[x.data] ??= []).push(x));
  const tot = r.sessoes.length, at = r.sessoes.filter(x => x.status === 'Atendida').length,
        fal = r.sessoes.filter(x => HIPO_ST(x.status) === 'bad').length, sem = r.sessoes.filter(x => x.status === 'Atendida' && x.avaliacao !== 'Avaliada').length,
        pac = new Set(r.sessoes.map(x => x.paciente)).size;
  box.innerHTML = `<div class="card-head"><div><h2>Agenda no Hipo</h2><div class="hint" style="margin:0">Semana de ${dc(r.semana)} a ${dc(fim.toISOString().slice(0, 10))} · ${tot} sessões · ${pac} pacientes · ${at} atendidas · ${fal} faltas${sem ? ` · <b class="st-warn">${sem} sem evolução registrada</b>` : ''}</div></div>
      <div class="filters"><button id="hAnt">‹ Semana anterior</button><input type="date" id="hSem" value="${r.semana}"><button id="hProx">Próxima ›</button></div></div>
    ${tot ? `<div class="tablewrap" style="max-height:420px"><table><thead><tr><th>Dia</th><th>Horário</th><th>Paciente</th><th>Convênio</th><th>Status</th><th>Evolução</th><th>Unidade</th></tr></thead><tbody>${
      Object.entries(dias).map(([d, l]) => l.map((x, i) => `<tr>${i ? '<td></td>' : `<td style="white-space:nowrap"><b>${diaSem(d)}</b> ${dc(d).slice(0, 5)}</td>`}<td>${esc(x.hora_inicio || '')}${x.hora_fim ? '–' + esc(x.hora_fim) : ''}</td><td>${esc(x.paciente || '—')}</td><td>${esc(x.convenio || '—')}</td>
        <td><span class="st-${HIPO_ST(x.status)}">${esc(x.status || '—')}</span></td><td>${x.avaliacao === 'Avaliada' ? '✓' : x.status === 'Atendida' ? '<span class="st-warn">pendente</span>' : `<span style="color:var(--muted)">${esc(x.avaliacao || '')}</span>`}</td><td>${esc(x.unidade || '')}</td></tr>`).join('')).join('')}</tbody></table></div>`
      : '<div class="empty">Nenhuma sessão nesta semana.</div>'}
    <h3 style="margin:16px 0 6px;font-size:14px">Mês a mês no Hipo</h3>
    <div class="tablewrap" style="max-height:300px"><table><thead><tr><th>Mês</th><th class="num">Sessões</th><th class="num">Atendidas</th><th class="num">Faltas</th><th class="num">% faltas</th><th class="num">Desmarcadas</th><th class="num">Pacientes</th><th class="num">Sem evolução</th></tr></thead><tbody>${
      r.meses.map(m => `<tr><td>${mesL(m.mes)}</td><td class="num">${fmt(m.total)}</td><td class="num">${fmt(m.atendidas)}</td><td class="num">${fmt(m.faltas)}</td><td class="num">${pctf(m.atendidas + m.faltas ? Math.round(1000 * m.faltas / (m.atendidas + m.faltas)) / 10 : null)}</td><td class="num">${fmt(m.desmarcadas)}</td><td class="num">${fmt(m.pacientes)}</td><td class="num">${m.sem_evolucao ? `<span class="st-warn">${fmt(m.sem_evolucao)}</span>` : '0'}</td></tr>`).join('')}</tbody></table></div>`;
  $('hAnt').onclick = () => hipoAgenda(id, r.anterior);
  $('hProx').onclick = () => hipoAgenda(id, r.proxima);
  $('hSem').onchange = () => $('hSem').value && hipoAgenda(id, $('hSem').value);
}

function editProf(f){
  const dlg = $('dlg'); const isNew = !f.id;
  const rem = (f.remuneracao || [])[0];
  const comps = (f.competencias || []).map(c => ({...c}));
  const compRow = (c,i) => `<div class="comp-row" data-i="${i}"><input value="${esc(c.nome)}" placeholder="Ex.: ABA, Denver, Bobath, PROMPT…" data-f="nome">
    <select data-f="tipo">${['habilidade','abordagem','certificacao','comportamental'].map(t => `<option ${c.tipo===t?'selected':''}>${t}</option>`).join('')}</select>
    <select data-f="nivel"><option value="">nível</option>${[1,2,3,4,5].map(n => `<option ${c.nivel==n?'selected':''}>${n}</option>`).join('')}</select><button data-del="${i}">✕</button></div>`;
  const v = k => esc(f[k] ?? '');
  const grps = (f.grupos || []).map(g => ({...g}));
  const grpRow = (g,i) => `<div class="grp-row" data-i="${i}"><input data-g="nome" value="${esc(g.nome||'')}" placeholder="Nome do grupo (ex.: Habilidades sociais 6–8 anos)">
    <input data-g="dia_horario" value="${esc(g.dia_horario||'')}" placeholder="Seg/Qua 14h"><input data-g="capacidade" type="number" value="${g.capacidade??''}" placeholder="Vagas">
    <select data-g="ativo"><option value="1" ${g.ativo!==0?'selected':''}>ativo</option><option value="0" ${g.ativo===0?'selected':''}>inativo</option></select><button data-gdel="${i}">✕</button></div>`;
  dlg.innerHTML = `<div class="mhead"><h2 style="flex:1">${isNew ? 'Novo profissional' : 'Editar — ' + esc(f.nome)}</h2><button class="ghost" id="mClose">✕</button></div>
    <div class="mbody"><div class="card"><div class="form-grid" id="pform">
      <label>Nome<input name="nome" value="${v('nome')}" required></label>
      <label>Especialidade<select name="especialidade_id">${META.especialidades.map(e => `<option value="${e.id}" ${e.id===f.especialidade_id?'selected':''}>${esc(e.nome)}</option>`).join('')}</select></label>
      <label>Formação (graduação / instituição)<input name="formacao" value="${v('formacao')}"></label>
      <label>Pós-graduação / especializações<input name="pos_graduacao" value="${v('pos_graduacao')}"></label>
      <label>Registro no conselho<input name="registro_conselho" value="${v('registro_conselho')}" placeholder="CRP 01/12345"></label>
      <label>Data de admissão<input type="date" name="data_admissao" value="${v('data_admissao')}"></label>
      <label>Carga horária semanal (h)<input type="number" name="carga_horaria_semanal" value="${v('carga_horaria_semanal')}"></label>
      <label>Meta de pacientes na carteira<input type="number" name="meta_pacientes" value="${v('meta_pacientes')}"></label>
      <label>Como atende<select name="modalidade">
        <option value="individual" ${(f.modalidade||'individual')==='individual'?'selected':''}>Só individual</option>
        <option value="misto" ${f.modalidade==='misto'?'selected':''}>Individual e grupo (misto)</option>
        <option value="grupo" ${f.modalidade==='grupo'?'selected':''}>Só grupo — todas as perdas contam como grupo</option></select></label>
      <label>Situação<select name="ativo"><option value="1" ${f.ativo!==0?'selected':''}>Ativo</option><option value="0" ${f.ativo===0?'selected':''}>Inativo / desligado</option></select></label>
      <label>Nome completo (Hipo)<input name="nome_completo" value="${v('nome_completo')}"></label>
      <label>Unidade<input name="unidade" value="${v('unidade')}" list="dlUnidades" placeholder="Matriz, Vila…"></label>
      <label>Contratação<select name="contratacao">${['', 'CLT', 'PJ', 'Temporário', 'Estágio'].map(o => `<option value="${o}" ${(f.contratacao || '') === o ? 'selected' : ''}>${o || '—'}</option>`).join('')}</select></label>
      <label>Capacidade semanal (horários)<input type="number" name="capacidade_semanal" value="${v('capacidade_semanal')}" placeholder="vazio = calculada pela carga horária"></label>
      <datalist id="dlUnidades"><option value="Matriz"><option value="Vila"></datalist>
      <div class="full" style="grid-column:1/-1"><div style="font-size:12px;font-weight:600;color:var(--text-2);margin:6px 0">Remuneração ${rem ? `<span style="font-weight:400">— atual: ${RP_TIPO[rem.tipo]}, ${rpRegra(rem)} desde ${dataL(rem.desde)}. Mudou o valor? Altere e escolha a partir de quando vale; o histórico fica guardado.</span>` : '<span style="font-weight:400">— fixo, por hora, por sessão ou percentual. O sistema calcula o pagamento todo mês.</span>'}</div><div id="pRem">${rpFormLinha(rem ? {tipo: rem.tipo, valor: rem.valor} : {tipo:'hora'})}</div></div>
      <label>Foto ${isNew ? '(salve primeiro)' : ''}<input type="file" id="pfoto" accept="image/*" ${isNew?'disabled':''}></label>
      <label class="full">Observações da coordenação<textarea name="observacoes">${v('observacoes')}</textarea></label>
      <div class="full" style="grid-column:1/-1"><div style="font-size:12px;font-weight:600;color:var(--text-2);margin:6px 0">Grupos que conduz</div><div id="grps"></div><button id="addGrp">+ grupo</button></div>
      <div class="full" style="grid-column:1/-1"><div style="font-size:12px;font-weight:600;color:var(--text-2);margin:6px 0">Competências e habilidades (nível 1 a 5)</div><div id="comps">${comps.map(compRow).join('')}</div><button id="addComp">+ competência</button></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">${isNew ? '' : '<button class="danger" id="mDel">Excluir</button><button id="mUnir">Unir com outro cadastro</button>'}<span style="flex:1"></span><button id="mCancel">Cancelar</button><button class="primary" id="mSave">Salvar</button></div></div></div>`;
  if (!isNew) { $('mDel').onclick = e => { e.preventDefault(); excluirProf(f); }; $('mUnir').onclick = e => { e.preventDefault(); unirProf(f); }; }
  const sync = () => $('comps').querySelectorAll('.comp-row').forEach(r => { const c = comps[+r.dataset.i]; r.querySelectorAll('[data-f]').forEach(i => c[i.dataset.f] = i.value); });
  const redraw = () => { $('comps').innerHTML = comps.map(compRow).join(''); $('comps').querySelectorAll('[data-del]').forEach(b => b.onclick = e => { e.preventDefault(); sync(); comps.splice(+b.dataset.del, 1); redraw(); }); };
  redraw();
  const gsync = () => $('grps').querySelectorAll('.grp-row').forEach(r => { const g = grps[+r.dataset.i]; r.querySelectorAll('[data-g]').forEach(i => g[i.dataset.g] = i.value); });
  const gdraw = () => { $('grps').innerHTML = grps.map(grpRow).join(''); $('grps').querySelectorAll('[data-gdel]').forEach(b => b.onclick = e => { e.preventDefault(); gsync(); grps.splice(+b.dataset.gdel, 1); gdraw(); }); };
  gdraw();
  $('addGrp').onclick = e => { e.preventDefault(); gsync(); grps.push({nome:'', ativo:1}); gdraw(); };
  $('addComp').onclick = e => { e.preventDefault(); sync(); comps.push({nome:'', tipo:'habilidade', nivel:''}); redraw(); };
  $('mClose').onclick = $('mCancel').onclick = () => dlg.close();
  const lerRem = rpFormBind($('pRem'));
  $('mSave').onclick = async () => {
    sync(); gsync();
    const nr = lerRem(), mudouRem = nr.valor != null && (!rem || nr.tipo !== rem.tipo || nr.valor !== +rem.valor);
    const body = {}; $('pform').querySelectorAll('[name]').forEach(i => body[i.name] = i.value === '' ? null : (['especialidade_id','ativo','meta_pacientes','capacidade_semanal'].includes(i.name) ? +i.value : i.name === 'carga_horaria_semanal' ? +i.value : i.value));
    if (!body.nome) return toast('Informe o nome');
    body.grupos = grps.filter(g => (g.nome || '').trim()).map(g => ({id:g.id || null, nome:g.nome, dia_horario:g.dia_horario || null, capacidade:g.capacidade ? +g.capacidade : null, ativo:+g.ativo}));
    body.competencias = comps.filter(c => c.nome.trim()).map(c => ({nome:c.nome, tipo:c.tipo, nivel:c.nivel ? +c.nivel : null}));
    const r = await api(isNew ? 'api/profissional' : 'api/profissional/' + f.id, {method: isNew ? 'POST' : 'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
    const file = $('pfoto').files?.[0];
    if (file) await api(`api/profissional/${r.id}/foto`, {method:'POST', headers:{'Content-Type':file.type}, body:file});
    if (mudouRem) await api('api/remuneracao', {method:'POST', headers:JSONH, body: JSON.stringify({...nr, profissional_id:r.id})});
    toast('Cadastro salvo'); await aposSalvar(); if (section === 'cadastros') rCadastros(); openProf(r.id);
  };
  if (!dlg.open) dlg.showModal();
}

/* ---------------- CADASTROS (CRUD) ---------------- */
let CRUD_S = null, CRUD_O = null, cdTab = 'profissionais';
const cdState = {};
const CD_TABS = [['profissionais','Profissionais'],['remuneracao','Remuneração'],['conciliacao','Conciliação Hipo'],['pacientes','Pacientes'],['vinculos','Carteira'],['saidas','Saídas'],
  ['atendimentos','Atendimentos'],['avaliacoes','Avaliações'],['grupos','Grupos'],['especialidades','Áreas'],['convenios','Convênios'],['agenda_versoes','Agendas']];
const JSONH = {'Content-Type':'application/json'};
async function crudLoad(force){ if (!CRUD_S || !CRUD_O || force) [CRUD_S, CRUD_O] = await Promise.all([api('api/crud/schema'), api('api/crud/opcoes')]); }
async function aposSalvar(){ PROFS_ALL = null; LT = null; RP = null; await crudLoad(true); await loadMeta(); await refresh(); }
const sitSel = (id, v) => `<select id="${id}"><option value="ativos" ${v==='ativos'?'selected':''}>Ativos</option><option value="inativos" ${v==='inativos'?'selected':''}>Inativos</option><option value="" ${!v?'selected':''}>Todos</option></select>`;

async function rCadastros(){
  $('cdTabs').innerHTML = CD_TABS.map(([k,l]) => `<button data-t="${k}" class="${k === cdTab ? 'on' : ''}">${l}</button>`).join('');
  $('cdTabs').querySelectorAll('button').forEach(b => b.onclick = () => { cdTab = b.dataset.t; $('cdPane').innerHTML = ''; rCadastros(); });
  const tab = cdTab;
  await crudLoad();
  if (tab !== cdTab || section !== 'cadastros') return;   // trocou de aba enquanto carregava
  if (cdTab === 'profissionais') return cdProfissionais();
  if (cdTab === 'conciliacao') return cdConciliacao();
  return cdTabela(cdTab);
}

/* ----- profissionais ----- */
async function cdProfissionais(){
  const st = cdState.prof ??= {q:'', sit:'ativos', esp:''};
  if (!$('cdBusca')) {
    $('cdPane').innerHTML = `<div class="card">
      <div class="card-head"><div><h2>Profissionais</h2><div class="hint">Cadastro completo. Clique numa linha para editar, excluir ou unir com outro cadastro.</div></div>
        <div class="filters"><input type="search" id="cdBusca" placeholder="Buscar nome, registro, unidade…" value="${esc(st.q)}">
          <label>Situação</label>${sitSel('cdSit', st.sit)}
          <label>Área</label><select id="cdEsp"><option value="">Todas</option>${META.especialidades.map(e => `<option value="${e.id}" ${String(e.id)===st.esp?'selected':''}>${esc(e.nome)}</option>`).join('')}</select>
          <button class="primary" id="cdNovo">+ Novo profissional</button></div></div>
      <div class="hint" id="cdConta" style="margin:0 0 8px"></div>
      <div class="tablewrap"><table id="cdTable"></table></div></div>`;
    $('cdBusca').oninput = deb(() => { st.q = $('cdBusca').value; cdProfissionais(); });
    $('cdSit').onchange = () => { st.sit = $('cdSit').value; cdProfissionais(); };
    $('cdEsp').onchange = () => { st.esp = $('cdEsp').value; cdProfissionais(); };
    $('cdNovo').onclick = () => editProf({especialidade_id: META.especialidades[0]?.id, ativo:1, competencias:[]});
  }
  if (!PROFS_ALL) PROFS_ALL = await api('api/profissionais');
  if (cdTab !== 'profissionais' || !$('cdTable')) return;
  const q = norm(st.q);
  const l = PROFS_ALL.filter(p => (!st.sit || (st.sit === 'ativos' ? p.ativo : !p.ativo)) && (!st.esp || String(p.especialidade_id) === st.esp) &&
    (!q || norm([p.nome, p.nome_completo, p.esp, p.formacao, p.registro_conselho, p.unidade, p.contratacao].join(' ')).includes(q)));
  $('cdConta').textContent = `${fmt(l.length)} profissionais${st.sit === 'ativos' ? ' ativos' : st.sit === 'inativos' ? ' inativos' : ''} · ${fmt(PROFS_ALL.filter(p => p.ativo).length)} ativos no total`;
  const td = v => v == null || v === '' ? '<span style="color:var(--muted)">—</span>' : esc(v);
  $('cdTable').innerHTML = `<thead><tr><th>Profissional</th><th>Nome no Hipo</th><th>Unidade</th><th>Contratação</th><th>Registro</th><th>Admissão</th><th class="num">Carga (h/sem)</th><th class="num">Saídas (total)</th><th>Situação</th></tr></thead><tbody>` +
    l.map(p => `<tr class="click" data-id="${p.id}"><td>${who({...p, esp_id:p.especialidade_id})}</td><td>${td(p.nome_completo)}</td><td>${td(p.unidade)}</td><td>${td(p.contratacao)}</td><td>${td(p.registro_conselho)}</td><td>${dataC(p.data_admissao)}</td><td class="num">${fmt(p.carga_horaria_semanal)}</td><td class="num">${p.n_saidas}</td><td>${p.ativo ? 'Ativo' : '<span class="st-bad">Inativo</span>'}${p.hipo_id ? '' : ' <span class="tag" title="Sem cadastro correspondente no Hipo">sem Hipo</span>'}</td></tr>`).join('') + '</tbody>';
  $('cdTable').querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = async () => editProf(await api('api/profissional/' + tr.dataset.id)));
}

async function excluirProf(f){
  const dep = await api(`api/crud/profissionais/${f.id}/dependencias`);
  const lista = Object.entries(dep).map(([k, n]) => `${n} ${k}`).join(', ');
  if (!confirm(`Excluir ${f.nome} de vez?` + (lista ? `\n\nTambém serão apagados: ${lista}.\nSe for um cadastro duplicado, use "Unir com outro cadastro" para manter o histórico.` : ''))) return;
  await api('api/profissional/' + f.id, {method:'DELETE'});
  $('dlg').close(); toast('Profissional excluído'); await aposSalvar(); if (section === 'cadastros') rCadastros();
}

async function unirProf(f){
  await crudLoad();
  const dlg = $('dlg');
  const ops = CRUD_O.profissionais.filter(o => o.id !== f.id);
  dlg.innerHTML = `<div class="mhead"><h2 style="flex:1">Unir ${esc(f.nome)} com outro cadastro</h2><button class="ghost" id="mClose">✕</button></div>
    <div class="mbody"><div class="card"><div class="hint" style="margin:0 0 10px">Use quando a mesma pessoa está cadastrada duas vezes. Saídas, carteira, agenda, atendimentos, avaliações, grupos e competências de <b>${esc(f.nome)}</b> passam para o cadastro escolhido, os campos vazios dele são completados e este cadastro é apagado.</div>
      <div class="form-grid"><label class="full">Manter o cadastro de<input id="unirAlvo" list="dlUnir" placeholder="Digite o nome…" autocomplete="off"></label></div>
      <datalist id="dlUnir">${ops.map(o => `<option value="${esc(o.label)}">`).join('')}</datalist>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button id="mCancel">Cancelar</button><button class="primary" id="mSave">Unir</button></div></div></div>`;
  $('mClose').onclick = $('mCancel').onclick = () => dlg.close();
  $('mSave').onclick = async () => {
    const alvo = ops.find(o => o.label === $('unirAlvo').value);
    if (!alvo) return toast('Escolha um profissional da lista');
    if (!confirm(`Unir ${f.nome} em ${alvo.label}? Não dá para desfazer.`)) return;
    const r = await api(`api/profissional/${f.id}/unir`, {method:'POST', headers:JSONH, body: JSON.stringify({para: alvo.id})});
    dlg.close(); toast(`Cadastros unidos em ${alvo.label}`); await aposSalvar(); if (section === 'cadastros') rCadastros(); openProf(r.id);
  };
  if (!dlg.open) dlg.showModal();
}

/* ----- conciliação com o Hipo ----- */
async function cdConciliacao(){
  const st = cdState.conc ??= {inativos:false};
  const c = await api('api/conciliacao' + (st.inativos ? '?inativos=1' : ''));
  if (cdTab !== 'conciliacao') return;
  const card = p => {
    const sug = p.sugestoes.map(s => `<button class="unirSug" data-de="${p.id}" data-para="${s.id}" data-nome="${esc(s.nome_completo)}">Unir com <b>${esc(s.nome_completo)}</b> · ${esc(s.esp)}${s.unidade ? ' · ' + esc(s.unidade) : ''}${s.ativo ? '' : ' (inativo no Hipo)'}</button>`).join('');
    return `<div class="card conc"><div class="card-head"><div><h3 style="margin:0">${esc(p.nome)}</h3><div class="hint" style="margin:2px 0 0">${esc(p.esp)} · ${p.vinculos} pacientes na carteira · ${p.saidas} saídas${p.na_agenda ? ' · está na agenda atual' : ''}${p.ativo ? '' : ' · <b class="st-bad">inativo</b>'}</div></div>
      <div class="filters"><button class="concEdit" data-id="${p.id}">Editar</button><button class="concUnir" data-id="${p.id}">Unir com…</button>${p.ativo ? `<button class="concInat" data-id="${p.id}">Marcar inativo</button>` : ''}</div></div>
      <div class="conc-sug">${sug || '<span class="hint" style="margin:0">Nenhum nome parecido no Hipo. Se a pessoa saiu, marque como inativa; se é nova, mantenha.</span>'}</div></div>`;
  };
  $('cdPane').innerHTML = `<div class="notice"><span>🔗</span><div>Profissionais do Profile que não foram encontrados no cadastro do Hipo. Una quando é a mesma pessoa escrita de outro jeito (o histórico é mantido); marque como inativo quando a pessoa já saiu.${c.importado_em ? ` Última importação do Hipo: ${dataL(c.importado_em.slice(0,10))}.` : ''}</div></div>
    <div class="card" style="padding:10px 14px"><div class="filters"><b>${c.pendentes.length}</b>&nbsp;pendentes<label style="margin-left:12px"><input type="checkbox" id="concIna" ${st.inativos?'checked':''}> incluir inativos sem Hipo</label></div></div>
    ${c.pendentes.map(card).join('') || '<div class="empty">Tudo conciliado: todos os ativos estão ligados ao Hipo.</div>'}`;
  $('concIna').onchange = () => { st.inativos = $('concIna').checked; cdConciliacao(); };
  const byId = id => c.pendentes.find(p => p.id === +id);
  $('cdPane').querySelectorAll('.unirSug').forEach(b => b.onclick = async () => {
    const p = byId(b.dataset.de);
    if (!confirm(`Unir "${p.nome}" (${p.esp}) com ${b.dataset.nome}? O histórico passa para o cadastro do Hipo.`)) return;
    await api(`api/profissional/${p.id}/unir`, {method:'POST', headers:JSONH, body: JSON.stringify({para: +b.dataset.para})});
    toast('Cadastros unidos'); await aposSalvar(); cdConciliacao();
  });
  $('cdPane').querySelectorAll('.concUnir').forEach(b => b.onclick = async () => unirProf(await api('api/profissional/' + b.dataset.id)));
  $('cdPane').querySelectorAll('.concEdit').forEach(b => b.onclick = async () => editProf(await api('api/profissional/' + b.dataset.id)));
  $('cdPane').querySelectorAll('.concInat').forEach(b => b.onclick = async () => {
    await api('api/profissional/' + b.dataset.id, {method:'PUT', headers:JSONH, body: JSON.stringify({ativo:0})});
    toast('Marcado como inativo'); await aposSalvar(); cdConciliacao();
  });
}

/* ----- tabelas genéricas ----- */
const dataC = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';   // data completa (dataL mostra dia 1 como mês)
const fkMap = t => Object.fromEntries((CRUD_O[t] || []).map(o => [o.label, o.id]));
const fkLabel = (t, id) => (CRUD_O[t] || []).find(o => o.id === +id)?.label ?? '';
function cdCelula(c, r){
  const v = r[c.k];
  if (c.t.startsWith('fk:') || c.t.startsWith('multi:')) return esc(r[c.k + '_rotulo'] ?? '') || '<span style="color:var(--muted)">—</span>';
  if (c.t === 'bool') return v ? 'Sim' : 'Não';
  if (c.t === 'date') return dataC(v);
  if (c.t === 'num') return v == null ? '—' : fmt(v);
  if (c.t === 'textarea') return esc(String(v ?? '').slice(0, 80)) + (String(v ?? '').length > 80 ? '…' : '');
  return v == null || v === '' ? '<span style="color:var(--muted)">—</span>' : esc(String(v).replace(/_/g, ' '));
}
async function cdTabela(t){
  const S = CRUD_S[t], st = cdState[t] ??= {q:'', pagina:0};
  if (!$('crudBusca') || $('cdPane').dataset.t !== t) {
    $('cdPane').dataset.t = t;
    $('cdPane').innerHTML = `${S.aviso ? `<div class="notice"><span>ℹ️</span><div>${esc(S.aviso)}</div></div>` : ''}<div class="card">
      <div class="card-head"><div><h2>${esc(S.titulo)}</h2><div class="hint" id="crudConta"></div></div>
        <div class="filters"><input type="search" id="crudBusca" placeholder="Buscar…" value="${esc(st.q)}">${S.sem_criar ? '' : '<button class="primary" id="crudNovo">+ Novo</button>'}</div></div>
      <div class="tablewrap"><table id="crudTable"></table></div>
      <div class="filters pager" id="crudPager"></div></div>`;
    $('crudBusca').oninput = deb(() => { st.q = $('crudBusca').value; st.pagina = 0; cdTabela(t); });
    if (!S.sem_criar) $('crudNovo').onclick = () => crudForm(t, null);
  }
  const r = await api(`api/crud/${t}?` + new URLSearchParams({q: st.q, pagina: st.pagina, limite: 100}));
  if (cdTab !== t || !$('crudTable')) return;
  const cols = S.campos;
  $('crudConta').textContent = `${fmt(r.total)} registros${st.q ? ' encontrados' : ''} · clique numa linha para editar ou excluir`;
  $('crudTable').innerHTML = `<thead><tr>${cols.map(c => `<th>${esc(c.l)}</th>`).join('')}${t === 'agenda_versoes' ? '<th class="num">Horários</th>' : ''}</tr></thead><tbody>` +
    (r.linhas.map(x => `<tr class="click" data-id="${x.id}">${cols.map(c => `<td>${cdCelula(c, x)}</td>`).join('')}${t === 'agenda_versoes' ? `<td class="num">${fmt(x.horarios)}</td>` : ''}</tr>`).join('')
     || `<tr><td colspan="${cols.length + 1}" class="empty">Nenhum registro${st.q ? ' com essa busca' : ''}.</td></tr>`) + '</tbody>';
  $('crudTable').querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => crudForm(t, r.linhas.find(x => x.id === +tr.dataset.id)));
  const pags = Math.ceil(r.total / r.limite);
  $('crudPager').innerHTML = pags > 1 ? `<button id="pgAnt" ${st.pagina ? '' : 'disabled'}>‹ Anterior</button><span class="hint" style="margin:0">Página ${st.pagina + 1} de ${pags}</span><button id="pgProx" ${st.pagina + 1 < pags ? '' : 'disabled'}>Próxima ›</button>` : '';
  if (pags > 1) { $('pgAnt').onclick = () => { st.pagina--; cdTabela(t); }; $('pgProx').onclick = () => { st.pagina++; cdTabela(t); }; }
}

function crudCampo(c, v){
  const req = c.req ? ' required' : '', nm = `name="${c.k}"`, rot = esc(c.l) + (c.req ? ' *' : '');
  if (c.t === 'textarea') return `<label class="full">${rot}<textarea ${nm}>${esc(v ?? '')}</textarea></label>`;
  if (c.t === 'date') return `<label>${rot}<input type="date" ${nm} value="${esc(v ?? '')}"${req}></label>`;
  if (c.t === 'int' || c.t === 'num') return `<label>${rot}<input type="number" step="${c.t === 'num' ? '0.01' : '1'}" ${nm} value="${v ?? ''}"${req}></label>`;
  if (c.t === 'bool') return `<label>${rot}<select ${nm}><option value="1" ${v !== 0 ? 'selected' : ''}>Sim</option><option value="0" ${v === 0 ? 'selected' : ''}>Não</option></select></label>`;
  if (c.t.startsWith('sel:')) { const ops = c.t.slice(4).split('|'); return `<label>${rot}<select ${nm}>${(c.req || ops.includes('') ? ops : ['', ...ops]).map(o => `<option value="${esc(o)}" ${String(v ?? '') === o ? 'selected' : ''}>${esc(o.replace(/_/g, ' ') || '—')}</option>`).join('')}</select></label>`; }
  if (c.t.startsWith('fk:')) { const ref = c.t.slice(3); return `<label>${rot}<input ${nm} data-fk="${ref}" data-rot="${esc(c.l)}" list="dl_${ref}" value="${esc(v ? fkLabel(ref, v) : '')}" placeholder="Digite para buscar…" autocomplete="off"${req}></label>`; }
  if (c.t.startsWith('multi:')) { const ref = c.t.slice(6); return `<div class="full" style="grid-column:1/-1"><div style="font-size:12px;font-weight:600;color:var(--text-2);margin:4px 0">${rot}</div>
      <div id="multi_${c.k}" class="chips" data-ref="${ref}"></div><input data-multi="${c.k}" list="dl_${ref}" placeholder="Adicionar profissional…" autocomplete="off" style="margin-top:6px;width:100%"></div>`; }
  return `<label>${rot}<input ${nm} value="${esc(v ?? '')}"${req}></label>`;
}
function crudForm(t, row){
  const S = CRUD_S[t], isNew = !row, dlg = $('dlg');
  const refs = [...new Set(S.campos.filter(c => /^(fk|multi):/.test(c.t)).map(c => c.t.split(':')[1]))];
  const multi = {};
  S.campos.filter(c => c.t.startsWith('multi:')).forEach(c => multi[c.k] = String(row?.[c.k] ?? '').split(',').filter(Boolean).map(Number));
  const padrao = c => c.k === 'status' && t === 'pacientes' ? 'ativo' : c.t === 'bool' ? 1 : null;
  dlg.innerHTML = `<div class="mhead"><h2 style="flex:1">${isNew ? 'Novo — ' : 'Editar — '}${esc(S.titulo)}</h2><button class="ghost" id="mClose">✕</button></div>
    <div class="mbody"><div class="card"><form class="form-grid" id="crudForm" onsubmit="return false">${S.campos.map(c => crudCampo(c, row ? row[c.k] : padrao(c))).join('')}</form>
      ${refs.map(r => `<datalist id="dl_${r}">${(CRUD_O[r] || []).map(o => `<option value="${esc(o.label)}">`).join('')}</datalist>`).join('')}
      <div style="display:flex;gap:8px;margin-top:14px">${isNew ? '' : '<button class="danger" id="mDel">Excluir</button>'}<span style="flex:1"></span><button id="mCancel">Cancelar</button><button class="primary" id="mSave">Salvar</button></div></div></div>`;
  const drawMulti = k => { const el = $('multi_' + k), ref = el.dataset.ref;
    el.innerHTML = multi[k].map(id => `<span class="chip">${esc(fkLabel(ref, id))}<button data-rm="${id}" title="Tirar">✕</button></span>`).join('') || '<span class="hint" style="margin:0">Nenhum</span>';
    el.querySelectorAll('[data-rm]').forEach(b => b.onclick = e => { e.preventDefault(); multi[k] = multi[k].filter(x => x !== +b.dataset.rm); drawMulti(k); }); };
  Object.keys(multi).forEach(k => {
    drawMulti(k);
    const inp = dlg.querySelector(`[data-multi="${k}"]`), ref = $('multi_' + k).dataset.ref;
    inp.onchange = () => { const id = fkMap(ref)[inp.value]; if (id && !multi[k].includes(id)) { multi[k].push(id); drawMulti(k); } inp.value = ''; };
  });
  $('mClose').onclick = $('mCancel').onclick = () => dlg.close();
  $('mSave').onclick = async () => {
    const body = {};
    for (const el of $('crudForm').querySelectorAll('[name]')) {
      if (el.dataset.fk) {
        const v = el.value.trim();
        if (v && !(v in fkMap(el.dataset.fk))) return toast(`Escolha um item da lista em "${el.dataset.rot}"`);
        body[el.name] = v ? fkMap(el.dataset.fk)[v] : null;
      } else body[el.name] = el.value === '' ? null : el.value;
    }
    Object.assign(body, multi);
    try {
      await api(isNew ? `api/crud/${t}` : `api/crud/${t}/${row.id}`, {method: isNew ? 'POST' : 'PUT', headers:JSONH, body: JSON.stringify(body)});
    } catch (e) { return toast('Erro: ' + e.message, 6000); }
    dlg.close(); toast(isNew ? 'Registro criado' : 'Alterações salvas'); await aposSalvar(); cdTabela(t);
  };
  if (!isNew) $('mDel').onclick = async () => {
    const dep = await api(`api/crud/${t}/${row.id}/dependencias`);
    const lista = Object.entries(dep).map(([k, n]) => `${n} ${k}`).join(', ');
    if (!confirm('Excluir este registro de vez?' + (lista ? `\n\nTambém serão apagados: ${lista}.` : ''))) return;
    try { await api(`api/crud/${t}/${row.id}`, {method:'DELETE'}); } catch (e) { return toast('Erro: ' + e.message, 7000); }
    dlg.close(); toast('Registro excluído'); await aposSalvar(); cdTabela(t);
  };
  if (!dlg.open) dlg.showModal();
}

/* ---------------- LOTAÇÃO ---------------- */
let LT = null, LT_UNI = '';
const FONTE = {carga:'carga horária', estimada:'turno na agenda', manual:'informada', sem_dados:'sem dados', apoio:'apoio ABA'};
const ocBar = v => v == null ? '—' : `<div style="display:flex;align-items:center;gap:6px;justify-content:flex-end"><span>${pctf(v)}</span><span class="lt-bar"><i style="width:${Math.min(100, v)}%;background:${v >= 90 ? 'var(--bad)' : v >= 75 ? 'var(--warn)' : 'var(--good)'}"></i></span></div>`;
async function rLotacao(){
  if (!LT || LT.unidade !== LT_UNI) LT = await api('api/lotacao?unidade=' + encodeURIComponent(LT_UNI));
  const L = LT, t = L.totais, ref = L.referencia;
  $('ltUni').innerHTML = '<option value="">Todas</option>' + L.unidades.map(u => `<option ${u === LT_UNI ? 'selected' : ''}>${esc(u)}</option>`).join('');
  if (!ref) {
    $('ltAviso').innerHTML = `<div class="empty">A lotação usa a grade da semana do Hipo. <a class="btn primary" href="#importar">Importar o arquivo do Hipo</a></div>`;
    ['ltKpis','ltAreas','ltProfs'].forEach(id => $(id).innerHTML = ''); return;
  }
  $('ltAviso').innerHTML = `<div class="notice"><span>📐</span><div>Semana de referência: <b>${dataL(ref.de)} a ${dataL(ref.ate)}</b> (grade do Hipo). Capacidade de cada terapeuta ativo: o valor informado à mão; senão a <b>carga horária</b> × ${fmt(L.parametros.sessoes_por_hora)} sessões por hora (grade de ${L.parametros.sessoes_dia} sessões em ${fmt(L.parametros.horas_dia)} h); senão o <b>turno que ele já faz</b> na agenda (do primeiro ao último horário de cada dia). Aplicadores ABA sem agenda própria ficam como apoio.${t.sem_dados ? ` <b>${t.sem_dados} ativos estão sem dados</b> — preencha a carga horária abaixo para o total ficar exato.` : ''}</div></div>`;
  $('ltKpis').innerHTML =
    kpi('users', 'Terapeutas ativos', fmt(t.ativos), `${t.com_agenda} com agenda · ${t.apoio} de apoio (ABA)`) +
    kpi('cal', 'Capacidade semanal', fmt(t.capacidade) + ' <span style="font-size:13px;font-weight:400">horários</span>', `${t.estimados} estimadas pelo turno · ${t.sem_dados} sem dados`) +
    kpi('cal', 'Horários ocupados', fmt(t.ocupados + t.bloqueados), `${fmt(t.bloqueados)} bloqueados · ${fmt(t.livres)} livres`) +
    kpi('pct', 'Ocupação da capacidade', pctf(t.ocupacao), 'ocupados + bloqueados ÷ capacidade') +
    kpi('users', 'Pacientes na semana', fmt(t.pacientes), `${fmt(t.sessoes)} sessões`) +
    kpi('star', 'Lotação máxima', fmt(t.lotacao_pacientes) + ' <span style="font-size:13px;font-weight:400">pacientes</span>', t.vagas_pacientes != null ? `cabem mais ${fmt(t.vagas_pacientes)}` : '');
  $('ltAreas').innerHTML = `<thead><tr><th>Área</th><th class="num">Ativos</th><th class="num">Com agenda</th><th class="num">Capacidade</th><th class="num">Ocupados</th><th class="num">Livres</th><th class="num">Uso da capacidade</th><th class="num">Pacientes</th><th class="num">Horários por paciente</th><th class="num">Vagas</th><th class="num">Lotação máxima</th></tr></thead><tbody>` +
    L.areas.map(a => `<tr class="click ${$('ltEsp').value === String(a.id) ? 'sel' : ''}" data-e="${a.id}" title="Clique para ver só os terapeutas desta área; clique de novo para ver todos"><td><span class="tag"><span class="sw" style="background:${espColor(a.id)}"></span>${esc(a.nome)}</span>${a.sem_dados ? ` <span class="st-warn" title="Ativos sem carga horária nem agenda">· ${a.sem_dados} sem dados</span>` : ''}${a.apoio ? ` <span style="color:var(--muted)">· ${a.apoio} apoio</span>` : ''}</td><td class="num">${a.ativos}</td><td class="num">${a.com_agenda}</td><td class="num">${fmt(a.capacidade)}</td><td class="num">${fmt(a.ocupados + a.bloqueados)}</td><td class="num">${fmt(a.livres)}</td><td class="num">${ocBar(a.ocupacao)}</td><td class="num">${fmt(a.pacientes)}</td><td class="num">${fmt(a.por_paciente)}</td><td class="num">${fmt(a.vagas_pacientes)}</td><td class="num"><b>${fmt(a.lotacao_pacientes)}</b></td></tr>`).join('') +
    `<tr style="font-weight:650"><td>Clínica</td><td class="num">${t.ativos}</td><td class="num">${t.com_agenda}</td><td class="num">${fmt(t.capacidade)}</td><td class="num">${fmt(t.ocupados + t.bloqueados)}</td><td class="num">${fmt(t.livres)}</td><td class="num">${ocBar(t.ocupacao)}</td><td class="num">${fmt(t.pacientes)}</td><td class="num">${t.pacientes ? fmt(t.ocupados / t.pacientes) : '—'}</td><td class="num">${fmt(t.vagas_pacientes)}</td><td class="num">${fmt(t.lotacao_pacientes)}</td></tr></tbody>`;
  $('ltAreas').querySelectorAll('tr[data-e]').forEach(tr => tr.onclick = () => {
    const sai = $('ltEsp').value === tr.dataset.e;
    $('ltEsp').value = sai ? '' : tr.dataset.e;
    $('ltAreas').querySelectorAll('tr[data-e]').forEach(x => x.classList.toggle('sel', !sai && x === tr));
    rLtProfs();
    if (!sai) $('ltProfs').scrollIntoView({behavior:'smooth', block:'start'});
  });
  rLtHorarios();
  const esps = [...new Map(L.profissionais.map(p => [p.esp_id, p.esp])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const ev = $('ltEsp').value;
  $('ltEsp').innerHTML = '<option value="">Todas as áreas</option>' + esps.map(([id, n]) => `<option value="${id}" ${String(id) === ev ? 'selected' : ''}>${esc(n)}</option>`).join('');
  rLtProfs();
}
/* Ocupação por horário: % ocupado às 8h, 13h, 14h… em cada dia, na semana do Hipo ou num mês do histórico */
let LH = null, LH_KEY = '';
const lhCor = v => v == null ? 'transparent' : `color-mix(in srgb, ${v >= 90 ? 'var(--bad)' : v >= 75 ? 'var(--warn)' : 'var(--good)'} ${Math.round(18 + 0.5 * v)}%, var(--surface))`;
async function rLtHorarios(){
  const per = $('lhPer').value || 'semana', esp = $('lhEsp').value, key = [per, esp, LT_UNI].join('|');
  if (!LH || LH_KEY !== key) { LH = await api(`api/lotacao/horarios?periodo=${per}&esp=${esp}&unidade=${encodeURIComponent(LT_UNI)}`); LH_KEY = key; }
  const H = LH, ev = esp;
  $('lhPer').innerHTML = `<option value="semana">Semana atual (grade do Hipo)</option>` + H.meses.map(m => `<option value="${m}" ${m === per ? 'selected' : ''}>${mesL(m)} ${H.extraido_em && m >= H.extraido_em.slice(0, 7) ? '(agenda marcada até ' + dataL(H.extraido_em) + ')' : '(histórico)'}</option>`).join('');
  $('lhEsp').innerHTML = '<option value="">Todas as áreas</option>' + META.especialidades.map(e => `<option value="${e.id}" ${String(e.id) === ev ? 'selected' : ''}>${esc(e.nome)}</option>`).join('');
  if (!H.horarios.length) { $('lhBox').innerHTML = '<div class="empty">Importe o arquivo do Hipo para ver a ocupação por horário.</div>'; return; }
  const dias = [0, 1, 2, 3, 4, 5].filter(d => H.celulas[d]), pc = c => c && c.disp ? Math.round(1000 * c.oc / c.disp) / 10 : null;
  const soma = cs => cs.reduce((o, c) => c ? {disp: o.disp + c.disp, oc: o.oc + c.oc, bloq: o.bloq + c.bloq} : o, {disp:0, oc:0, bloq:0});
  const linhas = H.horarios.map((h, i) => ({h, i, cs: dias.map(d => H.celulas[d]?.[i])})).filter(l => l.cs.some(Boolean));
  const tot = soma(linhas.flatMap(l => l.cs));
  const cell = (c, d, i) => { const v = pc(c); if (!c) return '<td></td>';
    return `<td><button class="mc lh" data-d="${d}" data-i="${i}" style="background:${lhCor(v)}" title="${c.oc} ocupados de ${c.disp} terapeutas na casa${c.bloq ? ` · ${c.bloq} bloqueados` : ''} · ${c.disp - c.oc} livres"><b>${v == null ? '—' : fmt(v) + '%'}</b><small>${c.disp - c.oc} livres</small></button></td>`; };
  $('lhBox').innerHTML = `<div class="tablewrap" style="max-height:620px"><table class="agmapa lhmapa"><thead><tr><th>Horário</th>${dias.map(d => `<th>${DIAS[d + 1]}</th>`).join('')}<th class="num">${H.periodo === 'semana' ? 'Semana' : 'Mês'}</th></tr></thead><tbody>` +
    linhas.map(l => { const t = soma(l.cs); return `<tr><td class="num" style="white-space:nowrap"><b>${l.h.ini}</b> <span style="color:var(--muted)">– ${l.h.fim}</span></td>${l.cs.map((c, k) => cell(c, dias[k], l.i)).join('')}<td class="num" style="min-width:150px">${ocBar(pc(t))}<div class="hint" style="margin:0">${fmt(t.oc)} de ${fmt(t.disp)} · ${fmt(t.disp - t.oc)} livres</div></td></tr>`; }).join('') +
    `<tr style="font-weight:650"><td>Dia todo</td>${dias.map(d => { const t = soma(linhas.map(l => H.celulas[d]?.[l.i])); return `<td class="num">${pctf(pc(t))}</td>`; }).join('')}<td class="num">${ocBar(pc(tot))}</td></tr></tbody></table></div>
    ${H.feriados?.length ? `<div class="hint" style="margin-top:8px">Feriado fora da conta: ${H.feriados.map(d => dataL(d) + ' (' + DIAS[(new Date(d + 'T12:00').getDay() + 6) % 7 + 1] + ')').join(', ')}.</div>` : ''}
    <div class="legend" style="margin-top:8px"><span><span class="sw" style="background:${lhCor(60)}"></span>até 75%: tem espaço</span><span><span class="sw" style="background:${lhCor(80)}"></span>75–90%: enchendo</span><span><span class="sw" style="background:${lhCor(95)}"></span>90% ou mais: quase lotado</span><span>· clique num horário para ver quem está livre</span>${H.periodo === 'semana' ? '' : `<span>· soma dos ${H.dias_no_periodo} dias com atendimento no mês</span>`}</div>`;
  $('lhBox').querySelectorAll('.mc.lh[data-d]').forEach(b => b.onclick = () => {
    const d = +b.dataset.d, i = +b.dataset.i, c = H.celulas[d][i], h = H.horarios[i], dlg = $('dlg');
    const mes = H.periodo !== 'semana';
    const ls = [...c.livres].sort((a, b) => mes ? b.livre / b.vezes - a.livre / a.vezes || b.livre - a.livre || a.nome.localeCompare(b.nome) : a.nome.localeCompare(b.nome));
    dlg.innerHTML = `<div class="mhead"><h2 style="flex:1">${DIAS[d + 1]} · ${h.ini}–${h.fim}</h2><span class="hint" style="margin:0">${pctf(pc(c))} ocupado · ${c.oc} com paciente · ${c.disp - c.oc} livres${c.bloq ? ` · ${c.bloq} bloqueados` : ''}</span><button class="ghost" id="mClose" aria-label="Fechar">✕</button></div>
      <div class="mbody"><div class="card"><h2>Terapeutas livres neste horário</h2><div class="hint">${mes ? `Em ${mesL(H.periodo)}: quantas ${DIAS[d + 1].toLowerCase()}s cada um esteve na casa nesse horário sem paciente. Quem aparece com todas livres é horário que dá para preencher.` : 'Estão na casa nesse turno e sem paciente marcado na grade do Hipo.'}</div>
      ${ls.length ? (mes ? `<div class="tablewrap" style="max-height:480px"><table><thead><tr><th>Terapeuta</th><th class="num">Livre</th><th class="num">Na casa</th><th class="num">% livre</th></tr></thead><tbody>${ls.map(p => `<tr><td><a href="#" data-p="${p.id}" style="color:inherit">${esc(p.nome)}</a></td><td class="num"><b>${p.livre}</b></td><td class="num">${p.vezes}</td><td class="num">${pctf(Math.round(1000 * p.livre / p.vezes) / 10)}</td></tr>`).join('')}</tbody></table></div>`
        : `<div class="lh-livres">${ls.map(p => `<a href="#" data-p="${p.id}" class="tag">${esc(p.nome)}</a>`).join('')}</div>`) : '<div class="empty">Ninguém livre neste horário.</div>'}</div></div>`;
    $('mClose').onclick = () => dlg.close();
    dlg.querySelectorAll('[data-p]').forEach(el => el.onclick = e => { e.preventDefault(); dlg.close(); openProf(+el.dataset.p); });
    if (!dlg.open) dlg.showModal();
  });
}
function ltFiltrados(){
  const q = norm($('ltBusca').value), e = $('ltEsp').value, f = $('ltFonte').value;
  return LT.profissionais.filter(p => (!e || String(p.esp_id) === e) && (!f || p.fonte === f) && (!q || norm([p.nome, p.nome_completo, p.unidade].join(' ')).includes(q)));
}
function rLtProfs(){
  if (!LT) return;
  const l = ltFiltrados();
  $('ltProfs').innerHTML = `<thead><tr><th>Terapeuta</th><th>Unidade</th><th>Contratação</th><th class="num">Carga (h/sem)</th><th class="num">Capacidade</th><th>Origem</th><th class="num">Ocupados</th><th class="num">Bloq.</th><th class="num">Livres</th><th class="num">Uso da capacidade</th><th class="num">Sessões</th><th class="num">Pacientes</th></tr></thead><tbody>` +
    (l.map(p => `<tr><td><a href="#" data-p="${p.id}" style="color:inherit;text-decoration:none">${who(p)}</a></td><td>${esc(p.unidade || '—')}</td><td>${esc(p.contratacao || '—')}</td>
      <td class="num"><input type="number" class="mini-in" step="0.5" min="0" data-id="${p.id}" data-k="carga_horaria_semanal" value="${p.carga ?? ''}" placeholder="—" aria-label="Carga horária semanal de ${esc(p.nome)}"></td>
      <td class="num"><input type="number" class="mini-in" step="1" min="0" data-id="${p.id}" data-k="capacidade_semanal" value="${p.fonte === 'manual' ? p.capacidade : ''}" placeholder="${p.capacidade ?? '—'}" title="Deixe vazio para calcular" aria-label="Capacidade semanal de ${esc(p.nome)}"></td>
      <td><span class="tag fonte-${p.fonte}">${FONTE[p.fonte]}</span></td><td class="num">${p.ocupados}</td><td class="num">${p.bloqueados || ''}</td><td class="num">${fmt(p.livres)}</td><td class="num">${ocBar(p.ocupacao)}</td><td class="num">${p.sessoes}</td><td class="num">${p.pacientes}</td></tr>`).join('')
     || '<tr><td colspan="12" class="empty">Nenhum terapeuta com esses filtros.</td></tr>') + '</tbody>';
  bindProfClicks($('ltProfs'));
  $('ltProfs').querySelectorAll('.mini-in').forEach(i => i.onchange = async () => {
    const v = i.value === '' ? null : +i.value;
    if (v != null && (v < 0 || (i.dataset.k === 'carga_horaria_semanal' && v > 80) || (i.dataset.k === 'capacidade_semanal' && v > 84))) { toast('Valor fora do esperado'); return; }
    await api('api/profissional/' + i.dataset.id, {method:'PUT', headers:JSONH, body: JSON.stringify({[i.dataset.k]: v})});
    toast('Salvo — lotação recalculada'); PROFS_ALL = null; LT = null; await rLotacao();
  });
}
function csvLotacao(){
  if (!LT) return;
  const l = ltFiltrados(), q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = [['Terapeuta','Nome no Hipo','Área','Unidade','Contratação','Carga (h/sem)','Capacidade (horários)','Origem','Ocupados','Bloqueados','Livres','Ocupação %','Sessões','Pacientes'],
    ...l.map(p => [p.nome, p.nome_completo, p.esp, p.unidade, p.contratacao, p.carga, p.capacidade, FONTE[p.fonte], p.ocupados, p.bloqueados, p.livres, p.ocupacao, p.sessoes, p.pacientes])];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + linhas.map(r => r.map(q).join(';')).join('\n')], {type:'text/csv'}));
  a.download = 'lotacao.csv'; a.click();
}

/* ---------------- REPASSE: quanto pagamos e quanto recebemos por terapeuta, mês a mês ---------------- */
let RP = null, rpModo = (() => { try { return localStorage.getItem('rpModo') || 'comparar'; } catch { return 'comparar'; } })();
const RP_TIPO = {fixo:'Fixo mensal', hora:'Por hora', sessao:'Por sessão', percentual:'% do recebido'};
const brl = n => n == null ? '—' : Number(n).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
const rpRegra = r => !r ? '<span style="color:var(--muted)">sem tabela</span>' : r.tipo === 'percentual' ? fmt(r.valor) + '% do recebido' : brl(r.valor) + ({fixo:' /mês', hora:' /hora', sessao:' /sessão'})[r.tipo];
const rpMesL = m => mesL(m) + (RP && m === RP.hoje ? ' (parcial)' : '');
/* variação de b em relação a a; cor só quando subir é claramente bom (bom=1) ou ruim (bom=-1) */
function rpVar(b, a, bom = 0){
  if (a == null || b == null || (!a && !b)) return '<span style="color:var(--muted)">—</span>';
  if (!a) return '<span class="st-warn">novo</span>';
  const p = 100 * (b - a) / Math.abs(a), cls = Math.abs(p) < 0.5 ? '' : (p > 0) === (bom > 0) && bom ? 'st-good' : bom ? 'st-bad' : '';
  return `<span class="${cls}" title="${brl(b - a)}">${p > 0.05 ? '▲' : p < -0.05 ? '▼' : ''} ${fmt(Math.abs(p))}%</span>`;
}
function rpFiltrados(){
  const q = norm($('rpBusca').value), e = $('rpEsp').value, t = $('rpTipo').value, u = $('rpUni').value;
  return RP.profissionais.filter(p => (!e || String(p.esp_id) === e) && (!u || (p.unidade || '') === u)
    && (!t || (t === 'sem' ? !p.regra : p.regra?.tipo === t)) && (!q || norm(p.nome).includes(q)));
}
/* soma de um grupo de terapeutas num mês: pago, recebido, sessões, horas, quantos foram pagos */
function rpSoma(l, mes){
  const o = {p:0, r:0, s:0, h:0, n:0, semTabela:0};
  l.forEach(x => { const m = x.m[mes]; if (!m) return; o.p += m.p || 0; o.r += m.r; o.s += m.s; o.h += m.h; if (m.p) o.n++; if (m.p == null && m.s) o.semTabela++; });
  o.res = o.r - o.p; return o;
}
const rpMetrica = (o, k) => k === 'res' ? o.r - (o.p || 0) : o?.[k] ?? 0;
const rpFmtMet = (v, k) => ['s', 'h'].includes(k) ? fmt(v) : money(v);

async function rRepasse(){
  if (!RP) RP = await api('api/repasse');
  const R = RP, ms = R.meses;
  /* meses: por padrão o último mês fechado contra o anterior */
  const fechados = ms.filter(m => m < R.hoje), b0 = fechados.at(-1) || ms.at(-1), a0 = ms[ms.indexOf(b0) - 1] || b0;
  const opt = (sel, v) => ms.map(m => `<option value="${m}" ${m === v ? 'selected' : ''}>${rpMesL(m)}</option>`).join('');
  const A = $('rpA').value || a0, B = $('rpB').value || b0;
  $('rpA').innerHTML = opt('a', A); $('rpB').innerHTML = opt('b', B);
  const esps = [...new Map(R.profissionais.map(p => [p.esp_id, p.esp])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const ev = $('rpEsp').value, uv = $('rpUni').value;
  $('rpEsp').innerHTML = '<option value="">Todas as áreas</option>' + esps.map(([id, n]) => `<option value="${id}" ${String(id) === ev ? 'selected' : ''}>${esc(n)}</option>`).join('');
  const unis = [...new Set(R.profissionais.map(p => p.unidade).filter(Boolean))].sort();
  $('rpUni').innerHTML = '<option value="">Todas as unidades</option>' + unis.map(u => `<option ${u === uv ? 'selected' : ''}>${esc(u)}</option>`).join('');
  $('rpModo').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === rpModo));
  document.querySelector('#s-repasse .rp-cmp').hidden = rpModo !== 'comparar';
  document.querySelector('#s-repasse .rp-ver').hidden = rpModo !== 'meses';
  $('rpOrd').parentElement.hidden = rpModo !== 'comparar';

  const av = [];
  if (R.simulados) av.push(`<div class="notice warn"><span>🧪</span><div><b>Valores simulados.</b> ${fmt(R.simulados)} linhas da tabela de remuneração${R.conv_simulados ? ` e o valor da sessão de ${R.conv_simulados} convênios` : ''} são de teste, só para ver as telas funcionando. Quando a tabela real chegar, ela substitui tudo isso. <button id="rpLimpa">Apagar dados simulados</button></div></div>`);
  else if (!R.profissionais.some(p => p.regra)) av.push(`<div class="notice"><span>💰</span><div>Nenhum terapeuta tem remuneração cadastrada. Cadastre na ficha de cada um (<b>Editar cadastro → Remuneração</b>) ou em <a href="#cadastros">Cadastros</a>.${/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? ' <button id="rpSimula">Gerar dados simulados para testar</button>' : ''}</div></div>`);
  if (R.sem_tabela_ativos) av.push(`<div class="notice"><span>⚠️</span><div><b>${R.sem_tabela_ativos} terapeutas ativos sem remuneração cadastrada</b> — eles aparecem com pagamento “—” e ficam fora do total pago. Filtre por <b>Sem tabela</b> para ver quem são.</div></div>`);
  if (R.sessoes_sem_valor) av.push(`<div class="notice"><span>ℹ️</span><div>${fmt(R.sessoes_sem_valor)} sessões no período não têm valor recebido (convênio sem valor por sessão). Preencha em <b>Regras do cálculo</b>, no fim da página.</div></div>`);
  $('rpAviso').innerHTML = av.join('');
  $('rpLimpa') && ($('rpLimpa').onclick = async () => {
    if (!confirm('Apagar todos os valores simulados (remuneração e valor por sessão dos convênios)? O que foi digitado à mão fica.')) return;
    const r = await api('api/repasse/limpar-simulados', {method:'POST', headers:JSONH, body:'{}'}); toast(`${r.apagados} linhas simuladas apagadas`); RP = null; rRepasse();
  });
  $('rpSimula') && ($('rpSimula').onclick = async () => {
    const r = await api('api/repasse/simular', {method:'POST', headers:JSONH, body:'{}'}); toast(`${r.criados} terapeutas com remuneração simulada`); RP = null; rRepasse();
  });

  const l = rpFiltrados(), sA = rpSoma(l, A), sB = rpSoma(l, B);
  const pct = (x, y) => y ? 100 * x / y : null;
  $('rpKpis').innerHTML = rpModo === 'comparar' ?
    kpi('money', `Pago em ${rpMesL(B)}`, money(sB.p), `${rpVar(sB.p, sA.p)} vs ${mesL(A)} (${money(sA.p)})`) +
    kpi('money', `Recebido em ${rpMesL(B)}`, money(sB.r), `${rpVar(sB.r, sA.r, 1)} vs ${mesL(A)} (${money(sA.r)})`) +
    kpi('pct', 'Resultado (recebido − pago)', `<span class="${sB.res < 0 ? 'st-bad' : ''}">${money(sB.res)}</span>`, `${rpVar(sB.res, sA.res, 1)} vs ${mesL(A)} · margem ${pctf(pct(sB.res, sB.r))}`) +
    kpi('pct', 'Repasse sobre o recebido', pctf(pct(sB.p, sB.r)), `${mesL(A)}: ${pctf(pct(sA.p, sA.r))}`) +
    kpi('cal', 'Custo por sessão', sB.s ? brl(sB.p / sB.s) : '—', `${fmt(sB.s)} sessões · ${fmt(sB.h)} h · ${mesL(A)}: ${sA.s ? brl(sA.p / sA.s) : '—'}`) +
    kpi('users', 'Terapeutas pagos', fmt(sB.n), sB.semTabela ? `<span class="st-warn">${sB.semTabela} atenderam sem tabela</span>` : `${fmt(l.length)} no filtro`)
    : (() => { const tot = ms.map(m => rpSoma(l, m)), soma = k => tot.reduce((s, o) => s + rpMetrica(o, k), 0);
        return kpi('money', 'Pago no período', money(soma('p')), `${ms.length} meses · média ${money(soma('p') / ms.length)}/mês`) +
          kpi('money', 'Recebido no período', money(soma('r')), `média ${money(soma('r') / ms.length)}/mês`) +
          kpi('pct', 'Resultado no período', money(soma('res')), `margem ${pctf(pct(soma('res'), soma('r')))}`) +
          kpi('pct', 'Repasse sobre o recebido', pctf(pct(soma('p'), soma('r'))), 'no período todo') +
          kpi('cal', 'Custo por sessão', soma('s') ? brl(soma('p') / soma('s')) : '—', `${fmt(soma('s'))} sessões`); })();

  /* gráfico: barras de pago e recebido, linha do resultado */
  const tot = ms.map(m => rpSoma(l, m)), o = baseOpts(false);
  o.plugins.tooltip.mode = 'index'; o.plugins.tooltip.callbacks = {label: i => `${i.dataset.label}: ${money(i.raw)}`};
  o.scales.y.ticks = {...(o.scales.y.ticks || {}), callback: v => money(v)};
  draw('cRepasse', {type:'bar', data:{labels: ms.map(m => mesL(m) + (m === R.hoje ? '*' : '')), datasets:[
    {...bar(tot.map(x => x.p), css('--s2'), 'Pago'), order:2},
    {...bar(tot.map(x => x.r), css('--s1'), 'Recebido'), order:3},
    {type:'line', label:'Resultado', data: tot.map(x => x.res), borderColor: css('--s3'), backgroundColor: css('--s3'), pointRadius:3, tension:.25, order:1}]}, options:o});
  $('rpLeg').innerHTML = [['--s2', 'Pago'], ['--s1', 'Recebido'], ['--s3', 'Resultado']].map(([c, n]) => `<span><span class="sw" style="background:${css(c)}"></span>${n}</span>`).join('');
  $('rpSerieHint').innerHTML = (ms.includes(R.hoje) ? `* ${mesL(R.hoje)} ainda está em andamento. ` : '') + `Resultado = recebido pelas sessões − pago aos terapeutas (não inclui outros custos da clínica).`;

  /* por área */
  const areas = esps.map(([id, nome]) => ({id, nome, l: RP.profissionais.filter(p => p.esp_id === id && rpFiltrados().includes(p))})).filter(a => a.l.length);
  const eSel = $('rpEsp').value;
  if (rpModo === 'comparar') {
    const linhaA = (nome, ls, extra = '') => { const a = rpSoma(ls, A), b = rpSoma(ls, B);
      return `<td class="num">${fmt(b.n)}</td><td class="num">${money(a.p)}</td><td class="num"><b>${money(b.p)}</b></td><td class="num">${rpVar(b.p, a.p)}</td><td class="num">${money(b.r)}</td><td class="num">${rpVar(b.r, a.r, 1)}</td><td class="num ${b.res < 0 ? 'st-bad' : ''}">${money(b.res)}</td><td class="num">${pctf(pct(b.p, b.r))}</td><td class="num">${b.s ? brl(b.p / b.s) : '—'}</td>`; };
    $('rpAreas').innerHTML = `<thead><tr><th>Área</th><th class="num">Pagos</th><th class="num">Pago ${mesL(A)}</th><th class="num">Pago ${mesL(B)}</th><th class="num">Variação</th><th class="num">Recebido ${mesL(B)}</th><th class="num">Variação</th><th class="num">Resultado</th><th class="num">% repasse</th><th class="num">Custo/sessão</th></tr></thead><tbody>` +
      areas.map(a => `<tr class="click ${eSel === String(a.id) ? 'sel' : ''}" data-e="${a.id}" ${AREA_TIP}><td><span class="tag"><span class="sw" style="background:${espColor(a.id)}"></span>${esc(a.nome)}</span></td>${linhaA(a.nome, a.l)}</tr>`).join('') +
      `<tr style="font-weight:650"><td>Total</td>${linhaA('Total', l)}</tr></tbody>`;
  } else {
    const k = $('rpVer').value;
    $('rpAreas').innerHTML = `<thead><tr><th>Área</th>${ms.map(m => `<th class="num">${mesL(m)}${m === R.hoje ? '*' : ''}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>` +
      [...areas.map(a => ({...a, tag:true})), {nome:'Total', l}].map(a => { const v = ms.map(m => rpMetrica(rpSoma(a.l, m), k));
        return `<tr ${a.tag ? `class="click ${eSel === String(a.id) ? 'sel' : ''}" data-e="${a.id}" ${AREA_TIP}` : 'style="font-weight:650"'}><td>${a.tag ? `<span class="tag"><span class="sw" style="background:${espColor(a.id)}"></span>${esc(a.nome)}</span>` : 'Total'}</td>${v.map((x, i) => `<td class="num" title="${i ? 'vs mês anterior: ' + (v[i - 1] ? fmt(100 * (x - v[i - 1]) / Math.abs(v[i - 1])) + '%' : '—') : ''}">${x ? rpFmtMet(x, k) : '<span style="color:var(--muted)">—</span>'}</td>`).join('')}<td class="num"><b>${rpFmtMet(v.reduce((s, x) => s + x, 0), k)}</b></td></tr>`; }).join('') + '</tbody>';
  }
  $('rpAreas').querySelectorAll('tr[data-e]').forEach(tr => tr.onclick = () => {
    const sai = $('rpEsp').value === tr.dataset.e; $('rpEsp').value = sai ? '' : tr.dataset.e; rRepasse();
    toast(sai ? 'Filtro de área removido' : 'Filtrando pela área — clique de novo para tirar', 2200);
  });
  rpProfsTabela(l, A, B);
}
function rpProfsTabela(l, A, B){
  const R = RP, ms = R.meses;
  if (rpModo === 'comparar') {
    const ord = $('rpOrd').value, val = (p, m) => p.m[m]?.p ?? 0, dv = p => val(p, B) - val(p, A);
    const ls = [...l].filter(p => p.m[A] || p.m[B] || p.ativo).sort(ord === 'nome' ? (a, b) => a.nome.localeCompare(b.nome)
      : ord === 'dv' ? (a, b) => dv(b) - dv(a) : ord === 'dvn' ? (a, b) => dv(a) - dv(b)
      : ord === 'res' ? (a, b) => ((a.m[B]?.r ?? 0) - val(a, B)) - ((b.m[B]?.r ?? 0) - val(b, B)) : (a, b) => val(b, B) - val(a, B));
    $('rpProfs').innerHTML = `<thead><tr><th>Terapeuta</th><th>Forma de pagamento</th><th class="num">Sessões ${mesL(A)}</th><th class="num">Sessões ${mesL(B)}</th><th class="num">Horas ${mesL(B)}</th><th class="num">Pago ${mesL(A)}</th><th class="num">Pago ${mesL(B)}</th><th class="num">Variação</th><th class="num">Recebido ${mesL(B)}</th><th class="num">Resultado</th></tr></thead><tbody>` +
      (ls.map(p => { const a = p.m[A], b = p.m[B], res = b ? b.r - (b.p || 0) : null;
        return `<tr><td><a href="#" data-rp="${p.id}" style="color:inherit;text-decoration:none">${who(p)}</a>${p.ativo ? '' : ' <span class="tag">inativo</span>'}</td>
          <td>${p.regra ? `<span class="tag rp-${p.regra.tipo}">${RP_TIPO[p.regra.tipo]}</span> ${rpRegra(p.regra).replace(/ \/(mês|hora|sessão)$/, '<span style="color:var(--muted)">/$1</span>')}` : rpRegra(null)}</td>
          <td class="num">${fmt(a?.s ?? 0)}</td><td class="num">${fmt(b?.s ?? 0)}</td><td class="num">${fmt(b?.h ?? 0)}</td>
          <td class="num">${money(a?.p)}</td><td class="num"><b>${money(b?.p)}</b></td><td class="num">${rpVar(b?.p, a?.p)}</td>
          <td class="num">${money(b?.r ?? 0)}</td><td class="num ${res < 0 ? 'st-bad' : ''}">${res == null ? '—' : money(res)}</td></tr>`; }).join('')
       || '<tr><td colspan="10" class="empty">Nenhum terapeuta com esses filtros.</td></tr>') + '</tbody>';
  } else {
    const k = $('rpVer').value;
    $('rpProfs').innerHTML = `<thead><tr><th>Terapeuta</th><th>Forma</th>${ms.map(m => `<th class="num">${mesL(m)}${m === R.hoje ? '*' : ''}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>` +
      ([...l].sort((a, b) => a.nome.localeCompare(b.nome)).map(p => { const v = ms.map(m => p.m[m] ? rpMetrica(p.m[m], k) : 0);
        return `<tr><td><a href="#" data-rp="${p.id}" style="color:inherit;text-decoration:none">${who(p)}</a></td><td>${p.regra ? `<span class="tag rp-${p.regra.tipo}">${RP_TIPO[p.regra.tipo]}</span>` : rpRegra(null)}</td>
          ${v.map((x, i) => `<td class="num">${x ? rpFmtMet(x, k) : '<span style="color:var(--muted)">—</span>'}</td>`).join('')}<td class="num"><b>${rpFmtMet(v.reduce((s, x) => s + x, 0), k)}</b></td></tr>`; }).join('')
       || `<tr><td colspan="${ms.length + 3}" class="empty">Nenhum terapeuta com esses filtros.</td></tr>`) + '</tbody>';
  }
  $('rpProfs').querySelectorAll('[data-rp]').forEach(a => a.onclick = e => { e.preventDefault(); rpProf(+a.dataset.rp); });
}
function rpCfg(){
  const c = RP.config;
  $('rpCfgBox').innerHTML = `<div class="form-grid" style="margin-top:12px">
      <label>Duração da sessão (minutos)<input type="number" id="rcMin" min="10" max="240" value="${c.sessao_min}"><span class="hint" style="margin:0">Usada para converter sessões em horas de quem recebe por hora.</span></label>
      <label>Valor recebido por sessão, quando o convênio não tem valor<input type="number" id="rcPad" step="0.01" min="0" value="${c.valor_padrao ?? ''}" placeholder="sem valor"></label>
      <label class="chk"><input type="checkbox" id="rcFal" ${c.pagar_faltas ? 'checked' : ''}> Pagar falta sem justificativa (conta como sessão para quem recebe por hora ou por sessão)</label>
    </div>
    <h3 style="margin:16px 0 6px;font-size:14px">Valor recebido por sessão em cada convênio</h3>
    <div class="tablewrap" style="max-height:360px"><table><thead><tr><th>Convênio</th><th class="num">Valor por sessão (R$)</th></tr></thead><tbody>${RP.convenios.map(v => `<tr><td>${esc(v.nome)}</td><td class="num"><input type="number" class="mini-in" step="0.01" min="0" data-c="${v.id}" value="${v.valor_sessao ?? ''}" placeholder="—" aria-label="Valor por sessão de ${esc(v.nome)}"></td></tr>`).join('')}</tbody></table></div>
    <div class="hint">O valor lançado no próprio atendimento (quando houver) vale mais que o do convênio.</div>`;
  const salva = async b => { await api('api/repasse/config', {method:'PUT', headers:JSONH, body: JSON.stringify(b)}); toast('Salvo — repasse recalculado'); RP = null; await rRepasse(); };
  $('rcMin').onchange = () => salva({sessao_min: +$('rcMin').value});
  $('rcPad').onchange = () => salva({valor_padrao: $('rcPad').value === '' ? null : +$('rcPad').value});
  $('rcFal').onchange = () => salva({pagar_faltas: $('rcFal').checked});
  $('rpCfgBox').querySelectorAll('[data-c]').forEach(i => i.onchange = async () => {
    await api('api/convenio/' + i.dataset.c, {method:'PUT', headers:JSONH, body: JSON.stringify({valor_sessao: i.value === '' ? null : +i.value})});
    toast('Valor do convênio salvo'); RP = null; await rRepasse();
  });
}
function csvRepasse(){
  if (!RP) return;
  const l = rpFiltrados(), ms = RP.meses, q = v => `"${String(v ?? '').replace(/"/g, '""')}"`, n = v => v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ',');
  const linhas = [['Terapeuta', 'Área', 'Unidade', 'Forma de pagamento', 'Valor da tabela', ...ms.flatMap(m => [`Sessões ${m}`, `Horas ${m}`, `Pago ${m}`, `Recebido ${m}`])],
    ...l.map(p => [p.nome, p.esp, p.unidade, p.regra ? RP_TIPO[p.regra.tipo] : 'sem tabela', p.regra ? n(p.regra.valor) : '', ...ms.flatMap(m => { const x = p.m[m]; return x ? [x.s, n(x.h), n(x.p), n(x.r)] : ['', '', '', '']; })])];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + linhas.map(r => r.map(q).join(';')).join('\n')], {type:'text/csv'}));
  a.download = 'repasse.csv'; a.click();
}

/* Remuneração de um terapeuta: tabela vigente, histórico de valores e mês a mês */
const rpFormLinha = (x = {}) => `<div class="form-grid rp-form">
    <label>Forma de pagamento<select data-r="tipo">${Object.entries(RP_TIPO).map(([k, v]) => `<option value="${k}" ${x.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label><span data-r="rot">${({fixo:'Valor mensal (R$)', hora:'Valor da hora (R$)', sessao:'Valor por sessão (R$)', percentual:'Percentual do recebido (%)'})[x.tipo || 'fixo']}</span><input type="number" step="0.01" min="0" data-r="valor" value="${x.valor ?? ''}"></label>
    <label>Vale a partir de<input type="date" data-r="desde" value="${x.desde || new Date().toISOString().slice(0, 8) + '01'}"></label>
    <label>Observação<input data-r="obs" value="${esc(x.obs && !/^simulado/.test(x.obs) ? x.obs : '')}" placeholder="Ex.: reajuste anual"></label></div>`;
function rpFormBind(box){
  const t = box.querySelector('[data-r=tipo]');
  t.onchange = () => box.querySelector('[data-r=rot]').textContent = ({fixo:'Valor mensal (R$)', hora:'Valor da hora (R$)', sessao:'Valor por sessão (R$)', percentual:'Percentual do recebido (%)'})[t.value];
  return () => Object.fromEntries([...box.querySelectorAll('[data-r]')].filter(i => i.tagName !== 'SPAN').map(i => [i.dataset.r, i.dataset.r === 'valor' ? (i.value === '' ? null : +i.value) : i.value]));
}
async function rpProf(id){
  const r = await api(`api/repasse/prof/${id}`), p = r.profissionais[0], h = r.historico, dlg = $('dlg');
  const nome = p?.nome || (await api('api/profissional/' + id)).nome;
  const ms = r.meses.filter(m => p?.m[m]).reverse();
  dlg.innerHTML = `<div class="mhead"><h2 style="flex:1">Remuneração — ${esc(nome)}</h2><button id="rpFicha">Ficha</button><button class="ghost" id="mClose">✕</button></div>
    <div class="mbody">
      <div class="card"><h2>Forma de pagamento atual</h2><div style="font-size:18px;margin:6px 0 2px">${p?.regra ? `<span class="tag rp-${p.regra.tipo}">${RP_TIPO[p.regra.tipo]}</span> <b>${rpRegra(p.regra)}</b> <span class="hint">desde ${dataL(p.regra.desde)}${p.regra.simulado ? ' · <span class="st-warn">simulado</span>' : ''}</span>` : rpRegra(null)}</div>
        <h3 style="margin:14px 0 4px;font-size:14px">${p?.regra ? 'Novo valor ou reajuste' : 'Cadastrar remuneração'}</h3>
        <div class="hint" style="margin:0 0 6px">Um valor novo vale a partir da data escolhida; os meses anteriores continuam calculados com o valor antigo.</div>
        <div id="rpNovo">${rpFormLinha({tipo: p?.regra?.tipo || 'hora'})}</div><div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="primary" id="rpSalvar">Salvar valor</button></div>
        ${h.length ? `<h3 style="margin:14px 0 6px;font-size:14px">Histórico de valores</h3><div class="tablewrap"><table><thead><tr><th>Vale a partir de</th><th>Forma</th><th class="num">Valor</th><th>Observação</th><th></th></tr></thead><tbody>${h.map(x => `<tr><td>${dataL(x.desde)}</td><td>${RP_TIPO[x.tipo]}</td><td class="num">${rpRegra(x)}</td><td>${esc(x.obs || '')}${x.simulado ? ' <span class="st-warn">simulado</span>' : ''}</td><td style="text-align:right"><button class="ghost" data-del="${x.id}" title="Excluir esta linha">✕</button></td></tr>`).join('')}</tbody></table></div>` : ''}
      </div>
      <div class="card"><h2>Mês a mês</h2><div class="hint">Pago pela regra vigente em cada mês · recebido pelas sessões realizadas</div>
        ${ms.length ? `<div class="chartbox" style="height:220px"><canvas id="cRpProf"></canvas></div>
        <div class="tablewrap" style="max-height:340px;margin-top:10px"><table><thead><tr><th>Mês</th><th>Forma</th><th class="num">Sessões</th><th class="num">Faltas</th><th class="num">Horas</th><th class="num">Pago</th><th class="num">vs mês anterior</th><th class="num">Recebido</th><th class="num">Resultado</th></tr></thead><tbody>${ms.map((m, i) => { const x = p.m[m], ant = p.m[ms[i + 1]];
          return `<tr><td style="white-space:nowrap">${rpMesL(m)}</td><td style="white-space:nowrap">${x.t ? RP_TIPO[x.t] : '—'}</td><td class="num">${fmt(x.s)}</td><td class="num">${fmt(x.f)}</td><td class="num">${fmt(x.h)}</td><td class="num"><b>${money(x.p)}</b></td><td class="num">${ant ? rpVar(x.p, ant.p) : '—'}</td><td class="num">${money(x.r)}</td><td class="num ${x.r - (x.p || 0) < 0 ? 'st-bad' : ''}">${money(x.r - (x.p || 0))}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">Sem sessões nem pagamentos registrados.</div>'}
      </div></div>`;
  if (!dlg.open) dlg.showModal();
  $('mClose').onclick = () => dlg.close();
  $('rpFicha').onclick = () => openProf(id);
  const ler = rpFormBind($('rpNovo'));
  $('rpSalvar').onclick = async () => {
    const b = ler(); if (b.valor == null) return toast('Informe o valor');
    await api('api/remuneracao', {method:'POST', headers:JSONH, body: JSON.stringify({...b, profissional_id:id})});
    toast('Remuneração salva'); RP = null; rpProf(id);
  };
  dlg.querySelectorAll('[data-del]').forEach(bt => bt.onclick = async () => {
    if (!confirm('Excluir esta linha da tabela de remuneração?')) return;
    await api('api/crud/remuneracao/' + bt.dataset.del, {method:'DELETE', headers:JSONH}); toast('Linha excluída'); RP = null; rpProf(id);
  });
  if (ms.length) {
    const asc = [...ms].reverse(), o = baseOpts(false);
    o.plugins.tooltip.mode = 'index'; o.plugins.tooltip.callbacks = {label: i => `${i.dataset.label}: ${money(i.raw)}`};
    draw('cRpProf', {type:'bar', data:{labels: asc.map(mesL), datasets:[{...bar(asc.map(m => p.m[m].p || 0), css('--s2'), 'Pago')}, {...bar(asc.map(m => p.m[m].r), css('--s1'), 'Recebido')}]}, options:o});
  }
}

/* ---------------- IMPORTAR ---------------- */
const IMPS = [
  {t:'saidas', n:'Saídas de pacientes', d:'Planilha "Pacientes que saíram" (mesmo formato atual). Substitui as saídas anteriores.', c:'saidas'},
  {t:'ativos', n:'Pacientes ativos (carteira)', d:'Lista atual de pacientes com data de início e profissionais por especialidade. Libera taxa de perda, carteira e tempo de casa.', c:'ativos'},
  {t:'profissionais', n:'Cadastro de profissionais', d:'O modelo já vem com todos os profissionais: preencha formação, registro, admissão, meta e competências.', c:'profissionais'},
  {t:'atendimentos', n:'Atendimentos / agenda', d:'Uma linha por sessão com status (realizado, falta…) e valor. Libera faltas, produtividade e faturamento.', c:'atendimentos'},
  {t:'avaliacoes', n:'Pesquisa de satisfação', d:'Notas de 0 a 10 por paciente e profissional. Libera NPS e satisfação.', c:'avaliacoes'},
  {t:'hipo_sessoes', n:'Agenda diária do Hipo', d:'Arquivos <b>hipo-sessoes-AAAA-MM.json</b> (um por mês). Guarda o histórico de sessões de cada terapeuta e gera os <b>atendimentos</b> (realizados, faltas e desmarcações). Reimportar um mês substitui só aquele mês.', c:'atendimentos', json:true},
  {t:'hipo', n:'Cadastro do Hipo Saúde', d:'Arquivo <b>hipo-dados.json</b> extraído do Hipo. Casa cada terapeuta pelo nome, une cadastros duplicados, completa admissão, registro, carga horária, unidade e contratação (sem apagar o que já foi preenchido), atualiza quem está ativo e carrega a grade da semana usada na <b>Lotação</b>. Pode importar de novo sem duplicar.', c:'profissionais', json:true},
];
function rImportar(){
  const c = META.contagens;
  const cnt = {saidas:c.saidas, ativos:META.ativos, profissionais:c.profissionais, atendimentos:c.atendimentos, avaliacoes:c.avaliacoes};
  $('impCards').innerHTML = IMPS.map(x => `<div class="card imp"><h2>${x.n}</h2><div class="hint" style="margin:0">${x.d}</div>
    <div class="count">${fmt(cnt[x.c])} <span style="font-size:13px;font-weight:400;color:var(--muted)">registros no banco</span></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${x.json ? '' : `<a class="btn" href="api/modelo?tipo=${x.t}">⬇ Baixar modelo</a>`}
    <label class="btn primary">⬆ Importar ${x.json ? 'arquivo' : 'planilha'}<input type="file" accept="${x.json ? '.json' : '.xlsx'}" data-t="${x.t}" hidden></label></div></div>`).join('');
  const unis = [...new Set([...(META.agenda || []).map(a => a.unidade), 'VILA', 'FELICITTÁ'])];
  const hoje = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  $('impCards').insertAdjacentHTML('afterbegin', `<div class="card imp"><h2>Agenda semanal da unidade</h2>
    <div class="hint" style="margin:0">A planilha de agenda como ela é usada hoje: uma aba por dia e período (SEGUNDAMANHÃ…), coluna A com os horários e uma coluna por sala/profissional. Libera rankings de atendimento, pacientes novos, saídas e ocupação, e passa a ser a <b>carteira ativa</b>. Importe de novo toda semana: o painel compara com a agenda anterior e mostra quem saiu.</div>
    <div class="count">${fmt((META.agenda || []).reduce((s, a) => s + a.n, 0))} <span style="font-size:13px;font-weight:400;color:var(--muted)">${(META.agenda || []).length ? (META.agenda || []).map(a => `${esc(a.unidade)} ${dataL(a.data_ref)}`).join(' · ') : 'atendimentos na agenda'}</span></div>
    <div class="filters"><label>Unidade</label><input id="impAgUni" list="impAgUnis" placeholder="ex.: VILA" style="width:130px"><datalist id="impAgUnis">${unis.map(u => `<option value="${esc(u)}">`).join('')}</datalist>
      <label>Agenda de</label><input type="date" id="impAgData" value="${hoje}"></div>
    <div style="display:grid;gap:4px;font-size:12.5px">
      <label><input type="radio" name="impAgModo" value="atualizar" checked> <b>Atualizar</b> — agenda de uma nova semana. A atual fica guardada e o painel mostra quem saiu e quem entrou.</label>
      <label><input type="radio" name="impAgModo" value="sobrescrever"> <b>Sobrescrever</b> — corrige a agenda atual da unidade (mesma semana), sem guardar a anterior.</label></div>
    <div><label class="btn primary">⬆ Importar agenda<input type="file" accept=".xlsx" id="impAgFile" hidden></label></div></div>`);
  $('impAgFile').onchange = async () => {
    const inp = $('impAgFile'), f = inp.files[0]; if (!f) return;
    let uni = $('impAgUni').value.trim();
    if (!uni) { const m = f.name.replace(/\.xlsx$/i, '').replace(/^agenda\s*/i, '').trim(); uni = m.toUpperCase(); }
    if (!uni) { toast('Informe a unidade antes de importar.'); inp.value = ''; return; }
    toast(`Importando a agenda de ${uni}…`, 2500);
    try {
      const modo = document.querySelector('input[name=impAgModo]:checked')?.value || 'atualizar';
      if (modo === 'sobrescrever' && !confirm(`Substituir a agenda atual de ${uni} por esta planilha? A versão anterior será apagada.`)) { inp.value = ''; return; }
      const p = new URLSearchParams({tipo:'agenda', unidade:uni, data:$('impAgData').value, arquivo:f.name, modo});
      const r = await api('api/importar?' + p, {method:'POST', body: await f.arrayBuffer()});
      toast(`Agenda ${r.unidade} (${dataL(r.data_ref)}): ${r.importados} atendimentos de ${r.pacientes} pacientes.` + (r.avisos?.length ? '\n' + r.avisos.join('\n') : ''), r.avisos?.length ? 15000 : 4000);
      PROFS_ALL = null; await loadMeta(); await refresh();
    } catch (e) { toast('Erro: ' + e.message, 9000); }
    inp.value = '';
  };
  $('impCards').querySelectorAll('input[type=file][data-t]').forEach(inp => inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const r = await api('api/importar?tipo=' + inp.dataset.t, {method:'POST', body: await f.arrayBuffer()});
      toast(`${r.importados} registros importados.` + (r.avisos?.length ? `\n${r.avisos.length} aviso(s):\n` + r.avisos.slice(0,6).join('\n') : ''), r.avisos?.length ? 9000 : 3500);
      PROFS_ALL = null; await loadMeta(); await refresh();
    } catch (e) { toast('Erro: ' + e.message, 8000); }
    inp.value = '';
  });
}

/* ---------------- eventos ---------------- */
let tmr; const deb = fn => () => { clearTimeout(tmr); tmr = setTimeout(fn, 180); };
['fDe','fAte','fEsp','fConv','fMod'].forEach(id => $(id).onchange = refresh);
$('fClear').onclick = () => { let tmr; const deb = fn => () => { clearTimeout(tmr); tmr = setTimeout(fn, 180); };
['fDe','fAte','fEsp','fConv','fMod'].forEach(id => $(id).value = ''); refresh(); };
$('rkEsp').onchange = rRanking;
$('agUni').onchange = async () => { AG = await api('api/agenda?' + agQs()); mergeAgenda(); renderSection(); };
$('agAT').onchange = rAgenda;
$('agSalaModo').querySelectorAll('button').forEach(b => b.onclick = () => { salaModo = b.dataset.m; rSala(); });
$('agSalaSel').onchange = () => { salaValor[salaModo] = $('agSalaSel').value; $('agSalaProf').value = ''; rSala(); };
$('agSalaProf').onchange = rSalaConteudo;
$('agGradeModo').querySelectorAll('button').forEach(b => b.onclick = () => { gradeModo = b.dataset.v; try { localStorage.setItem('agGradeModo', gradeModo); } catch {} rGrade(); });
$('agSoMarc').onchange = rGrade; $('agVagos').onchange = rGrade; $('agGradeBusca').oninput = deb(rGrade); $('agSalaBusca').oninput = deb(rSalaConteudo); $('agBusca').oninput = deb(rAgTabela); $('agLsBusca').oninput = deb(rAgLista); $('agCsv').onclick = csvAgenda;
$('indBusca').oninput = deb(rIndividual);
$('pcBusca').oninput = deb(rEquipe); $('pcSort').onchange = rEquipe; $('pcMov').onchange = rEquipe; $('pcSit').onchange = rEquipe;
$('ltUni').onchange = () => { LT_UNI = $('ltUni').value; rLotacao(); };
$('ltBusca').oninput = deb(rLtProfs); $('ltEsp').onchange = () => { $('ltAreas').querySelectorAll('tr[data-e]').forEach(x => x.classList.toggle('sel', x.dataset.e === $('ltEsp').value)); rLtProfs(); }; $('ltFonte').onchange = rLtProfs; $('ltCsv').onclick = csvLotacao; $('lhPer').onchange = $('lhEsp').onchange = rLtHorarios;
$('rpModo').onclick = e => { const b = e.target.closest('button'); if (!b) return; rpModo = b.dataset.v; try { localStorage.setItem('rpModo', rpModo); } catch (_) {} rRepasse(); };
['rpA', 'rpB', 'rpEsp', 'rpTipo', 'rpUni', 'rpVer', 'rpOrd'].forEach(id => $(id).onchange = () => rRepasse());
$('rpBusca').oninput = deb(() => rRepasse()); $('rpCsv').onclick = csvRepasse;
$('rpCfg').ontoggle = () => $('rpCfg').open && RP && rpCfg();
$('plBusca').oninput = deb(rPerdas);
$('sdBusca').oninput = deb(rSaidasTable); $('sdMot').onchange = rSaidasTable; $('sdCsv').onclick = csvSaidas;
const escuroAgora = () => { const r = document.documentElement; return r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
const temaTxt = () => { $('themeTxt').textContent = escuroAgora() ? 'Tema claro' : 'Tema escuro'; };
$('theme').onclick = e => {
  e.preventDefault();
  const r = document.documentElement;
  r.dataset.theme = escuroAgora() ? 'light' : 'dark';
  try { localStorage.setItem('cc-theme', r.dataset.theme); } catch (_) {}
  temaTxt(); fechaCfg();
  if (D) renderSection();
};
temaTxt();
/* engrenagem: menu com importar, tema e sair, ao lado do menu lateral */
function fechaCfg(){ $('cfgMenu').hidden = true; $('cfgBtn').setAttribute('aria-expanded', 'false'); }
$('cfgBtn').onclick = e => {
  e.preventDefault();
  const m = $('cfgMenu');
  if (!m.hidden) return fechaCfg();
  m.hidden = false; $('cfgBtn').setAttribute('aria-expanded', 'true');
  const b = $('cfgBtn').getBoundingClientRect(), h = m.offsetHeight;
  m.style.left = (b.right + 8) + 'px';
  m.style.top = Math.max(8, Math.min(b.bottom - h, innerHeight - h - 8)) + 'px';
  m.querySelector('[role=menuitem]')?.focus();
};
$('cfgMenu').querySelectorAll('a[data-s]').forEach(a => a.onclick = () => fechaCfg());
document.addEventListener('click', e => { if (!$('cfgMenu').hidden && !e.target.closest('#cfgMenu, #cfgBtn')) fechaCfg(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('cfgMenu').hidden) { fechaCfg(); $('cfgBtn').focus(); } });
addEventListener('resize', fechaCfg);
try { const t = localStorage.getItem('cc-theme'); if (t) document.documentElement.dataset.theme = t; } catch (_) {}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => D && renderSection());
window.addEventListener('hashchange', go);
(async () => { try { await loadMeta(); go(); await refresh(); } catch (e) { $('sub').textContent = 'Erro ao carregar: ' + e.message; } })();
