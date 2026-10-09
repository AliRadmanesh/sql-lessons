/* MiniSQL — a small SQL engine for lesson sandboxes, with two dialects:
   MiniSQL.create(seed, { dialect: 'postgres' | 'mysql' })   (default 'mysql', used by Lesson 01)
   postgres: "quoted identifiers", case-sensitive strings, ILIKE, || concat, ::casts, serial / GENERATED AS IDENTITY,
             boolean/text/timestamp types, CREATE TYPE … AS ENUM, RETURNING, psql-style status lines (INSERT 0 1),
             PostgreSQL error messages, \dt and \d table meta-commands, UPDATE counts matched rows.
   mysql:    `backticks`, case-insensitive strings, AUTO_INCREMENT, inline ENUM, MySQL messages, SHOW TABLES / DESCRIBE.
   Supports: CREATE/DROP TABLE (PK, FK, NOT NULL, AUTO_INCREMENT), INSERT, UPDATE, DELETE,
   SELECT (DISTINCT, INNER/LEFT/CROSS JOIN, WHERE, ORDER BY, LIMIT), START TRANSACTION/COMMIT/ROLLBACK,
   SHOW TABLES, DESCRIBE. String comparison is case-insensitive, like MySQL's default collation. */
const MiniSQL = (() => {
  class SQLError extends Error { constructor(m) { super(m); this.name = 'SQLError'; } }
  const err = (m) => new SQLError(m);
  let PG = false; // current dialect; set by Database.exec before tokenizing/executing
  const q = (n) => PG ? `"${n}"` : `'${n}'`;

  const RESERVED = new Set(('select from where and or not insert into values update set delete create table drop ' +
    'inner join on as order by asc desc limit offset distinct null is in like between group having left right outer ' +
    'cross union constraint primary foreign references returning ilike').split(' '));
  const AGG = new Set(['count', 'sum', 'avg', 'min', 'max', 'group_concat']);

  /* ---------------- tokenizer ---------------- */
  function tokenize(src) {
    const t = []; let i = 0; const n = src.length;
    while (i < n) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if ((c === '-' && src[i + 1] === '-') || (c === '#' && !PG)) { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); if (e < 0) throw err('Unclosed /* comment'); i = e + 2; continue; }
      const s = i;
      if (PG && c === '"') {
        const e = src.indexOf('"', i + 1); if (e < 0) throw err('unterminated quoted identifier — every opening " needs a closing one');
        const v = src.slice(i + 1, e); i = e + 1; t.push({ type: 'word', v, lc: v, quoted: true, s, e: i }); continue;
      }
      if (PG && c === '\\') {
        const m = /^\\([a-zA-Z+]+)/.exec(src.slice(i)); if (!m) throw err(`syntax error at or near "\\"`);
        i += m[0].length; t.push({ type: 'meta', v: m[1].replace('+', ''), s, e: i }); continue;
      }
      if (c === "'" || c === '"') {
        let v = ''; i++;
        for (;;) {
          if (i >= n) throw err('Unclosed string literal — every opening quote needs a closing one');
          if (src[i] === c) { if (src[i + 1] === c) { v += c; i += 2; continue; } i++; break; }
          if (!PG && src[i] === '\\' && i + 1 < n) { v += src[i + 1]; i += 2; continue; }
          v += src[i++];
        }
        t.push({ type: 'str', v, s, e: i }); continue;
      }
      if (c === '`' && PG) throw err('syntax error at or near "`" — PostgreSQL quotes identifiers with double quotes: "my col"');
      if (c === '`') {
        const e = src.indexOf('`', i + 1); if (e < 0) throw err('Unclosed `identifier`');
        const v = src.slice(i + 1, e); i = e + 1; t.push({ type: 'word', v, lc: v.toLowerCase(), quoted: true, s, e: i }); continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        const m = /^[0-9]*\.?[0-9]+(e[+-]?[0-9]+)?|^[0-9]+\.?/i.exec(src.slice(i));
        i += m[0].length; t.push({ type: 'num', v: Number(m[0]), s, e: i }); continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        const m = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(src.slice(i)); i += m[0].length;
        t.push({ type: 'word', v: m[0], lc: m[0].toLowerCase(), s, e: i }); continue;
      }
      const two = src.substr(i, 2);
      if (['<=', '>=', '<>', '!=', '||', '::'].includes(two)) { t.push({ type: 'op', v: two, s, e: i + 2 }); i += 2; continue; }
      if ('=<>(),.;*+-/%'.includes(c)) { t.push({ type: 'op', v: c, s, e: i + 1 }); i++; continue; }
      throw err(`Unexpected character '${c}'`);
    }
    t.push({ type: 'eof', s: n, e: n });
    return t;
  }

  /* ---------------- parser ---------------- */
  class Parser {
    constructor(src) { this.src = src; this.t = tokenize(src); this.p = 0; }
    peek(o = 0) { return this.t[this.p + o]; }
    next() { return this.t[this.p++]; }
    isKw(w, o = 0) { const k = this.peek(o); return k.type === 'word' && !k.quoted && k.lc === w; }
    isOp(v, o = 0) { const k = this.peek(o); return k.type === 'op' && k.v === v; }
    acceptKw(w) { if (this.isKw(w)) { this.p++; return true; } return false; }
    acceptOp(v) { if (this.isOp(v)) { this.p++; return true; } return false; }
    near() {
      const k = this.peek();
      if (PG) return k.type === 'eof' ? 'at end of input' : `at or near "${this.src.slice(k.s, k.e)}"`;
      if (k.type === 'eof') return 'at the end of the statement';
      return `near '${this.src.slice(k.s, k.s + 30).split('\n')[0]}'`;
    }
    fail(what) { throw err(`${PG ? 'syntax error' : 'Syntax error'} ${this.near()}${what ? ` — expected ${what}` : ''}`); }
    expectKw(w) { if (!this.acceptKw(w)) this.fail(w.toUpperCase()); }
    expectOp(v) { if (!this.acceptOp(v)) this.fail(`'${v}'`); }
    ident(what = 'a name') {
      const k = this.peek();
      if (k.type === 'word' && (k.quoted || !RESERVED.has(k.lc))) { this.p++; return k.quoted ? k.v : k.lc; }
      if (k.type === 'word') throw err(PG ? `syntax error ${this.near()} — ${k.v.toUpperCase()} is a reserved word; to use it as ${what}, double-quote it` : `'${k.v.toUpperCase()}' is a reserved word and can't be used as ${what} here (${this.near()})`);
      this.fail(what);
    }

    parseScript() {
      const out = [];
      while (this.peek().type !== 'eof') {
        if (this.acceptOp(';')) continue;
        const s = this.peek().s;
        const st = this.parseStatement();
        st.text = this.src.slice(s, this.t[this.p - 1].e).trim();
        out.push(st);
        if (!this.acceptOp(';') && this.peek().type !== 'eof') this.fail("';' between statements");
      }
      return out;
    }
    parseStatement() {
      const k = this.peek();
      if (k.type === 'meta') {
        this.next();
        if (k.v === 'dt') return { kind: 'showtables' };
        if (k.v === 'd') { if (this.peek().type === 'word') return { kind: 'describe', table: this.ident('a table name') }; return { kind: 'showtables' }; }
        throw err(`invalid command \\${k.v} — this sandbox supports \\dt (list tables) and \\d table (describe)`);
      }
      if (PG && k.type === 'word' && (k.lc === 'show' || k.lc === 'describe' || k.lc === 'desc')) throw err(`${k.lc === 'show' ? 'SHOW TABLES' : 'DESCRIBE'} is MySQL. In PostgreSQL use psql's ${k.lc === 'show' ? '\\dt' : '\\d table_name'}, or query information_schema.`);
      if (k.type !== 'word') this.fail('a statement such as SELECT');
      switch (k.lc) {
        case 'select': return this.parseSelect();
        case 'insert': return this.parseInsert();
        case 'update': return this.parseUpdate();
        case 'delete': return this.parseDelete();
        case 'create': return this.parseCreate();
        case 'drop': { this.next(); this.expectKw('table'); let ie = false; if (this.acceptKw('if')) { this.expectKw('exists'); ie = true; } return { kind: 'drop', table: this.ident('a table name'), ifExists: ie }; }
        case 'start': this.next(); this.expectKw('transaction'); return { kind: 'begin' };
        case 'begin': this.next(); this.acceptKw('work'); return { kind: 'begin' };
        case 'commit': this.next(); this.acceptKw('work'); return { kind: 'commit' };
        case 'rollback': this.next(); this.acceptKw('work'); return { kind: 'rollback' };
        case 'show': this.next(); this.expectKw('tables'); return { kind: 'showtables' };
        case 'describe': case 'desc': this.next(); return { kind: 'describe', table: this.ident('a table name') };
        case 'alter': case 'truncate': case 'grant': case 'revoke':
          throw err(`${k.v.toUpperCase()} is real SQL, but this lesson's sandbox doesn't run it yet.`);
        default: this.fail('a statement such as SELECT, INSERT, UPDATE or DELETE');
      }
    }
    parseSelect() {
      this.expectKw('select');
      const st = { kind: 'select', distinct: false, items: [], from: null, joins: [], where: null, order: [], limit: null, offset: 0 };
      if (this.acceptKw('distinct')) st.distinct = true; else this.acceptKw('all');
      do {
        if (this.isOp('*')) { this.next(); st.items.push({ star: true }); continue; }
        if (this.peek().type === 'word' && this.isOp('.', 1) && this.isOp('*', 2)) {
          const tb = this.ident(); this.next(); this.next(); st.items.push({ star: true, table: tb }); continue;
        }
        const s = this.peek().s; const e = this.parseExpr(); const text = this.src.slice(s, this.t[this.p - 1].e);
        let alias = null;
        if (this.acceptKw('as')) { const k = this.next(); if (k.type === 'str') alias = k.v; else if (k.type === 'word') alias = k.v; else this.fail('an alias'); }
        else if (this.peek().type === 'word' && !RESERVED.has(this.peek().lc)) alias = this.next().v;
        else if (this.peek().type === 'str') alias = this.next().v;
        st.items.push({ expr: e, alias, text });
      } while (this.acceptOp(','));
      if (this.acceptKw('from')) {
        st.from = this.parseTableRef();
        for (;;) {
          if (this.acceptOp(',')) { st.joins.push({ type: 'cross', ref: this.parseTableRef() }); continue; }
          let type = null;
          if (this.isKw('inner') && this.isKw('join', 1)) { this.p += 2; type = 'inner'; }
          else if (this.isKw('join')) { this.p++; type = 'inner'; }
          else if (this.isKw('cross') && this.isKw('join', 1)) { this.p += 2; type = 'cross'; }
          else if (this.isKw('left')) { this.p++; this.acceptKw('outer'); this.expectKw('join'); type = 'left'; }
          else if (this.isKw('right') || this.isKw('full')) throw err('RIGHT/FULL outer joins arrive in a later lesson — this sandbox supports INNER, LEFT and CROSS joins.');
          else if (this.isKw('natural')) throw err('NATURAL JOIN arrives in a later lesson — write the join condition with ON instead.');
          if (!type) break;
          const ref = this.parseTableRef(); let on = null;
          if (type !== 'cross') {
            if (this.acceptKw('on')) on = this.parseExpr();
            else if (this.isKw('using')) throw err('JOIN … USING arrives in a later lesson — write it with ON a.col = b.col.');
            else this.fail('ON <join condition> after the joined table');
          }
          st.joins.push({ type, ref, on });
        }
      }
      if (this.acceptKw('where')) st.where = this.parseExpr();
      if (this.isKw('group') || this.isKw('having')) throw err('GROUP BY / HAVING arrive in Lesson 8 — this lesson\'s sandbox doesn\'t run them yet.');
      if (this.isKw('union') || this.isKw('intersect') || this.isKw('except')) throw err('Set operators (UNION…) arrive in Lesson 6.');
      if (this.acceptKw('order')) {
        this.expectKw('by');
        do { const e = this.parseExpr(); let desc = false; if (this.acceptKw('desc')) desc = true; else this.acceptKw('asc'); st.order.push({ expr: e, desc }); } while (this.acceptOp(','));
      }
      if (this.acceptKw('limit')) {
        const a = this.next(); if (a.type !== 'num') this.fail('a number after LIMIT');
        if (this.acceptOp(',')) { const b = this.next(); if (b.type !== 'num') this.fail('a number'); st.offset = a.v; st.limit = b.v; }
        else { st.limit = a.v; if (this.acceptKw('offset')) { const b = this.next(); if (b.type !== 'num') this.fail('a number'); st.offset = b.v; } }
      }
      return st;
    }
    parseTableRef() {
      if (this.isOp('(')) throw err('Subqueries in FROM arrive in Lesson 9.');
      const name = this.ident('a table name'); let alias = name;
      if (this.acceptKw('as')) alias = this.ident('a table alias');
      else if (this.peek().type === 'word' && !RESERVED.has(this.peek().lc) && !['inner', 'join', 'left', 'right', 'cross', 'full', 'natural', 'using', 'limit', 'offset', 'intersect', 'except'].includes(this.peek().lc)) alias = this.ident();
      return { name, alias };
    }
    parseInsert() {
      this.expectKw('insert'); this.acceptKw('into');
      const table = this.ident('a table name'); let cols = null;
      if (this.acceptOp('(')) { cols = []; do cols.push(this.ident('a column name')); while (this.acceptOp(',')); this.expectOp(')'); }
      if (this.isKw('select')) throw err('INSERT … SELECT arrives in a later lesson — use VALUES (…) here.');
      if (!this.acceptKw('values') && !this.acceptKw('value')) this.fail('VALUES');
      const rows = [];
      do { this.expectOp('('); const r = []; do r.push(this.parseExpr()); while (this.acceptOp(',')); this.expectOp(')'); rows.push(r); } while (this.acceptOp(','));
      return { kind: 'insert', table, cols, rows, returning: this.parseReturning() };
    }
    parseUpdate() {
      this.expectKw('update'); const table = this.ident('a table name'); this.expectKw('set');
      const sets = [];
      do { const c = this.ident('a column name'); if (this.acceptOp('.')) { /* allow t.col */ const c2 = this.ident(); sets.push({ col: c2, expr: (this.expectOp('='), this.parseExpr()) }); continue; } this.expectOp('='); sets.push({ col: c, expr: this.parseExpr() }); } while (this.acceptOp(','));
      let where = null; if (this.acceptKw('where')) where = this.parseExpr();
      let limit = null; if (this.isKw('limit')) { if (PG) throw err('syntax error at or near "LIMIT" — PostgreSQL has no UPDATE … LIMIT; narrow the WHERE clause instead'); this.next(); const a = this.next(); if (a.type !== 'num') this.fail('a number'); limit = a.v; }
      return { kind: 'update', table, sets, where, limit, returning: this.parseReturning() };
    }
    parseDelete() {
      this.expectKw('delete'); this.expectKw('from'); const table = this.ident('a table name');
      let where = null; if (this.acceptKw('where')) where = this.parseExpr();
      let limit = null; if (this.isKw('limit')) { if (PG) throw err('syntax error at or near "LIMIT" — PostgreSQL has no DELETE … LIMIT; narrow the WHERE clause instead'); this.next(); const a = this.next(); if (a.type !== 'num') this.fail('a number'); limit = a.v; }
      return { kind: 'delete', table, where, limit, returning: this.parseReturning() };
    }
    parseReturning() {
      if (!this.isKw('returning')) return null;
      if (!PG) throw err('RETURNING is PostgreSQL (MariaDB has it too) — in MySQL, run a SELECT afterwards or use LAST_INSERT_ID().');
      this.next(); const items = [];
      do {
        if (this.acceptOp('*')) { items.push({ star: true }); continue; }
        const s = this.peek().s; const e = this.parseExpr(); const text = this.src.slice(s, this.t[this.p - 1].e);
        let alias = null; if (this.acceptKw('as')) alias = this.next().v; else if (this.peek().type === 'word' && !RESERVED.has(this.peek().lc)) alias = this.next().v;
        items.push({ expr: e, alias, text });
      } while (this.acceptOp(','));
      return items;
    }
    parseCreate() {
      this.expectKw('create');
      if (this.acceptKw('type')) {
        if (!PG) throw err('CREATE TYPE is PostgreSQL — in MySQL write ENUM(...) inline in the column definition.');
        const name = this.ident('a type name'); this.expectKw('as'); this.expectKw('enum'); this.expectOp('(');
        const vals = []; do { const v = this.next(); if (v.type !== 'str') this.fail('a quoted label'); vals.push(v.v); } while (this.acceptOp(','));
        this.expectOp(')'); return { kind: 'createtype', name, vals };
      }
      this.expectKw('table');
      let ine = false; if (this.acceptKw('if')) { this.expectKw('not'); this.expectKw('exists'); ine = true; }
      const name = this.ident('a table name'); this.expectOp('(');
      const cols = [], pk = [], fks = [], uniques = [], checks = [];
      do {
        if (this.acceptKw('constraint')) this.ident('a constraint name');
        if (this.acceptKw('primary')) { this.expectKw('key'); this.expectOp('('); do pk.push(this.ident()); while (this.acceptOp(',')); this.expectOp(')'); continue; }
        if (this.acceptKw('foreign')) {
          this.expectKw('key'); this.expectOp('('); const fc = []; do fc.push(this.ident()); while (this.acceptOp(',')); this.expectOp(')');
          this.expectKw('references'); const rt = this.ident('a table name'); this.expectOp('('); const rc = []; do rc.push(this.ident()); while (this.acceptOp(',')); this.expectOp(')');
          while (this.acceptKw('on')) { this.next(); this.next(); if (this.isKw('null') || this.isKw('action')) this.next(); }
          fks.push({ cols: fc, refTable: rt, refCols: rc }); continue;
        }
        if (PG && this.acceptKw('check')) { this.expectOp('('); checks.push(this.parseExpr()); this.expectOp(')'); continue; }
        if (this.acceptKw('unique')) { this.acceptKw('key'); this.expectOp('('); const u = []; do u.push(this.ident()); while (this.acceptOp(',')); this.expectOp(')'); uniques.push(u); continue; }
        const cname = this.ident('a column name');
        const tk = this.next(); if (tk.type !== 'word') this.fail('a data type');
        let ty = tk.lc;
        if (ty === 'double' && this.acceptKw('precision')) ty = 'double';
        if (ty === 'character' && this.acceptKw('varying')) ty = 'varchar';
        if (ty === 'timestamp' || ty === 'time') { if (this.acceptKw('with')) { this.expectKw('time'); this.expectKw('zone'); ty += 'tz'; } else if (this.acceptKw('without')) { this.expectKw('time'); this.expectKw('zone'); } }
        const col = { name: cname, type: ty, len: null, scale: null, notNull: false, autoInc: false, def: undefined };
        if (PG) {
          if (['serial', 'serial4', 'bigserial', 'serial8', 'smallserial', 'serial2'].includes(ty)) { col.type = ty.startsWith('big') || ty === 'serial8' ? 'bigint' : ty.startsWith('small') || ty === 'serial2' ? 'smallint' : 'integer'; col.autoInc = 'serial'; col.notNull = true; }
          else if (ty === 'int4') col.type = 'integer'; else if (ty === 'int8') col.type = 'bigint'; else if (ty === 'int2') col.type = 'smallint';
          else if (ty === 'bool') col.type = 'boolean'; else if (ty === 'float8') col.type = 'double'; else if (ty === 'float4') col.type = 'real';
          else if (['tinyint', 'mediumint', 'datetime', 'enum'].includes(ty)) throw err(ty === 'enum' ? 'PostgreSQL has no inline ENUM(...) column type — create it first: CREATE TYPE name AS ENUM (\'a\', \'b\'), then use name as the column type.' : `type "${ty}" does not exist — ${ty === 'datetime' ? 'PostgreSQL uses timestamp (or timestamptz)' : 'PostgreSQL has smallint, integer and bigint'}`);
          col.pgType = !['integer', 'int', 'smallint', 'bigint', 'numeric', 'decimal', 'real', 'double', 'float', 'varchar', 'char', 'text', 'date', 'boolean', 'timestamp', 'timestamptz', 'time', 'timetz', 'json', 'jsonb', 'uuid'].includes(col.type) ? col.type : null;
        }
        if (this.acceptOp('(')) {
          if (col.type === 'enum') { col.enumVals = []; do { const s = this.next(); if (s.type !== 'str') this.fail('a quoted value'); col.enumVals.push(s.v); } while (this.acceptOp(',')); }
          else { const a = this.next(); col.len = a.v; if (this.acceptOp(',')) col.scale = this.next().v; }
          this.expectOp(')');
        }
        for (;;) {
          if (PG && (this.isKw('unsigned') || this.isKw('auto_increment'))) throw err(this.isKw('unsigned') ? 'syntax error at or near "UNSIGNED" — PostgreSQL has no unsigned integers; add CHECK (col >= 0) if you need it' : 'syntax error at or near "AUTO_INCREMENT" — in PostgreSQL write  id integer GENERATED ALWAYS AS IDENTITY  (or the older serial type)');
          if (PG && this.acceptKw('generated')) { const always = this.acceptKw('always'); if (!always) { this.expectKw('by'); this.expectKw('default'); } this.expectKw('as'); this.expectKw('identity'); col.autoInc = always ? 'always' : 'default'; col.notNull = true; continue; }
          if (PG && this.acceptKw('check')) { this.expectOp('('); col.check = this.parseExpr(); this.expectOp(')'); continue; }
          if (this.acceptKw('unsigned') || this.acceptKw('signed') || this.acceptKw('zerofill')) continue;
          if (this.isKw('not') && this.isKw('null', 1)) { this.p += 2; col.notNull = true; continue; }
          if (this.acceptKw('null')) continue;
          if (this.acceptKw('auto_increment')) { col.autoInc = true; continue; }
          if (this.acceptKw('primary')) { this.expectKw('key'); pk.push(cname); continue; }
          if (this.acceptKw('unique')) { this.acceptKw('key'); uniques.push([cname]); continue; }
          if (this.acceptKw('references')) { const rt = this.ident('a table name'); let rc = null; if (this.acceptOp('(')) { rc = [this.ident()]; this.expectOp(')'); } fks.push({ cols: [cname], refTable: rt, refCols: rc }); while (this.acceptKw('on')) { this.next(); this.next(); if (this.isKw('null') || this.isKw('action')) this.next(); } continue; }
          if (this.acceptKw('default')) { col.def = this.parsePrimary(); continue; }
          if (this.acceptKw('character') || this.acceptKw('charset')) { this.acceptKw('set'); this.next(); continue; }
          if (this.acceptKw('collate')) { this.next(); continue; }
          break;
        }
        cols.push(col);
      } while (this.acceptOp(','));
      this.expectOp(')');
      while (this.peek().type === 'word') { this.next(); this.acceptOp('='); this.next(); }
      for (const c of cols) if (c.check) checks.push(c.check);
      return { kind: 'create', name, cols, pk, fks, uniques, checks, ifNotExists: ine };
    }

    /* expressions */
    parseExpr() { return this.parseOr(); }
    parseOr() { let a = this.parseAnd(); while (this.acceptKw('or') || (!PG && this.acceptOp('||'))) a = { k: 'or', a, b: this.parseAnd() }; return a; }
    parseAnd() { let a = this.parseNot(); while (this.acceptKw('and')) a = { k: 'and', a, b: this.parseNot() }; return a; }
    parseNot() { if (this.acceptKw('not')) return { k: 'not', e: this.parseNot() }; return this.parseCmp(); }
    parseCmp() {
      const a = this.parseConcat();
      const k = this.peek();
      if (k.type === 'op' && ['=', '<>', '!=', '<', '>', '<=', '>='].includes(k.v)) {
        this.next();
        if (this.isKw('select') || (this.isOp('(') && this.isKw('select', 1))) throw err('Subqueries arrive in Lesson 9.');
        return { k: 'cmp', op: k.v === '!=' ? '<>' : k.v, a, b: this.parseConcat() };
      }
      if (this.acceptKw('is')) { const neg = this.acceptKw('not'); if (this.acceptKw('null')) return { k: 'isnull', neg, e: a }; if (this.acceptKw('true')) return { k: 'istrue', neg, e: a, v: true }; if (this.acceptKw('false')) return { k: 'istrue', neg, e: a, v: false }; this.fail('NULL'); }
      let neg = false;
      if (this.isKw('not') && (this.isKw('in', 1) || this.isKw('like', 1) || this.isKw('ilike', 1) || this.isKw('between', 1))) { this.next(); neg = true; }
      if (this.acceptKw('in')) {
        this.expectOp('('); if (this.isKw('select')) throw err('Subqueries arrive in Lesson 9.');
        const list = []; do list.push(this.parseExpr()); while (this.acceptOp(',')); this.expectOp(')'); return { k: 'in', neg, e: a, list };
      }
      if (this.acceptKw('like')) return { k: 'like', neg, e: a, p: this.parseConcat(), ci: !PG };
      if (this.isKw('ilike')) { if (!PG) throw err('ILIKE is PostgreSQL — MySQL\'s LIKE is already case-insensitive with the default collation.'); this.next(); return { k: 'like', neg, e: a, p: this.parseConcat(), ci: true }; }
      if (this.acceptKw('between')) { const lo = this.parseAdd(); this.expectKw('and'); const hi = this.parseAdd(); return { k: 'between', neg, e: a, lo, hi }; }
      return a;
    }
    parseConcat() { let a = this.parseAdd(); while (PG && this.acceptOp('||')) a = { k: 'concat', a, b: this.parseAdd() }; return a; }
    parseAdd() { let a = this.parseMul(); for (;;) { if (this.acceptOp('+')) a = { k: 'arith', op: '+', a, b: this.parseMul() }; else if (this.acceptOp('-')) a = { k: 'arith', op: '-', a, b: this.parseMul() }; else return a; } }
    parseMul() { let a = this.parseUnary(); for (;;) { const k = this.peek(); if (k.type === 'op' && ['*', '/', '%'].includes(k.v)) { this.next(); a = { k: 'arith', op: k.v, a, b: this.parseUnary() }; } else return a; } }
    parseUnary() {
      if (this.acceptOp('-')) return { k: 'neg', e: this.parseUnary() }; if (this.acceptOp('+')) return this.parseUnary();
      let e = this.parsePrimary();
      while (this.isOp('::')) { if (!PG) throw err('The :: cast is PostgreSQL — in MySQL write CAST(x AS type).'); this.next(); const t = this.next(); if (t.type !== 'word') this.fail('a type name'); let ty = t.lc; if (ty === 'double') this.acceptKw('precision'); if (this.acceptOp('(')) { while (!this.acceptOp(')')) this.next(); } e = { k: 'cast', e, ty }; }
      return e;
    }
    parsePrimary() {
      const k = this.peek();
      if (k.type === 'num') { this.next(); return { k: 'lit', v: k.v }; }
      if (k.type === 'str') { this.next(); return { k: 'lit', v: k.v }; }
      if (k.type === 'op' && k.v === '(') {
        this.next(); if (this.isKw('select')) throw err('Subqueries arrive in Lesson 9.');
        const e = this.parseExpr(); this.expectOp(')'); return e;
      }
      if (k.type === 'word') {
        if (!k.quoted) {
          if (k.lc === 'null') { this.next(); return { k: 'lit', v: null }; }
          if (k.lc === 'default') { this.next(); return { k: 'default' }; }
          if (k.lc === 'true') { this.next(); return { k: 'lit', v: PG ? true : 1 }; }
          if (k.lc === 'false') { this.next(); return { k: 'lit', v: PG ? false : 0 }; }
          if (['current_date', 'current_timestamp', 'localtimestamp'].includes(k.lc) && !this.isOp('(', 1)) { this.next(); return { k: 'fn', name: k.lc === 'current_date' ? 'curdate' : 'now', args: [] }; }
          if (k.lc === 'cast' && this.isOp('(', 1)) { this.next(); this.next(); const e = this.parseExpr(); this.expectKw('as'); const t = this.next(); if (t.type !== 'word') this.fail('a type name'); let ty = t.lc; if (ty === 'double') this.acceptKw('precision'); if (this.acceptOp('(')) { while (!this.acceptOp(')')) this.next(); } this.expectOp(')'); return { k: 'cast', e, ty }; }
          if (this.isOp('(', 1)) {
            this.next(); this.next();
            if (AGG.has(k.lc)) throw err(`${k.v.toUpperCase()}() is an aggregate function — aggregates arrive in Lesson 8.`);
            const args = []; if (!this.isOp(')')) { do args.push(this.parseExpr()); while (this.acceptOp(',')); }
            this.expectOp(')'); return { k: 'fn', name: k.lc, args };
          }
          if (RESERVED.has(k.lc)) this.fail('a value or column name');
        }
        this.next();
        const name = k.quoted ? k.v : k.lc;
        if (this.acceptOp('.')) { const c = this.ident('a column name'); return { k: 'col', t: name, c }; }
        return { k: 'col', t: null, c: name };
      }
      this.fail('a value or column name');
    }
  }

  /* ---------------- values ---------------- */
  const isNumType = (t) => ['int', 'integer', 'smallint', 'tinyint', 'mediumint', 'bigint', 'decimal', 'numeric', 'float', 'double', 'real', 'dec'].includes(t);
  const PGNAME = { int: 'integer', integer: 'integer', smallint: 'smallint', bigint: 'bigint', decimal: 'numeric', numeric: 'numeric', varchar: 'character varying', char: 'character', double: 'double precision', real: 'real', boolean: 'boolean', date: 'date', timestamp: 'timestamp', timestamptz: 'timestamp with time zone', text: 'text' };
  const isIntType = (t) => ['int', 'integer', 'smallint', 'tinyint', 'mediumint', 'bigint'].includes(t);
  const numLike = (v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)));
  function cmpVals(a, b) {
    if (a == null || b == null) return null;
    if (typeof a === 'boolean' || typeof b === 'boolean') { const x = Number(boolOf(a)), y = Number(boolOf(b)); return x < y ? -1 : x > y ? 1 : 0; }
    if (PG && typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
    if ((typeof a === 'number' || typeof b === 'number') && numLike(a) && numLike(b)) { const x = Number(a), y = Number(b); return x < y ? -1 : x > y ? 1 : 0; }
    const x = String(a).toLowerCase(), y = String(b).toLowerCase(); return x < y ? -1 : x > y ? 1 : 0;
  }
  function boolOf(v) { if (typeof v === 'boolean') return v; if (typeof v === 'number') return v !== 0; const s = String(v).trim().toLowerCase(); if (['t', 'true', 'y', 'yes', 'on', '1'].includes(s)) return true; if (['f', 'false', 'n', 'no', 'off', '0'].includes(s)) return false; throw err(`invalid input syntax for type boolean: "${v}"`); }
  const truth = (v) => v == null ? null : typeof v === 'boolean' ? v : (typeof v === 'number' ? v !== 0 : (numLike(v) ? Number(v) !== 0 : false));
  const toNum = (v) => v == null ? null : (numLike(v) ? Number(v) : 0);

  const FNS = {
    upper: (a) => a == null ? null : String(a).toUpperCase(),
    lower: (a) => a == null ? null : String(a).toLowerCase(),
    length: (a) => a == null ? null : String(a).length,
    char_length: (a) => a == null ? null : String(a).length,
    concat: (...a) => a.some((x) => x == null) ? null : a.map(String).join(''),
    concat_ws: (s, ...a) => a.filter((x) => x != null).map(String).join(s),
    trim: (a) => a == null ? null : String(a).trim(),
    abs: (a) => a == null ? null : Math.abs(toNum(a)),
    round: (a, d = 0) => a == null ? null : Number(toNum(a).toFixed(toNum(d))),
    coalesce: (...a) => { for (const x of a) if (x != null) return x; return null; },
    ifnull: (a, b) => a == null ? b : a,
    substring: (s, p, l) => s == null ? null : String(s).substr(toNum(p) - 1, l == null ? undefined : toNum(l)),
    substr: (s, p, l) => FNS.substring(s, p, l),
    now: () => new Date().toISOString().slice(0, 19).replace('T', ' '),
    curdate: () => new Date().toISOString().slice(0, 10),
    current_date: () => new Date().toISOString().slice(0, 10),
    left: (s, n) => s == null ? null : String(s).slice(0, toNum(n)),
    right: (s, n) => s == null ? null : String(s).slice(-toNum(n)),
    replace: (s, a, b) => s == null ? null : String(s).split(String(a)).join(String(b)),
    nullif: (a, b) => (cmpVals(a, b) === 0 ? null : a),
    greatest: (...a) => a.reduce((m, x) => (m == null || cmpVals(x, m) > 0 ? x : m), null),
    least: (...a) => a.reduce((m, x) => (m == null || cmpVals(x, m) < 0 ? x : m), null),
  };

  /* ---------------- database ---------------- */
  const clone = (o) => JSON.parse(JSON.stringify(o));

  class Database {
    constructor(dialect = 'mysql') { this.dialect = dialect; this.tables = {}; this.types = {}; this.txSnapshot = null; }
    clone() { const d = new Database(this.dialect); d.tables = clone(this.tables); d.types = clone(this.types); return d; }
    table(name) { const t = this.tables[name]; if (!t) throw err(PG ? `relation "${name}" does not exist` : `Table '${name}' doesn't exist`); return t; }

    exec(sql) {
      PG = this.dialect === 'postgres';
      const stmts = new Parser(sql).parseScript();
      if (!stmts.length) throw err('Nothing to run — type a statement first');
      const results = [];
      for (const st of stmts) { const r = this.run(st); r.text = st.text; results.push(r); }
      return results;
    }
    run(st) {
      switch (st.kind) {
        case 'select': return this.select(st);
        case 'insert': return this.atomic(() => this.insert(st));
        case 'update': return this.atomic(() => this.update(st));
        case 'delete': return this.atomic(() => this.del(st));
        case 'create': return this.create(st);
        case 'createtype': {
          if (this.types[st.name]) throw err(`type "${st.name}" already exists`);
          this.types[st.name] = st.vals; return ok(0, 'CREATE TYPE');
        }
        case 'drop': {
          if (!this.tables[st.table]) { if (st.ifExists) return ok(0, PG ? 'DROP TABLE' : 'Query OK, 0 rows affected'); throw err(PG ? `table "${st.table}" does not exist` : `Unknown table '${st.table}'`); }
          for (const t of Object.values(this.tables)) if (t.name !== st.table && t.fks.some((f) => f.refTable === st.table)) throw err(PG ? `cannot drop table ${st.table} because other objects depend on it — constraint ${fkName(t, t.fks.find((f) => f.refTable === st.table))} on table ${t.name} depends on table ${st.table}` : `Cannot drop table '${st.table}' referenced by a foreign key constraint on table '${t.name}'`);
          delete this.tables[st.table]; return ok(0, PG ? 'DROP TABLE' : 'Query OK, 0 rows affected');
        }
        case 'begin': this.txSnapshot = clone(this.tables); return ok(0, PG ? 'BEGIN — changes can be rolled back' : 'Transaction started — changes can be rolled back', 'tx');
        case 'commit': this.txSnapshot = null; return ok(0, PG ? 'COMMIT — changes are now permanent' : 'Committed — changes are now permanent', 'tx');
        case 'rollback': if (this.txSnapshot) { this.tables = this.txSnapshot; this.txSnapshot = null; return ok(0, PG ? 'ROLLBACK — every change since BEGIN was undone' : 'Rolled back — every change since START TRANSACTION was undone', 'tx'); } return ok(0, PG ? 'WARNING: there is no transaction in progress — each statement was already committed on its own (autocommit)' : 'Nothing to roll back (autocommit was on)', 'tx');
        case 'showtables': if (PG) return { type: 'rows', columns: ['Schema', 'Name', 'Type'], colTypes: [null, null, null], rows: Object.keys(this.tables).sort().map((n) => ['public', n, 'table']) };
          return { type: 'rows', columns: ['Tables'], rows: Object.keys(this.tables).map((n) => [n]), colTypes: [null] };
        case 'describe': {
          const t = this.table(st.table);
          if (PG) return { type: 'rows', columns: ['Column', 'Type', 'Nullable', 'Default'], colTypes: [null, null, null, null],
            rows: t.cols.map((c) => [c.name, (c.pgType || PGNAME[c.type] || c.type) + (c.len != null ? `(${c.len}${c.scale != null ? ',' + c.scale : ''})` : ''), c.notNull || t.pk.includes(c.name) ? 'not null' : '', c.autoInc === 'serial' ? `nextval('${t.name}_${c.name}_seq')` : c.autoInc ? `generated ${c.autoInc === 'always' ? 'always' : 'by default'} as identity` : c.def !== undefined ? fmtLit(evalExpr(c.def, null)) : '']) };
          return { type: 'rows', columns: ['Field', 'Type', 'Null', 'Key'], colTypes: [null, null, null, null],
            rows: t.cols.map((c) => [c.name, c.type + (c.len != null ? `(${c.len}${c.scale != null ? ',' + c.scale : ''})` : ''), c.notNull || t.pk.includes(c.name) ? 'NO' : 'YES', t.pk.includes(c.name) ? 'PRI' : t.fks.some((f) => f.cols.includes(c.name)) ? 'MUL' : '']) };
        }
      }
      throw err('Unsupported statement');
    }
    atomic(fn) { const snap = clone(this.tables); try { return fn(); } catch (e) { this.tables = snap; throw e; } }

    create(st) {
      if (this.tables[st.name]) { if (st.ifNotExists) return ok(0, PG ? 'CREATE TABLE (already existed — skipped)' : 'Query OK, 0 rows affected'); throw err(PG ? `relation "${st.name}" already exists` : `Table '${st.name}' already exists`); }
      const names = st.cols.map((c) => c.name);
      for (const c of st.cols) if (c.pgType) { if (!this.types[c.pgType]) throw err(`type "${c.pgType}" does not exist`); c.enumVals = this.types[c.pgType]; c.type = 'enum'; }
      for (const p of st.pk) if (!names.includes(p)) throw err(PG ? `column "${p}" named in key does not exist` : `Key column '${p}' doesn't exist in table`);
      for (const f of st.fks) {
        for (const c of f.cols) if (!names.includes(c)) throw err(PG ? `column "${c}" referenced in foreign key constraint does not exist` : `Key column '${c}' doesn't exist in table`);
        const rt = f.refTable === st.name ? { cols: st.cols, pk: st.pk } : this.tables[f.refTable];
        if (!rt) throw err(PG ? `relation "${f.refTable}" does not exist` : `Failed to add the foreign key constraint. Referenced table '${f.refTable}' doesn't exist`);
        if (!f.refCols) f.refCols = rt.pk.slice();
      }
      this.tables[st.name] = { name: st.name, cols: st.cols, pk: st.pk, fks: st.fks, uniques: st.uniques, checks: st.checks || [], rows: [], autoNext: 1 };
      return ok(0, PG ? 'CREATE TABLE' : 'Query OK, 0 rows affected');
    }

    coerce(t, col, v, rowNo) {
      if (v == null) return null;
      const ty = col.type;
      if (isNumType(ty)) {
        if (typeof v === 'boolean') { if (PG) throw err(`column "${col.name}" is of type ${PGNAME[ty] || ty} but expression is of type boolean`); v = Number(v); }
        if (!numLike(v)) throw err(PG ? `invalid input syntax for type ${PGNAME[ty] || ty}: "${v}"` : `Incorrect ${isIntType(ty) ? 'integer' : 'decimal'} value: '${v}' for column '${col.name}' at row ${rowNo}`);
        let n = Number(v);
        if (PG && isIntType(ty) && !Number.isInteger(n) && typeof v === 'string') throw err(`invalid input syntax for type ${PGNAME[ty] || ty}: "${v}"`);
        if (PG && col.len != null && col.scale != null && Math.abs(n) >= 10 ** (col.len - col.scale)) throw err(`numeric field overflow — a field with precision ${col.len}, scale ${col.scale} must round to an absolute value less than 10^${col.len - col.scale}`);
        if (isIntType(ty)) n = Math.round(n);
        else if (col.scale != null) n = Number(n.toFixed(col.scale));
        return n;
      }
      if (ty === 'boolean') { if (PG && typeof v === 'number') throw err(`column "${col.name}" is of type boolean but expression is of type integer — use true/false`); return boolOf(v); }
      if (ty === 'timestamp' || ty === 'timestamptz' || ty === 'datetime') {
        const s = String(v).replace('T', ' '); const m = /^(\d{4}-\d{2}-\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
        if (!m || isNaN(Date.parse(m[1] + 'T00:00:00Z')) || new Date(m[1] + 'T00:00:00Z').toISOString().slice(0, 10) !== m[1] || +(m[2] || 0) > 23 || +(m[3] || 0) > 59 || +(m[4] || 0) > 59) throw err(PG ? `invalid input syntax for type timestamp: "${v}"` : `Incorrect datetime value: '${v}' for column '${col.name}' at row ${rowNo}`);
        return `${m[1]} ${m[2] || '00'}:${m[3] || '00'}:${m[4] || '00'}`;
      }
      if (ty === 'date') {
        const s = String(v); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s + 'T00:00:00Z')) || new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) !== s) throw err(PG ? (/^\d{4}-\d{2}-\d{2}$/.test(s) ? `date/time field value out of range: "${s}"` : `invalid input syntax for type date: "${s}"`) : `Incorrect date value: '${s}' for column '${col.name}' at row ${rowNo} (expected 'YYYY-MM-DD')`);
        return s;
      }
      if (ty === 'enum' && col.enumVals) { const m = col.enumVals.find((x) => x.toLowerCase() === String(v).toLowerCase()); if (!m || (PG && m !== String(v))) throw err(PG ? `invalid input value for enum ${col.pgType || 'type'}: "${v}"` : `Data truncated for column '${col.name}' at row ${rowNo}`); return m; }
      const s = String(v);
      if (['varchar', 'char'].includes(ty) && col.len != null && s.length > col.len) throw err(PG ? `value too long for type ${PGNAME[ty]}(${col.len})` : `Data too long for column '${col.name}' at row ${rowNo}`);
      return s;
    }
    checkRow(t, row, rowNo, ignoreIdx = -1) {
      for (const c of t.cols) if ((c.notNull || t.pk.includes(c.name)) && row[c.name] == null) throw err(PG ? `null value in column "${c.name}" of relation "${t.name}" violates not-null constraint` : `Column '${c.name}' cannot be null`);
      for (const ck of t.checks || []) { const v = truth(evalExpr(ck, { [t.name]: row }, [{ alias: t.name, table: t }])); if (v === false) throw err(`new row for relation "${t.name}" violates check constraint "${t.name}_check"`); }
      const keyOf = (r, cols) => JSON.stringify(cols.map((c) => r[c] == null ? null : PG ? String(r[c]) : String(r[c]).toLowerCase()));
      const keys = [];
      if (t.pk.length) keys.push({ cols: t.pk, label: PG ? `${t.name}_pkey` : `${t.name}.PRIMARY` });
      for (const u of t.uniques || []) keys.push({ cols: u, label: PG ? `${t.name}_${u.join('_')}_key` : `${t.name}.${u.join('_')}` });
      for (const k of keys) {
        if (k.cols.some((c) => row[c] == null)) continue;
        const me = keyOf(row, k.cols);
        t.rows.forEach((r, i) => { if (i !== ignoreIdx && keyOf(r, k.cols) === me) throw err(PG ? `duplicate key value violates unique constraint "${k.label}" — Key (${k.cols.join(', ')})=(${k.cols.map((c) => row[c]).join(', ')}) already exists.` : `Duplicate entry '${k.cols.map((c) => row[c]).join('-')}' for key '${k.label}'`); });
      }
      for (const f of t.fks) {
        if (f.cols.some((c) => row[c] == null)) continue;
        const rt = this.tables[f.refTable];
        const hit = rt.rows.some((r) => f.cols.every((c, i) => cmpVals(r[f.refCols[i]], row[c]) === 0));
        if (!hit && PG) throw err(`insert or update on table "${t.name}" violates foreign key constraint "${fkName(t, f)}" — Key (${f.cols.join(', ')})=(${f.cols.map((c) => row[c]).join(', ')}) is not present in table "${f.refTable}".`);
        if (!hit) throw err(`Cannot add or update a child row: a foreign key constraint fails (\`${t.name}\`, FOREIGN KEY (\`${f.cols.join('`, `')}\`) REFERENCES \`${f.refTable}\` (\`${f.refCols.join('`, `')}\`)) — no ${f.refTable} row has ${f.refCols.map((c, i) => `${c} = ${fmtLit(row[f.cols[i]])}`).join(' and ')}`);
      }
    }
    checkParents(t, oldRow, newRow) {
      for (const child of Object.values(this.tables)) for (const f of child.fks) {
        if (f.refTable !== t.name) continue;
        if (newRow && f.refCols.every((c) => cmpVals(oldRow[c], newRow[c]) === 0)) continue;
        const used = child.rows.some((r) => f.refCols.every((c, i) => cmpVals(r[f.cols[i]], oldRow[c]) === 0));
        if (used && PG) throw err(`update or delete on table "${t.name}" violates foreign key constraint "${fkName(child, f)}" on table "${child.name}" — Key (${f.refCols.join(', ')})=(${f.refCols.map((c) => oldRow[c]).join(', ')}) is still referenced from table "${child.name}".`);
        if (used) throw err(`Cannot ${newRow ? 'update' : 'delete'} a parent row: a foreign key constraint fails (\`${child.name}\` rows still reference ${t.name} ${f.refCols.map((c) => `${c} = ${fmtLit(oldRow[c])}`).join(', ')})`);
      }
    }

    insert(st) {
      const t = this.table(st.table);
      const cols = st.cols || t.cols.map((c) => c.name);
      for (const c of cols) if (!t.cols.find((x) => x.name === c)) throw err(PG ? `column "${c}" of relation "${t.name}" does not exist` : `Unknown column '${c}' in 'field list'`);
      let n = 0; const done = [];
      st.rows.forEach((vals, ri) => {
        if (vals.length !== cols.length) throw err(PG ? `INSERT has more ${vals.length > cols.length ? 'expressions than target columns' : 'target columns than expressions'} (${cols.length} columns, ${vals.length} values)` : `Column count doesn't match value count at row ${ri + 1} (${cols.length} columns, ${vals.length} values)`);
        const row = {};
        for (const c of t.cols) row[c.name] = c.def !== undefined ? evalExpr(c.def, null) : null;
        const given = new Set();
        cols.forEach((c, i) => { if (vals[i].k === 'default') return; row[c] = evalExpr(vals[i], null); given.add(c); });
        for (const c of t.cols) {
          if (c.autoInc === 'always' && given.has(c.name)) throw err(`cannot insert a non-DEFAULT value into column "${c.name}" — it is GENERATED ALWAYS AS IDENTITY; leave it out of the column list`);
          if (c.autoInc && PG) { if (!given.has(c.name)) row[c.name] = t.autoNext++; }
          else if (c.autoInc) { if (row[c.name] == null) row[c.name] = t.autoNext; t.autoNext = Math.max(t.autoNext, Number(row[c.name]) + 1); }
          row[c.name] = this.coerce(t, c, row[c.name], ri + 1);
        }
        this.checkRow(t, row, ri + 1);
        t.rows.push(row); n++; done.push(row);
      });
      if (st.returning) return returningRows(t, st.returning, done, n, `INSERT 0 ${n}`);
      return ok(n, PG ? `INSERT 0 ${n}  (${n} row${n === 1 ? '' : 's'} inserted)` : `Query OK, ${n} row${n === 1 ? '' : 's'} affected`);
    }
    update(st) {
      const t = this.table(st.table);
      const src = [{ alias: t.name, table: t }];
      for (const s of st.sets) { if (!t.cols.find((c) => c.name === s.col)) throw err(PG ? `column "${s.col}" of relation "${t.name}" does not exist` : `Unknown column '${s.col}' in 'field list'`); checkCols(s.expr, src, 'field list'); }
      if (st.where) checkCols(st.where, src, 'where clause');
      let matched = 0, changed = 0; const done = [];
      for (let i = 0; i < t.rows.length; i++) {
        if (st.limit != null && matched >= st.limit) break;
        const r = t.rows[i]; const env = { [t.name]: r };
        if (st.where && truth(evalExpr(st.where, env, src)) !== true) continue;
        matched++;
        const nr = { ...r };
        for (const s of st.sets) nr[s.col] = this.coerce(t, t.cols.find((c) => c.name === s.col), evalExpr(s.expr, env, src), i + 1);
        if (t.cols.every((c) => cmpVals(nr[c.name], r[c.name]) === 0 && (nr[c.name] == null) === (r[c.name] == null) && String(nr[c.name]) === String(r[c.name]))) { done.push(r); continue; }
        this.checkRow(t, nr, i + 1, i);
        this.checkParents(t, r, nr);
        t.rows[i] = nr; changed++; done.push(nr);
      }
      // PostgreSQL reports rows MATCHED by WHERE (even if a value didn't change); MySQL reports rows actually CHANGED.
      if (PG && st.returning) return returningRows(t, st.returning, done, matched, `UPDATE ${matched}`, !st.where && matched > 0 ? 'nowhere' : null);
      if (PG) return ok(matched, `UPDATE ${matched}  (${matched} row${matched === 1 ? '' : 's'} matched and updated)`, !st.where && matched > 0 ? 'nowhere' : null, matched);
      return ok(changed, `Query OK, ${changed} row${changed === 1 ? '' : 's'} affected (rows matched: ${matched}, changed: ${changed})`, null, matched);
    }
    del(st) {
      const t = this.table(st.table); const src = [{ alias: t.name, table: t }];
      if (st.where) checkCols(st.where, src, 'where clause');
      const keep = []; let n = 0; const done = [];
      for (const r of t.rows) {
        const env = { [t.name]: r };
        if ((st.limit == null || n < st.limit) && (!st.where || truth(evalExpr(st.where, env, src)) === true)) { this.checkParents(t, r, null); n++; done.push(r); } else keep.push(r);
      }
      t.rows = keep;
      if (st.returning) return returningRows(t, st.returning, done, n, `DELETE ${n}`, !st.where && n > 0 ? 'nowhere' : null);
      if (PG) return ok(n, `DELETE ${n}  (${n} row${n === 1 ? '' : 's'} deleted)`, !st.where && n > 0 ? 'nowhere' : null);
      return ok(n, `Query OK, ${n} row${n === 1 ? '' : 's'} affected`, !st.where && n > 0 ? 'nowhere' : null);
    }
    select(st) {
      const refs = st.from ? [st.from, ...st.joins.map((j) => j.ref)] : [];
      const src = refs.map((r) => ({ alias: r.alias, table: this.table(r.name) }));
      const seen = new Set(); for (const s of src) { if (seen.has(s.alias)) throw err(PG ? `table name "${s.alias}" specified more than once` : `Not unique table/alias: '${s.alias}'`); seen.add(s.alias); }
      // static checks
      st.items.forEach((it) => { if (it.star && it.table && !src.find((s) => s.alias === it.table)) throw err(PG ? `missing FROM-clause entry for table "${it.table}"` : `Unknown table '${it.table}'`); if (it.star && !src.length) throw err(PG ? 'SELECT * with no tables specified is not valid' : 'No tables used'); if (!it.star) checkCols(it.expr, src, 'field list'); });
      st.joins.forEach((j, i) => { if (j.on) checkCols(j.on, src.slice(0, i + 2), 'on clause'); });
      if (st.where) checkCols(st.where, src, 'where clause');
      // build rows
      let envs = [{}];
      if (src.length) {
        envs = src[0].table.rows.map((r) => ({ [src[0].alias]: r }));
        st.joins.forEach((j, i) => {
          const s = src[i + 1]; const out = [];
          for (const e of envs) {
            let hit = false;
            for (const r of s.table.rows) { const ne = { ...e, [s.alias]: r }; if (!j.on || truth(evalExpr(j.on, ne, src)) === true) { out.push(ne); hit = true; } }
            if (!hit && j.type === 'left') out.push({ ...e, [s.alias]: null });
          }
          envs = out;
        });
      }
      if (st.where) envs = envs.filter((e) => truth(evalExpr(st.where, e, src)) === true);
      // projection
      const columns = [], colTypes = [], getters = [];
      for (const it of st.items) {
        if (it.star) {
          for (const s of src) if (!it.table || it.table === s.alias) for (const c of s.table.cols) { columns.push(c.name); colTypes.push(c); getters.push((e) => e[s.alias] ? e[s.alias][c.name] : null); }
        } else {
          columns.push(it.alias || (it.expr.k === 'col' ? it.expr.c : it.text.trim()));
          colTypes.push(it.expr.k === 'col' ? colInfo(it.expr, src) : null);
          getters.push((e) => evalExpr(it.expr, e, src));
        }
      }
      let rows = envs.map((e) => ({ e, v: getters.map((g) => g(e)) }));
      if (st.order.length) {
        const keyFns = st.order.map((o) => {
          if (o.expr.k === 'lit' && typeof o.expr.v === 'number') { const idx = o.expr.v - 1; if (idx < 0 || idx >= columns.length) throw err(`Unknown column '${o.expr.v}' in 'order clause'`); return (r) => r.v[idx]; }
          if (o.expr.k === 'col' && !o.expr.t) { const ai = st.items.findIndex((it) => !it.star && it.alias && it.alias.toLowerCase() === o.expr.c); if (ai >= 0) { const idx = columns.indexOf(st.items[ai].alias); return (r) => r.v[idx]; } }
          checkCols(o.expr, src, 'order clause'); return (r) => evalExpr(o.expr, r.e, src);
        });
        rows = rows.map((r, i) => ({ ...r, i })).sort((a, b) => {
          for (let k = 0; k < keyFns.length; k++) {
            const x = keyFns[k](a), y = keyFns[k](b); let c;
            if (x == null && y == null) c = 0; else if (x == null) c = -1; else if (y == null) c = 1; else c = cmpVals(x, y);
            if (c) return st.order[k].desc ? -c : c;
          }
          return a.i - b.i;
        });
      }
      let out = rows.map((r) => r.v);
      if (st.distinct) { const s = new Set(); out = out.filter((r) => { const k = JSON.stringify(r.map(canon)); if (s.has(k)) return false; s.add(k); return true; }); }
      if (st.limit != null) out = out.slice(st.offset, st.offset + st.limit);
      return { type: 'rows', columns, colTypes, rows: out };
    }
  }
  const ok = (affected, msg, flag, matched) => ({ type: 'ok', affected, msg, flag: flag || null, matched });
  const fmtLit = (v) => typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${v}'`;
  const fkName = (t, f) => `${t.name}_${f.cols.join('_')}_fkey`;
  function returningRows(t, items, rows, affected, msg, flag) {
    const src = [{ alias: t.name, table: t }]; const columns = [], colTypes = [], getters = [];
    for (const it of items) {
      if (it.star) { for (const c of t.cols) { columns.push(c.name); colTypes.push(c); getters.push((r) => r[c.name]); } continue; }
      checkCols(it.expr, src, 'RETURNING');
      columns.push(it.alias || (it.expr.k === 'col' ? it.expr.c : it.text.trim())); colTypes.push(it.expr.k === 'col' ? colInfo(it.expr, src) : null);
      getters.push((r) => evalExpr(it.expr, { [t.name]: r }, src));
    }
    return { type: 'rows', columns, colTypes, rows: rows.map((r) => getters.map((g) => g(r))), affected, msg, flag: flag || null };
  }

  function colInfo(e, src) {
    const hits = src.filter((s) => (!e.t || s.alias === e.t) && s.table.cols.some((c) => c.name === e.c));
    return hits.length === 1 ? hits[0].table.cols.find((c) => c.name === e.c) : null;
  }
  function checkCols(e, src, clause) {
    if (!e) return;
    switch (e.k) {
      case 'col': {
        if (PG) {
          const nm = e.t ? `${e.t}.${e.c}` : e.c;
          if (e.t) {
            const s = src.find((x) => x.alias === e.t);
            if (!s) { const byName = src.find((x) => x.table.name === e.t); throw err(byName ? `invalid reference to FROM-clause entry for table "${e.t}" — you aliased it as ${byName.alias}, so write ${byName.alias}.${e.c}` : `missing FROM-clause entry for table "${e.t}"`); }
            if (!s.table.cols.some((c) => c.name === e.c)) throw err(`column ${nm} does not exist`);
          } else {
            const hits = src.filter((s) => s.table.cols.some((c) => c.name === e.c));
            if (!hits.length) throw err(`column "${e.c}" does not exist`);
            if (hits.length > 1) throw err(`column reference "${e.c}" is ambiguous — it exists in ${hits.map((h) => h.alias).join(' and ')}; prefix it, e.g. ${hits[0].alias}.${e.c}`);
          }
          return;
        }
        if (e.t) {
          const s = src.find((x) => x.alias === e.t);
          if (!s) { const byName = src.find((x) => x.table.name === e.t); throw err(byName ? `Unknown column '${e.t}.${e.c}' in '${clause}' — you aliased ${e.t} as '${byName.alias}', so write ${byName.alias}.${e.c}` : `Unknown column '${e.t}.${e.c}' in '${clause}'`); }
          if (!s.table.cols.some((c) => c.name === e.c)) throw err(`Unknown column '${e.t}.${e.c}' in '${clause}'`);
        } else {
          const hits = src.filter((s) => s.table.cols.some((c) => c.name === e.c));
          if (!hits.length) throw err(`Unknown column '${e.c}' in '${clause}'`);
          if (hits.length > 1) throw err(`Column '${e.c}' in ${clause} is ambiguous — it exists in ${hits.map((h) => h.alias).join(' and ')}; prefix it, e.g. ${hits[0].alias}.${e.c}`);
        }
        return;
      }
      case 'fn': if (!FNS[e.name]) throw err(PG ? `function ${e.name}() does not exist (in this sandbox)` : `FUNCTION ${e.name.toUpperCase()} does not exist (in this sandbox)`); e.args.forEach((a) => checkCols(a, src, clause)); return;
      case 'in': checkCols(e.e, src, clause); e.list.forEach((a) => checkCols(a, src, clause)); return;
      default: for (const key of ['a', 'b', 'e', 'p', 'lo', 'hi']) if (e[key]) checkCols(e[key], src, clause);
    }
  }
  function evalExpr(e, env, src) {
    switch (e.k) {
      case 'lit': return e.v;
      case 'default': throw err('DEFAULT is only allowed as a value inside INSERT … VALUES');
      case 'concat': { const a = evalExpr(e.a, env, src), b = evalExpr(e.b, env, src); return a == null || b == null ? null : String(fmtPlain(a)) + String(fmtPlain(b)); }
      case 'cast': return castTo(evalExpr(e.e, env, src), e.ty);
      case 'col': {
        if (e.t) { const r = env[e.t]; return r ? r[e.c] : null; }
        const s = src.find((x) => x.table.cols.some((c) => c.name === e.c)); const r = env[s.alias]; return r ? r[e.c] : null;
      }
      case 'and': { const a = truth(evalExpr(e.a, env, src)), b = truth(evalExpr(e.b, env, src)); if (a === false || b === false) return 0; if (a == null || b == null) return null; return 1; }
      case 'or': { const a = truth(evalExpr(e.a, env, src)), b = truth(evalExpr(e.b, env, src)); if (a === true || b === true) return 1; if (a == null || b == null) return null; return 0; }
      case 'not': { const a = truth(evalExpr(e.e, env, src)); return a == null ? null : a ? 0 : 1; }
      case 'cmp': {
        const c = cmpVals(evalExpr(e.a, env, src), evalExpr(e.b, env, src)); if (c == null) return null;
        return ({ '=': c === 0, '<>': c !== 0, '<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0 })[e.op] ? 1 : 0;
      }
      case 'isnull': { const v = evalExpr(e.e, env, src) == null; return (e.neg ? !v : v) ? 1 : 0; }
      case 'istrue': { const v = truth(evalExpr(e.e, env, src)) === e.v; return (e.neg ? !v : v) ? 1 : 0; }
      case 'in': {
        const v = evalExpr(e.e, env, src); if (v == null) return null; let sawNull = false;
        for (const x of e.list) { const c = cmpVals(v, evalExpr(x, env, src)); if (c === 0) return e.neg ? 0 : 1; if (c == null) sawNull = true; }
        return sawNull ? null : e.neg ? 1 : 0;
      }
      case 'like': {
        const v = evalExpr(e.e, env, src), p = evalExpr(e.p, env, src); if (v == null || p == null) return null;
        const re = new RegExp('^' + String(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', e.ci ? 'is' : 's');
        return re.test(String(v)) !== e.neg ? 1 : 0;
      }
      case 'between': {
        const v = evalExpr(e.e, env, src), lo = evalExpr(e.lo, env, src), hi = evalExpr(e.hi, env, src);
        const a = cmpVals(v, lo), b = cmpVals(v, hi); if (a == null || b == null) return null; const r = a >= 0 && b <= 0; return r !== e.neg ? 1 : 0;
      }
      case 'arith': {
        const a = evalExpr(e.a, env, src), b = evalExpr(e.b, env, src); if (a == null || b == null) return null;
        const x = toNum(a), y = toNum(b);
        switch (e.op) { case '+': return round9(x + y); case '-': return round9(x - y); case '*': return round9(x * y); case '/': return y === 0 ? null : round9(x / y); case '%': return y === 0 ? null : x % y; }
      }
      case 'neg': { const v = evalExpr(e.e, env, src); return v == null ? null : -toNum(v); }
      case 'fn': return FNS[e.name](...e.args.map((a) => evalExpr(a, env, src)));
    }
    throw err('Cannot evaluate expression');
  }
  const round9 = (n) => Math.round(n * 1e9) / 1e9;
  const fmtPlain = (v) => typeof v === 'number' ? String(round9(v)) : String(v);
  function castTo(v, ty) {
    if (v == null) return null;
    if (['int', 'integer', 'int4', 'int8', 'bigint', 'smallint', 'int2', 'signed', 'unsigned'].includes(ty)) { if (typeof v === 'boolean') return Number(v); if (!numLike(v)) throw err(PG ? `invalid input syntax for type integer: "${v}"` : `Truncated incorrect INTEGER value: '${v}'`); return Math.round(Number(v)); }
    if (['numeric', 'decimal', 'real', 'double', 'float', 'float8', 'float4'].includes(ty)) { if (!numLike(v)) throw err(PG ? `invalid input syntax for type numeric: "${v}"` : `Truncated incorrect DECIMAL value: '${v}'`); return Number(v); }
    if (['text', 'varchar', 'char', 'character'].includes(ty)) return fmtPlain(v);
    if (ty === 'boolean' || ty === 'bool') return boolOf(v);
    if (ty === 'date') { const s = String(v).slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw err(`invalid input syntax for type date: "${v}"`); return s; }
    if (ty === 'timestamp' || ty === 'timestamptz' || ty === 'datetime') return castTimestamp(v);
    throw err(`type "${ty}" is not supported in this sandbox's casts`);
  }
  function castTimestamp(v) { const s = String(v).replace('T', ' '); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s + ' 00:00:00' : s.slice(0, 19); }
  function canon(v) { if (v == null) return '∅'; if (typeof v === 'boolean') return v ? 'true' : 'false'; if (numLike(v)) return Number(v).toFixed(4); return PG ? String(v) : String(v).toLowerCase(); }

  function formatValue(v, col) {
    if (v == null) return 'NULL';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') { if (col && col.scale != null) return v.toFixed(col.scale); return String(round9(v)); }
    return String(v);
  }

  /* compare two row results; returns {equal, ...} */
  function compareResults(got, exp, { ordered = false } = {}) {
    if (!got || got.type !== 'rows') return { equal: false, reason: 'not-rows' };
    const key = (r) => JSON.stringify(r.map(canon));
    const gk = got.rows.map(key), ek = exp.rows.map(key);
    const sameCols = got.columns.length === exp.columns.length;
    if (sameCols) {
      if (ordered ? gk.join('|') === ek.join('|') : [...gk].sort().join('|') === [...ek].sort().join('|')) return { equal: true };
      if (!ordered || [...gk].sort().join('|') !== [...ek].sort().join('|')) {
        const missing = ek.filter((k) => { const i = gk.indexOf(k); return i < 0; }).length;
        const extra = gk.filter((k) => !ek.includes(k)).length;
        return { equal: false, reason: 'rows', missing, extra };
      }
      return { equal: false, reason: 'order' };
    }
    // do the user's rows contain the expected values (extra/missing columns)?
    if (got.rows.length === exp.rows.length) {
      const pool = got.rows.map((r) => r.map(canon));
      const allIn = exp.rows.every((er) => { const i = pool.findIndex((gr) => er.map(canon).every((v) => gr.includes(v))); if (i < 0) return false; pool.splice(i, 1); return true; });
      if (allIn) return { equal: false, reason: 'columns', rowsRight: true };
    }
    return { equal: false, reason: 'columns', rowsRight: false };
  }

  return {
    SQLError,
    create(seed, opts = {}) { const d = new Database(opts.dialect === 'postgres' || opts.dialect === 'pg' ? 'postgres' : 'mysql'); if (seed) d.exec(seed); return d; },
    formatValue, compareResults, tokenize,
  };
})();
if (typeof module !== 'undefined') module.exports = MiniSQL;
