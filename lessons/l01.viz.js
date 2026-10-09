/* Lesson 01 · custom visualizations (Figures 1-1, 1-2, 1-3, key lab, FK walk, anomaly, closure, optimizer, pipeline). */
/* ================= hierarchical tree (Figure 1-1) ================= */
const ACC_LABEL = { CHK: 'Checking', SAV: 'Savings', MM: 'MoneyMkt', LOC: 'Line of credit' };
const txnLabel = (t) => `${t.txn_type_cd === 'DBT' ? 'Debit' : 'Credit'} $${t.amount.toFixed(2)}`;
(function hier() {
  const W = 820, NW = 92, NH = 38, TW = 104;
  const custs = T('customer').rows, accs = T('account').rows, txns = T('transaction').rows;
  const nodes = {}, edges = [];
  let slot = 0; const SW = 100, X0 = 60;
  const accX = {};
  for (const a of accs) {
    const ts = txns.filter((t) => t.account_id === a.account_id);
    const xs = [];
    ts.forEach((t) => { const x = X0 + slot * SW; xs.push(x); nodes['t' + t.txn_id] = { x, y: slot % 2 ? 268 : 206, w: TW, l1: txnLabel(t), l2: t.txn_date, row: t, kind: 't' }; slot++; });
    if (!ts.length) { xs.push(X0 + slot * SW); slot++; }
    accX[a.account_id] = xs.reduce((p, c) => p + c, 0) / xs.length;
  }
  for (const a of accs) nodes['a' + a.account_id] = { x: accX[a.account_id], y: 112, w: NW, l1: ACC_LABEL[a.product_cd], row: a, kind: 'a' };
  for (const c of custs) { const mine = accs.filter((a) => a.cust_id === c.cust_id); nodes['c' + c.cust_id] = { x: mine.reduce((p, a) => p + accX[a.account_id], 0) / mine.length, y: 22, w: 104, l1: `${c.fname} ${c.lname}`, row: c, kind: 'c' }; mine.forEach((a) => edges.push(['c' + c.cust_id, 'a' + a.account_id])); }
  for (const t of txns) edges.push(['a' + t.account_id, 't' + t.txn_id]);
  let svg = `<svg class="dg" viewBox="0 0 ${W} 320" role="img" aria-label="Hierarchical view of the account data: two customer trees">`;
  svg += `<text class="lbl" x="2" y="14">CUSTOMERS</text><text class="lbl" x="2" y="104">ACCOUNTS</text><text class="lbl" x="2" y="196">TRANSACTIONS</text>`;
  for (const [a, b] of edges) { const p = nodes[a], c = nodes[b]; const my = (p.y + NH + c.y) / 2; svg += `<path class="ln" data-e="${a}-${b}" d="M${p.x},${p.y + NH} V${my} H${c.x} V${c.y}"/>`; }
  for (const [id, n] of Object.entries(nodes)) {
    svg += `<g class="nd${n.kind === 't' ? ' small' : ''}" data-n="${id}"><rect x="${n.x - n.w / 2}" y="${n.y}" width="${n.w}" height="${NH}" rx="8"/>`;
    if (n.l2) svg += `<text x="${n.x}" y="${n.y + 16}" text-anchor="middle">${esc(n.l1)}</text><text x="${n.x}" y="${n.y + 30}" text-anchor="middle" style="fill:var(--muted)">${n.l2}</text>`;
    else svg += `<text x="${n.x}" y="${n.y + 23}" text-anchor="middle">${esc(n.l1)}</text>`;
    svg += '</g>';
  }
  svg += '</svg>';
  const box = $('#hierviz'); box.innerHTML = svg;
  let run = 0;
  const clear = () => { $$('.nd,.ln', box).forEach((e) => e.classList.remove('on', 'visited')); };
  const nodeEl = (id) => $(`[data-n="${id}"]`, box), edgeEl = (a, b) => $(`[data-e="${a}-${b}"]`, box);
  const msg = (t) => { $('#hiermsg').innerHTML = t; };
  async function sue() {
    const my = ++run; clear();
    const path = ['c2', 'a105', 't981'];
    msg('Locate Sue\'s tree, then walk down: customer → account → transaction.');
    for (let k = 0; k < path.length; k++) { if (my !== run) return; nodeEl(path[k]).classList.add('on'); if (k) edgeEl(path[k - 1], path[k]).classList.add('on'); await sleep(reduced ? 0 : 520); }
    if (my === run) msg('<b>3 nodes touched.</b> The question follows the tree\'s shape, so it\'s fast.');
  }
  async function all() {
    const my = ++run; clear(); let visited = 0, hits = 0;
    msg('No tree is organized by amount, so the system has to visit every node…');
    const order = [];
    for (const c of custs) { order.push(['c' + c.cust_id]); for (const a of accs.filter((x) => x.cust_id === c.cust_id)) { order.push(['a' + a.account_id, 'c' + c.cust_id]); for (const t of txns.filter((x) => x.account_id === a.account_id)) order.push(['t' + t.txn_id, 'a' + a.account_id]); } }
    for (const [id, par] of order) {
      if (my !== run) return; visited++;
      const n = nodes[id]; const el = nodeEl(id); el.classList.add('visited'); if (par) edgeEl(par, id).classList.add('visited');
      if (n.kind === 't' && n.row.txn_type_cd === 'DBT' && n.row.amount > 200) { el.classList.add('on'); hits++; }
      $('#hiermsg').innerHTML = `Visited <b>${visited}</b> nodes · found <b>${hits}</b>`;
      await sleep(reduced ? 0 : 160);
    }
    if (my === run) msg(`Visited <b>${visited} of ${order.length}</b> nodes to find <b>${hits}</b> debits. The tree's shape doesn't help a question that cuts across trees.`);
  }
  $$('[data-hier]').forEach((b) => b.addEventListener('click', () => { const m = b.dataset.hier; if (m === 'sue') sue(); else if (m === 'all') all(); else { run++; clear(); msg('Figure 1-1 from the book. Pick a question to see how the system answers it.'); } }));
})();

/* ================= network model (Figure 1-2) ================= */
(function net() {
  const custs = T('customer').rows, accs = T('account').rows, txns = T('transaction').rows, prods = T('product').rows;
  const NH = 32, nodes = {}, edges = [];
  const CX = 70, AX = 245, TX = 445, PX = 680;
  let ty = 10; const accY = {};
  for (const a of accs) {
    const ts = txns.filter((t) => t.account_id === a.account_id); const ys = [];
    ts.forEach((t) => { nodes['t' + t.txn_id] = { x: TX, y: ty, w: 150, l: `${txnLabel(t)} · ${t.txn_date.slice(5)}` }; ys.push(ty); ty += 40; });
    if (!ts.length) { ys.push(ty); ty += 40; }
    accY[a.account_id] = ys.reduce((p, c) => p + c, 0) / ys.length;
    if (a.cust_id !== (accs[accs.indexOf(a) + 1] || {}).cust_id) ty += 14;
  }
  const H = ty + 6;
  for (const a of accs) nodes['a' + a.account_id] = { x: AX, y: accY[a.account_id], w: 120, l: `${ACC_LABEL[a.product_cd]} ${a.account_id}` };
  for (const c of custs) { const mine = accs.filter((a) => a.cust_id === c.cust_id); nodes['c' + c.cust_id] = { x: CX, y: accY[mine[0].account_id], w: 110, l: `${c.fname} ${c.lname}` }; edges.push(['c' + c.cust_id, 'a' + mine[0].account_id, 'own']); for (let i = 1; i < mine.length; i++) edges.push(['a' + mine[i - 1].account_id, 'a' + mine[i].account_id, 'chain']); }
  for (const t of txns) edges.push(['a' + t.account_id, 't' + t.txn_id, 'txn']);
  prods.forEach((p, i) => { nodes['p' + p.product_cd] = { x: PX, y: 20 + i * ((H - 60) / (prods.length - 1)), w: 120, l: p.name, prod: true }; accs.filter((a) => a.product_cd === p.product_cd).forEach((a) => edges.push(['p' + p.product_cd, 'a' + a.account_id, 'prod'])); });
  let svg = `<svg class="dg" viewBox="0 0 760 ${H}" role="img" aria-label="Network view: customers, account chains, transactions and product records with links">`;
  svg += `<defs><marker id="ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8z" fill="currentColor"/></marker></defs>`;
  for (const [a, b, k] of edges) {
    const p = nodes[a], c = nodes[b]; let d;
    if (k === 'chain') d = `M${p.x - 40},${p.y + NH} C${p.x - 70},${(p.y + c.y + NH) / 2} ${c.x - 70},${(p.y + c.y + NH) / 2} ${c.x - 40},${c.y}`;
    else if (k === 'prod') d = `M${p.x - p.w / 2},${p.y + NH / 2} C${p.x - 150},${p.y + NH / 2} ${c.x + 140},${c.y + NH / 2} ${c.x + c.w / 2},${c.y + NH / 2}`;
    else d = `M${p.x + p.w / 2},${p.y + NH / 2} C${(p.x + c.x) / 2 + 10},${p.y + NH / 2} ${(p.x + c.x) / 2 - 10},${c.y + NH / 2} ${c.x - c.w / 2},${c.y + NH / 2}`;
    svg += `<path class="ln ${k === 'prod' ? 'prod' : ''}" data-e="${a}-${b}" d="${d}" style="color:var(--line2)" marker-end="url(#ar)" ${k === 'prod' ? 'opacity="0"' : ''}/>`;
  }
  for (const [id, n] of Object.entries(nodes)) svg += `<g class="nd small${n.prod ? ' prodnode' : ''}" data-n="${id}" ${n.prod ? 'opacity=".35"' : ''}><rect x="${n.x - n.w / 2}" y="${n.y}" width="${n.w}" height="${NH}" rx="8"/><text x="${n.x}" y="${n.y + 20}" text-anchor="middle">${esc(n.l)}</text></g>`;
  svg += `<text class="lbl" x="${CX - 50}" y="${H - 2}">CUSTOMERS</text><text class="lbl" x="${AX - 55}" y="${H - 2}">ACCOUNTS</text><text class="lbl" x="${TX - 60}" y="${H - 2}">TRANSACTIONS</text><text class="lbl" x="${PX - 45}" y="${H - 2}">PRODUCTS</text></svg>`;
  const box = $('#netviz'); box.innerHTML = svg;
  const ne = (id) => $(`[data-n="${id}"]`, box), ee = (a, b) => $(`[data-e="${a}-${b}"]`, box);
  const lis = $$('#netsteps li'); let step = 0, prodOn = false;
  const STEPS = [() => ne('c2').classList.add('on'), () => { ee('c2', 'a105').classList.add('on'); ne('a105').classList.add('visited'); }, () => { ee('a105', 'a106').classList.add('on'); ne('a106').classList.add('on'); }, () => { ee('a106', 't984').classList.add('on'); ne('t984').classList.add('on'); }];
  const btn = $('#netstep');
  btn.addEventListener('click', () => {
    if (step >= STEPS.length) { reset(); return; }
    STEPS[step](); lis.forEach((li, k) => { li.classList.toggle('cur', k === step); li.classList.toggle('done', k < step); }); step++;
    btn.textContent = step >= STEPS.length ? 'Done — start over' : `Walk the path: step ${step + 1}`;
  });
  function reset() { step = 0; $$('.nd,.ln', box).forEach((e) => { if (!e.classList.contains('prod') && !e.classList.contains('prodnode')) e.classList.remove('on', 'visited'); }); lis.forEach((li) => li.classList.remove('cur', 'done')); btn.textContent = 'Walk the path: step 1'; }
  $('#netreset').addEventListener('click', () => { reset(); if (prodOn) $('#netprod').click(); });
  $('#netprod').addEventListener('click', (e) => {
    prodOn = !prodOn; e.currentTarget.classList.toggle('on', prodOn);
    $$('.ln.prod', box).forEach((l) => { l.setAttribute('opacity', prodOn ? '1' : '0'); l.classList.toggle('on', prodOn && l.dataset.e.startsWith('pCHK')); });
    $$('.prodnode', box).forEach((n) => { n.setAttribute('opacity', prodOn ? '1' : '.35'); n.classList.toggle('on', prodOn && n.dataset.n === 'pCHK'); });
  });
})();

/* ================= relational explorer (Figure 1-3) ================= */
function related(tableName, row) {
  // BFS: from the start go both up (parents) and down (children); from parents only go up.
  const out = new Map(); const links = [];
  const key = (tn, r) => tn + ':' + pkKey(T(tn), r);
  const queue = [[tableName, row, 'both']]; out.set(key(tableName, row), { tn: tableName, r: row });
  while (queue.length) {
    const [tn, r, dir] = queue.shift(); const t = T(tn);
    for (const f of t.fks) {
      const pt = T(f.refTable); const pr = pt.rows.find((x) => f.cols.every((c, i) => x[f.refCols[i]] === r[c]));
      if (pr) { links.push({ from: [tn, r, f.cols[0]], to: [f.refTable, pr, f.refCols[0]] }); const k = key(f.refTable, pr); if (!out.has(k)) { out.set(k, { tn: f.refTable, r: pr }); queue.push([f.refTable, pr, 'up']); } }
    }
    if (dir === 'up') continue;
    for (const ct of Object.values(BASE.tables)) for (const f of ct.fks) {
      if (f.refTable !== tn) continue;
      for (const cr of ct.rows.filter((x) => f.cols.every((c, i) => x[c] === r[f.refCols[i]]))) { links.push({ from: [ct.name, cr, f.cols[0]], to: [tn, r, f.refCols[0]] }); const k = key(ct.name, cr); if (!out.has(k)) { out.set(k, { tn: ct.name, r: cr }); queue.push([ct.name, cr, 'down']); } }
    }
  }
  return { rows: out, links };
}
function describeRow(tn, r) {
  if (tn === 'customer') return `customer ${r.cust_id} (${r.fname} ${r.lname})`;
  if (tn === 'product') return `product '${r.product_cd}' (${r.name})`;
  if (tn === 'account') return `account ${r.account_id}`;
  return `transaction ${r.txn_id}`;
}
(function rel() {
  const box = $('#relviz');
  const left = h('div', { class: 'stack' }, renderTable('customer'), renderTable('product'));
  const right = h('div', { class: 'stack' }, renderTable('account'), renderTable('transaction'));
  box.append(left, right);
  let selKey = null;
  const cap = $('#relcap'); const capDefault = cap.innerHTML;
  box.addEventListener('click', (e) => {
    const tr = e.target.closest('tr.r'); if (!tr) return;
    const tn = tr.closest('[data-table]').dataset.table; const t = T(tn); const r = t.rows.find((x) => pkKey(t, x) === tr.dataset.key);
    const k = tn + ':' + tr.dataset.key;
    $$('tr.r', box).forEach((x) => x.classList.remove('sel', 'lit')); $$('td.link', box).forEach((x) => { x.classList.remove('link'); x.style.removeProperty('--lc'); });
    if (selKey === k) { selKey = null; box.classList.remove('has-sel'); cap.innerHTML = capDefault; return; }
    selKey = k; box.classList.add('has-sel');
    const { rows, links } = related(tn, r);
    for (const { tn: rt, r: rr } of rows.values()) { const el = $(`[data-table="${rt}"] tr[data-key="${CSS.escape(pkKey(T(rt), rr))}"]`, box); el.classList.add(rt === tn && rr === r ? 'sel' : 'lit'); }
    for (const l of links) for (const [lt, lr, lc] of [l.from, l.to]) { const td = $(`[data-table="${lt}"] tr[data-key="${CSS.escape(pkKey(T(lt), lr))}"] td[data-col="${lc}"]`, box); if (td) { td.classList.add('link'); td.style.setProperty('--lc', TABLE_COLOR[l.to[0]]); } }
    // caption: direct relations only
    const parts = [];
    for (const f of t.fks) { const pr = T(f.refTable).rows.find((x) => x[f.refCols[0]] === r[f.cols[0]]); parts.push(`<span class="v">${f.cols[0]} = ${fmt(r[f.cols[0]])}</span> matches ${describeRow(f.refTable, pr)}`); }
    for (const ct of Object.values(BASE.tables)) for (const f of ct.fks) if (f.refTable === tn) { const kids = ct.rows.filter((x) => x[f.cols[0]] === r[f.refCols[0]]); if (kids.length) parts.push(`${kids.length} ${ct.name} row${kids.length > 1 ? 's' : ''} carry <span class="v">${f.cols[0]} = ${fmt(r[f.refCols[0]])}</span>`); }
    const more = rows.size - 1 - parts.length;
    cap.innerHTML = `<b>${describeRow(tn, r)}</b>: ${parts.join(' · ') || 'no relationships'}${more > 0 ? ` <span class="muted">· lit rows also include what those rows link to</span>` : ''}`;
  });
})();

/* ================= key lab ================= */
(function keys() {
  let mode = 'natural', added = false, renamed = false, last = null;
  const box = $('#keyviz'), msg = $('#keymsg');
  function render() {
    box.innerHTML = '';
    const nat = mode === 'natural';
    const custHead = nat ? [['fname', 'pk'], ['lname', 'pk']] : [['cust_id', 'pk'], ['fname', ''], ['lname', '']];
    const cust = [{ cust_id: 1, fname: 'George', lname: 'Blake' }, { cust_id: 2, fname: 'Sue', lname: renamed ? 'Jones' : 'Smith' }];
    const rowsHtml = cust.map((c) => `<tr>${custHead.map(([k]) => `<td class="${renamed && c.cust_id === 2 && k === 'lname' ? (nat ? 'cellbad' : 'cellgood') : ''}">${c[k]}</td>`).join('')}</tr>`).join('');
    let extra = '';
    if (added) extra = nat ? `<tr><td class="cellbad">George</td><td class="cellbad">Blake</td></tr>` : `<tr><td class="cellgood">3</td><td class="cellgood">George</td><td class="cellgood">Blake</td></tr>`;
    box.append(h('div', { class: 'tblbox t-customer', html: `<table class="tbl"><caption>customer</caption><thead><tr>${custHead.map(([k, c]) => `<th class="${c}">${k}</th>`).join('')}</tr></thead><tbody>${rowsHtml}${extra}</tbody></table>` }));
    const accHead = nat ? ['account_id', 'cust_fname', 'cust_lname'] : ['account_id', 'cust_id'];
    const accs = T('account').rows.map((a) => ({ account_id: a.account_id, cust_id: a.cust_id, cust_fname: a.cust_id === 1 ? 'George' : 'Sue', cust_lname: a.cust_id === 1 ? 'Blake' : 'Smith' }));
    const accRows = accs.map((a) => `<tr>${accHead.map((k) => { const bad = nat && renamed && a.cust_id === 2 && k.startsWith('cust_'); return `<td class="${bad ? 'cellbad' : ''}">${a[k]}</td>`; }).join('')}</tr>`).join('');
    box.append(h('div', { class: 'tblbox t-account', html: `<table class="tbl"><caption>account</caption><thead><tr>${accHead.map((k, i) => `<th class="${i === 0 ? 'pk' : 'fk'}" style="--fkc:var(--t-customer)">${k}</th>`).join('')}</tr></thead><tbody>${accRows}</tbody></table>` }));
    const M = {
      'natural-add': ['bad', "ERROR: Duplicate entry 'George-Blake' for key 'PRIMARY'. A second, different George Blake can't become a customer."],
      'natural-ren': ['bad', "Sue's key changed from (Sue, Smith) to (Sue, Jones). Her 3 accounts still point at (Sue, Smith): orphaned, unless every reference is rewritten too."],
      'surrogate-add': ['good', 'Inserted as cust_id 3. Two George Blakes coexist; the surrogate key tells them apart.'],
      'surrogate-ren': ['good', 'One cell changed. Her accounts point at cust_id 2, which never changes.'],
    };
    if (last) { const [c, t] = M[`${mode}-${last}`]; msg.className = `banner ${c}`; msg.textContent = t; } else { msg.className = 'banner'; msg.textContent = nat ? 'Natural compound key: (fname, lname). Try both buttons, then switch to cust_id.' : 'Surrogate key: cust_id. Try both buttons.'; }
  }
  $$('#keymode button').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.m; $$('#keymode button').forEach((x) => x.classList.toggle('on', x === b)); added = renamed = false; last = null; render(); }));
  $('#keyadd').addEventListener('click', () => { added = true; last = 'add'; render(); });
  $('#keyren').addEventListener('click', () => { renamed = true; last = 'ren'; render(); });
  $('#keyreset').addEventListener('click', () => { added = renamed = false; last = null; render(); });
  render();
})();

/* ================= FK walk ================= */
(function fk() {
  const box = $('#fkviz');
  const tc = renderTable('customer', { compact: true }), tp = renderTable('product', { compact: true }), ta = renderTable('account', { compact: true }), tt = renderTable('transaction', { compact: true, cols: ['txn_id', 'account_id', 'amount'] });
  box.append(h('div', { class: 'stack' }, tc, tp), h('div', { class: 'stack' }, ta, tt));
  box.classList.add('rel');
  const lis = $$('#fksteps li'); let step = 0; const btn = $('#fknext');
  const mark = (tn, key, cls, cols = []) => { const tr = $(`[data-table="${tn}"] tr[data-key="${key}"]`, box); tr.classList.add(cls); cols.forEach(([c, color]) => { const td = $(`td[data-col="${c}"]`, tr); td.classList.add('link'); td.style.setProperty('--lc', color); }); };
  const STEPS = [
    () => mark('customer', '1', 'sel', [['cust_id', TABLE_COLOR.customer]]),
    () => mark('product', 'CHK', 'sel', [['product_cd', TABLE_COLOR.product]]),
    () => mark('account', '103', 'sel', [['cust_id', TABLE_COLOR.customer], ['product_cd', TABLE_COLOR.product], ['account_id', TABLE_COLOR.account]]),
    () => { mark('transaction', '978', 'sel', [['account_id', TABLE_COLOR.account]]); mark('transaction', '979', 'sel', [['account_id', TABLE_COLOR.account]]); },
  ];
  function reset() { step = 0; box.classList.remove('has-sel'); $$('tr.r', box).forEach((x) => x.classList.remove('sel', 'lit')); $$('td.link', box).forEach((x) => x.classList.remove('link')); lis.forEach((l) => l.classList.remove('cur', 'done')); btn.textContent = 'Step 1'; }
  btn.addEventListener('click', () => {
    if (step >= STEPS.length) { reset(); return; }
    box.classList.add('has-sel'); STEPS[step](); lis.forEach((li, k) => { li.classList.toggle('cur', k === step); li.classList.toggle('done', k < step); }); step++;
    btn.textContent = step >= STEPS.length ? 'Start over' : `Step ${step + 1}`;
  });
  $('#fkreset').addEventListener('click', reset);
})();

/* ================= update anomaly ================= */
(function anomaly() {
  const box = $('#anomviz'); let done = false;
  function render() {
    box.innerHTML = '';
    const accs = T('account').rows; const prod = Object.fromEntries(T('product').rows.map((p) => [p.product_cd, p.name]));
    const name = (a) => a.cust_id === 1 ? 'George Blake' : (done && a.account_id === 105 ? 'Sue Jones' : 'Sue Smith');
    const lrows = accs.map((a) => `<tr><td>${a.account_id}</td><td class="${done && a.cust_id === 2 ? (a.account_id === 105 ? 'cellgood' : 'cellbad') : ''}">${name(a)}</td><td>${prod[a.product_cd]}</td></tr>`).join('');
    const left = h('div', { class: 'stack' },
      h('pre', { class: 'code', style: 'font-size:12.5px', html: hlSQL("UPDATE account_report\nSET owner_name = 'Sue Jones'\nWHERE account_id = 105;") }),
      h('div', { class: 'tblbox', html: `<table class="tbl"><caption>account_report · denormalized</caption><thead><tr><th class="pk">account_id</th><th>owner_name</th><th>product</th></tr></thead><tbody>${lrows}</tbody></table>` }),
      h('div', { class: `banner ${done ? 'bad' : ''}` }, done ? '1 row affected — but Sue\'s name lives in 3 rows. The table now disagrees with itself: Smith or Jones?' : 'Sue\'s name is stored once per account.'));
    const crow = `<tr><td>1</td><td>George</td><td>Blake</td></tr><tr><td>2</td><td>Sue</td><td class="${done ? 'cellgood' : ''}">${done ? 'Jones' : 'Smith'}</td></tr>`;
    const arows = accs.map((a) => `<tr><td>${a.account_id}</td><td>${a.cust_id}</td><td>${a.product_cd}</td></tr>`).join('');
    const right = h('div', { class: 'stack' },
      h('pre', { class: 'code', style: 'font-size:12.5px', html: hlSQL("UPDATE customer\nSET lname = 'Jones'\nWHERE cust_id = 2;") }),
      h('div', { class: 'grid2', style: 'gap:10px', html: `<div class="tblbox t-customer"><table class="tbl"><caption>customer</caption><thead><tr><th class="pk">cust_id</th><th>fname</th><th>lname</th></tr></thead><tbody>${crow}</tbody></table></div><div class="tblbox t-account"><table class="tbl"><caption>account</caption><thead><tr><th class="pk">account_id</th><th class="fk" style="--fkc:var(--t-customer)">cust_id</th><th class="fk" style="--fkc:var(--t-product)">product_cd</th></tr></thead><tbody>${arows}</tbody></table></div>` }),
      h('div', { class: `banner ${done ? 'good' : ''}` }, done ? '1 row affected, and that\'s every copy: all 3 of Sue\'s accounts reach the new name through cust_id = 2.' : 'Sue\'s name is stored exactly once.'));
    box.append(left, right);
  }
  $('#anomrun').addEventListener('click', () => { done = true; render(); });
  $('#anomreset').addEventListener('click', () => { done = false; render(); });
  render();
})();

/* ================= closure diagram ================= */
$('#closureviz').innerHTML = `<svg class="dg" viewBox="0 0 560 220" role="img" aria-label="Tables feed a query, which produces a result set that can be stored or queried again">
<defs><marker id="ar2" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8z" fill="var(--muted)"/></marker></defs>
<g class="nd"><rect x="10" y="30" width="110" height="40" rx="8" style="stroke:var(--t-customer)"/><text x="65" y="55" text-anchor="middle">customer</text></g>
<g class="nd"><rect x="10" y="100" width="110" height="40" rx="8" style="stroke:var(--t-account)"/><text x="65" y="125" text-anchor="middle">account</text></g>
<path class="ln" d="M120,50 C160,50 160,90 196,90" marker-end="url(#ar2)" style="stroke-dasharray:6 5;animation:dash 1.2s linear infinite"/>
<path class="ln" d="M120,120 C160,120 160,100 196,100" marker-end="url(#ar2)" style="stroke-dasharray:6 5;animation:dash 1.2s linear infinite"/>
<g class="nd"><rect x="200" y="74" width="110" height="44" rx="22" style="stroke:var(--amber);fill:color-mix(in srgb,var(--amber) 14%,var(--panel2))"/><text x="255" y="101" text-anchor="middle" style="font-family:'JetBrains Mono';font-size:12.5px">SELECT …</text></g>
<path class="ln" d="M310,96 H366" marker-end="url(#ar2)" style="stroke-dasharray:6 5;animation:dash 1.2s linear infinite"/>
<g class="nd"><rect x="370" y="74" width="120" height="44" rx="8" style="stroke:var(--green);stroke-dasharray:5 4"/><text x="430" y="101" text-anchor="middle">result set</text></g>
<path class="ln" d="M430,118 V160 H300" marker-end="url(#ar2)"/><text x="350" y="178" class="lbl" text-anchor="middle">STORE AS A NEW TABLE</text>
<path class="ln" d="M490,96 H520 V30 H270 V70" marker-end="url(#ar2)"/><text x="395" y="22" class="lbl" text-anchor="middle">INPUT TO ANOTHER QUERY</text>
<g class="nd"><rect x="190" y="150" width="110" height="36" rx="8" style="stroke:var(--green)"/><text x="245" y="173" text-anchor="middle">new table</text></g>
</svg>`;

/* ================= optimizer: scan vs index ================= */
(function optimizer() {
  const PEOPLE = [['Tanaka', 'Yuki'], ['Smith', 'Sue'], ['Adams', 'Ray'], ['Patel', 'Anya'], ['Kim', 'Min'], ['Garcia', 'Luis'], ['Blake', 'George'], ['Nguyen', 'Linh'], ['Evans', 'Tom'], ['Hughes', 'Ada'], ['Smith', 'Joe'], ['Chen', 'Wei'], ['Lopez', 'Ana'], ['Davis', 'Kai'], ['Moreno', 'Eva'], ['Baker', 'Ian']];
  const rows = PEOPLE.map(([l, f], i) => ({ id: i + 1, lname: l, fname: f }));
  let mode = 'off', run = 0;
  const box = $('#optviz'), cnt = $('#optcount'), msg = $('#optmsg');
  function render() {
    const list = mode === 'off' ? rows : [...rows].sort((a, b) => a.lname.localeCompare(b.lname) || a.id - b.id);
    box.innerHTML = `<div class="muted" style="font-size:13px;margin-bottom:6px">${mode === 'off' ? 'customer table, in storage order (cust_id · lname)' : 'index on lname — sorted, each entry points to a row'}</div><div class="opt-grid">${list.map((r) => `<div class="opt-cell" data-id="${r.id}">${mode === 'off' ? r.id + ' · ' : ''}${r.lname}${mode === 'on' ? ' → ' + r.id : ''}</div>`).join('')}</div>`;
    cnt.textContent = '0'; msg.innerHTML = 'Rows examined: <span class="counter" id="optcount">0</span>';
  }
  async function go() {
    const my = ++run; render(); const cells = $$('.opt-cell', box); const c = () => $('#optcount');
    const d = reduced ? 0 : 150;
    if (mode === 'off') {
      let n = 0;
      for (const cell of cells) { if (my !== run) return; cell.classList.add('scan'); n++; c().textContent = n; await sleep(d); cell.classList.remove('scan'); cell.classList.add(cell.textContent.includes('Smith') ? 'hit' : 'seen'); }
      msg.innerHTML = `Full table scan: examined <b>16 of 16</b> rows to return <b>2</b>. At 10 million rows, that's 10,000,000 reads.`;
    } else {
      const sorted = cells.map((x) => x.textContent.split(' → ')[0]);
      let lo = 0, hi = sorted.length, probes = 0;
      while (lo < hi) { if (my !== run) return; const mid = (lo + hi) >> 1; probes++; cells[mid].classList.add('scan'); msg.innerHTML = `Index probes: <span class="counter">${probes}</span>`; await sleep(d * 3); cells[mid].classList.remove('scan'); cells[mid].classList.add('seen'); if (sorted[mid] < 'Smith') lo = mid + 1; else hi = mid; }
      let k = lo; while (k < sorted.length && sorted[k] === 'Smith') { cells[k].classList.add('hit'); k++; await sleep(d * 2); }
      msg.innerHTML = `Index seek: <b>${probes} probes + 2 row fetches</b> instead of 16 reads. At 10 million rows: about 24 probes. Same SQL text.`;
    }
  }
  $$('#optmode button').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.m; $$('#optmode button').forEach((x) => x.classList.toggle('on', x === b)); run++; render(); }));
  $('#optrun').addEventListener('click', go);
  render();
})();

/* ================= query pipeline ================= */
(function pipeline() {
  const box = $('#pipeviz'); let step = 0; const btn = $('#pipenext'); const count = $('#pipecount');
  const t = T('transaction'); const cols = t.cols;
  box.innerHTML = `<div class="tblbox t-txn"><table class="tbl"><thead><tr>${cols.map((c) => `<th data-c="${c.name}">${c.name}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr class="pipe-row" data-acc="${r.account_id}">${cols.map((c) => `<td data-c="${c.name}">${fmt(r[c.name], c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const tbl = $('table', box); tbl.style.opacity = '.25';
  const LABELS = ['Run step 1: FROM', 'Run step 2: WHERE', 'Run step 3: SELECT', 'Start over'];
  const hlc = (c) => $$('#pipeq .clause').forEach((x) => x.classList.toggle('on', x.dataset.c === c));
  function reset() { step = 0; tbl.style.opacity = '.25'; $$('.faded,.keep', box).forEach((x) => x.classList.remove('faded', 'keep')); hlc(null); count.textContent = ''; btn.textContent = LABELS[0]; }
  btn.addEventListener('click', () => {
    if (step === 3) { reset(); return; }
    if (step === 0) { tbl.style.opacity = '1'; hlc('from'); count.textContent = '7 rows in transaction'; }
    if (step === 1) { hlc('where'); $$('tr.pipe-row', box).forEach((r) => { const keep = r.dataset.acc === '105'; $$('td', r).forEach((td) => td.classList.add(keep ? 'keep' : 'faded')); }); count.textContent = '3 of 7 rows match'; }
    if (step === 2) { hlc('select'); $$('[data-c]', box).forEach((c) => { if (!['txn_id', 'amount'].includes(c.dataset.c)) c.classList.add('faded'); }); count.textContent = 'result set: 3 rows × 2 columns'; }
    step++; btn.textContent = LABELS[step];
  });
  reset();
})();
