/**
 * Wherewise expressions: a small, safe expression language for calculated
 * fields, label text and label-class filters. Its surface follows Esri's
 * Arcade where it can ($feature.Field, var, return, IIf, When, Round...), but
 * it is a separate implementation: no eval, no loops, a step budget, and
 * nothing outside the feature is reachable.
 *
 *   var pct = $feature.injuries_total / Max($feature.crashes, 1) * 100;
 *   return Round(pct, 1) + "%";
 */

import type { Cell } from '../types';

export type Value = number | string | boolean | null;

type Tok =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'id'; v: string }
  | { t: 'field'; v: string }
  | { t: 'op'; v: string }
  | { t: 'eof' };

export class ExpressionError extends Error {
  constructor(message: string, readonly pos: number) {
    super(message);
  }
}

const OPS = ['==', '!=', '<=', '>=', '&&', '||', '+', '-', '*', '/', '%', '<', '>', '!', '(', ')', ',', '?', ':', ';', '='];

function tokenize(src: string): (Tok & { pos: number })[] {
  const out: (Tok & { pos: number })[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    const pos = i;
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      while (j < src.length && /[0-9._eE]/.test(src[j])) j++;
      const n = Number(src.slice(i, j).replace(/_/g, ''));
      if (!Number.isFinite(n)) throw new ExpressionError(`"${src.slice(i, j)}" is not a number`, pos);
      out.push({ t: 'num', v: n, pos });
      i = j;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) { s += src[j + 1] === 'n' ? '\n' : src[j + 1]; j += 2; continue; }
        s += src[j++];
      }
      if (j >= src.length) throw new ExpressionError('A text value is missing its closing quote', pos);
      out.push({ t: 'str', v: s, pos });
      i = j + 1;
      continue;
    }
    if (c === '$') {
      const m = src.slice(i).match(/^\$feature(?:\.([A-Za-z_][\w]*)|\[\s*(["'])(.*?)\2\s*\])/);
      if (!m) throw new ExpressionError('Use $feature.FieldName or $feature["Field name"]', pos);
      out.push({ t: 'field', v: m[1] ?? m[3], pos });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[\w]/.test(src[j])) j++;
      out.push({ t: 'id', v: src.slice(i, j), pos });
      i = j;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ExpressionError(`Unexpected character "${c}"`, pos);
    out.push({ t: 'op', v: op, pos });
    i += op.length;
  }
  out.push({ t: 'eof', pos: src.length });
  return out;
}

type Node =
  | { k: 'lit'; v: Value }
  | { k: 'field'; name: string }
  | { k: 'var'; name: string; pos: number }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'tern'; c: Node; a: Node; b: Node }
  | { k: 'call'; name: string; args: Node[]; pos: number };

type Stmt = { k: 'let'; name: string; e: Node } | { k: 'ret'; e: Node } | { k: 'expr'; e: Node };

const PREC: Record<string, number> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };

class Parser {
  i = 0;
  constructor(readonly toks: (Tok & { pos: number })[]) {}
  peek() { return this.toks[this.i]; }
  next() { return this.toks[this.i++]; }
  isOp(v: string) { const t = this.peek(); return t.t === 'op' && t.v === v; }
  expectOp(v: string) {
    const t = this.next();
    if (t.t !== 'op' || t.v !== v) throw new ExpressionError(`Expected "${v}"`, t.pos);
  }
  program(): Stmt[] {
    const out: Stmt[] = [];
    while (this.peek().t !== 'eof') {
      const t = this.peek();
      if (t.t === 'id' && t.v === 'var') {
        this.next();
        const name = this.next();
        if (name.t !== 'id') throw new ExpressionError('Expected a variable name after var', name.pos);
        this.expectOp('=');
        out.push({ k: 'let', name: name.v, e: this.expr(0) });
      } else if (t.t === 'id' && t.v === 'return') {
        this.next();
        out.push({ k: 'ret', e: this.expr(0) });
      } else out.push({ k: 'expr', e: this.expr(0) });
      while (this.isOp(';')) this.next();
    }
    if (!out.length) throw new ExpressionError('The expression is empty', 0);
    return out;
  }
  expr(min: number): Node {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (t.t === 'op' && t.v === '?' && min === 0) {
        this.next();
        const a = this.expr(0);
        this.expectOp(':');
        const b = this.expr(0);
        left = { k: 'tern', c: left, a, b };
        continue;
      }
      if (t.t !== 'op' || !(t.v in PREC) || PREC[t.v] < min) break;
      this.next();
      const right = this.expr(PREC[t.v] + 1);
      left = { k: 'bin', op: t.v, a: left, b: right };
    }
    return left;
  }
  unary(): Node {
    if (this.isOp('-') || this.isOp('!')) {
      const op = this.next() as { v: string };
      return { k: 'un', op: op.v, a: this.unary() };
    }
    return this.primary();
  }
  primary(): Node {
    const t = this.next();
    switch (t.t) {
      case 'num': return { k: 'lit', v: t.v };
      case 'str': return { k: 'lit', v: t.v };
      case 'field': return { k: 'field', name: t.v };
      case 'id': {
        if (t.v === 'true') return { k: 'lit', v: true };
        if (t.v === 'false') return { k: 'lit', v: false };
        if (t.v === 'null') return { k: 'lit', v: null };
        if (this.isOp('(')) {
          this.next();
          const args: Node[] = [];
          if (!this.isOp(')')) {
            args.push(this.expr(0));
            while (this.isOp(',')) { this.next(); args.push(this.expr(0)); }
          }
          this.expectOp(')');
          return { k: 'call', name: t.v, args, pos: t.pos };
        }
        return { k: 'var', name: t.v, pos: t.pos };
      }
      case 'op':
        if (t.v === '(') {
          const e = this.expr(0);
          this.expectOp(')');
          return e;
        }
        throw new ExpressionError(`Unexpected "${t.v}"`, t.pos);
      default:
        throw new ExpressionError('The expression ends too early', t.pos);
    }
  }
}

const num = (v: Value): number => (typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : v === null || v === '' ? NaN : Number(v));
const str = (v: Value): string => (v === null ? '' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6)) : String(v));
const truthy = (v: Value): boolean => !(v === null || v === false || v === 0 || v === '' || (typeof v === 'number' && Number.isNaN(v)));
const asDate = (v: Value): Date | null => {
  if (v === null) return null;
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
};

type Fn = (args: Value[]) => Value;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const FUNCTIONS: Record<string, { fn: Fn; sig: string; doc: string }> = {
  Round: { sig: 'Round(value, digits)', doc: 'Round to a number of decimal places.', fn: ([v, d]) => { const p = 10 ** (num(d ?? 0) || 0); return Math.round(num(v) * p) / p; } },
  Floor: { sig: 'Floor(value)', doc: 'Round down.', fn: ([v]) => Math.floor(num(v)) },
  Ceil: { sig: 'Ceil(value)', doc: 'Round up.', fn: ([v]) => Math.ceil(num(v)) },
  Abs: { sig: 'Abs(value)', doc: 'Absolute value.', fn: ([v]) => Math.abs(num(v)) },
  Sqrt: { sig: 'Sqrt(value)', doc: 'Square root.', fn: ([v]) => Math.sqrt(num(v)) },
  Log: { sig: 'Log(value)', doc: 'Natural logarithm.', fn: ([v]) => Math.log(num(v)) },
  Pow: { sig: 'Pow(base, exponent)', doc: 'Raise to a power.', fn: ([a, b]) => num(a) ** num(b) },
  Min: { sig: 'Min(a, b, ...)', doc: 'Smallest value.', fn: (a) => Math.min(...a.map(num)) },
  Max: { sig: 'Max(a, b, ...)', doc: 'Largest value.', fn: (a) => Math.max(...a.map(num)) },
  IIf: { sig: 'IIf(condition, ifTrue, ifFalse)', doc: 'Pick between two values.', fn: ([c, a, b]) => (truthy(c) ? a : b) },
  When: { sig: 'When(cond1, value1, ..., default)', doc: 'First value whose condition holds.', fn: (a) => { for (let i = 0; i + 1 < a.length; i += 2) if (truthy(a[i])) return a[i + 1]; return a.length % 2 ? a[a.length - 1] : null; } },
  DefaultValue: { sig: 'DefaultValue(value, fallback)', doc: 'Fallback for empty values.', fn: ([v, d]) => (v === null || v === '' || (typeof v === 'number' && Number.isNaN(v)) ? d : v) },
  IsEmpty: { sig: 'IsEmpty(value)', doc: 'True for blank or missing values.', fn: ([v]) => v === null || v === '' || (typeof v === 'number' && Number.isNaN(v)) },
  Number: { sig: 'Number(value)', doc: 'Read text as a number.', fn: ([v]) => num(v) },
  Text: { sig: 'Text(value, digits)', doc: 'Format as text with thousands separators.', fn: ([v, d]) => { const n = num(v); return Number.isFinite(n) ? n.toLocaleString('en-GB', { maximumFractionDigits: d === undefined ? 2 : num(d), minimumFractionDigits: d === undefined ? 0 : num(d) }) : str(v); } },
  Upper: { sig: 'Upper(text)', doc: 'UPPER CASE.', fn: ([v]) => str(v).toUpperCase() },
  Lower: { sig: 'Lower(text)', doc: 'lower case.', fn: ([v]) => str(v).toLowerCase() },
  Proper: { sig: 'Proper(text)', doc: 'Title Case.', fn: ([v]) => str(v).toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) },
  Left: { sig: 'Left(text, n)', doc: 'First n characters.', fn: ([v, n]) => str(v).slice(0, num(n)) },
  Concatenate: { sig: 'Concatenate(a, b, ...)', doc: 'Join values into text.', fn: (a) => a.map(str).join('') },
  Find: { sig: 'Find(search, text)', doc: 'Position of search in text, or -1.', fn: ([s, t]) => str(t).indexOf(str(s)) },
  Year: { sig: 'Year(date)', doc: 'Calendar year.', fn: ([v]) => asDate(v)?.getFullYear() ?? null },
  Month: { sig: 'Month(date)', doc: 'Month number, 1 to 12.', fn: ([v]) => { const d = asDate(v); return d ? d.getMonth() + 1 : null; } },
  Day: { sig: 'Day(date)', doc: 'Day of the month.', fn: ([v]) => asDate(v)?.getDate() ?? null },
  Hour: { sig: 'Hour(date)', doc: 'Hour, 0 to 23.', fn: ([v]) => asDate(v)?.getHours() ?? null },
  Weekday: { sig: 'Weekday(date)', doc: 'Day name, Monday to Sunday.', fn: ([v]) => { const d = asDate(v); return d ? WEEKDAYS[d.getDay()] : null; } },
};

export interface Compiled {
  source: string;
  fields: string[];
  run: (row: Record<string, Cell>) => Value;
}

const MAX_STEPS = 5000;

export function compile(source: string): Compiled {
  const prog = new Parser(tokenize(source)).program();
  const fields = new Set<string>();
  const walk = (n: Node) => {
    if (n.k === 'field') fields.add(n.name);
    if (n.k === 'un') walk(n.a);
    if (n.k === 'bin') { walk(n.a); walk(n.b); }
    if (n.k === 'tern') { walk(n.c); walk(n.a); walk(n.b); }
    if (n.k === 'call') {
      if (!FUNCTIONS[n.name]) throw new ExpressionError(`Unknown function ${n.name}(). Try ${closest(n.name)}`, n.pos);
      n.args.forEach(walk);
    }
  };
  const declared = new Set<string>();
  for (const s of prog) {
    walk(s.e);
    const check = (n: Node) => {
      if (n.k === 'var' && !declared.has(n.name)) throw new ExpressionError(`"${n.name}" is not defined. Declare it with var, or use $feature.${n.name}`, n.pos);
      if (n.k === 'un') check(n.a);
      if (n.k === 'bin') { check(n.a); check(n.b); }
      if (n.k === 'tern') { check(n.c); check(n.a); check(n.b); }
      if (n.k === 'call') n.args.forEach(check);
    };
    check(s.e);
    if (s.k === 'let') declared.add(s.name);
  }

  const run = (row: Record<string, Cell>): Value => {
    let steps = 0;
    const scope = new Map<string, Value>();
    const ev = (n: Node): Value => {
      if (++steps > MAX_STEPS) throw new ExpressionError('The expression took too many steps', 0);
      switch (n.k) {
        case 'lit': return n.v;
        case 'field': {
          const v = row[n.name];
          if (v === undefined || v === null) return null;
          if (typeof v === 'number') return v;
          const s = String(v);
          const asNum = Number(s);
          return s.trim() !== '' && Number.isFinite(asNum) ? asNum : s;
        }
        case 'var': return scope.get(n.name) ?? null;
        case 'un': { const a = ev(n.a); return n.op === '-' ? -num(a) : !truthy(a); }
        case 'tern': return truthy(ev(n.c)) ? ev(n.a) : ev(n.b);
        case 'call': return FUNCTIONS[n.name].fn(n.args.map(ev));
        case 'bin': {
          if (n.op === '&&') return truthy(ev(n.a)) && truthy(ev(n.b));
          if (n.op === '||') return truthy(ev(n.a)) || truthy(ev(n.b));
          const a = ev(n.a);
          const b = ev(n.b);
          switch (n.op) {
            case '+': return typeof a === 'string' || typeof b === 'string' ? str(a) + str(b) : num(a) + num(b);
            case '-': return num(a) - num(b);
            case '*': return num(a) * num(b);
            case '/': return num(b) === 0 ? null : num(a) / num(b);
            case '%': return num(a) % num(b);
            case '==': return a === b || (a !== null && b !== null && str(a) === str(b));
            case '!=': return !(a === b || (a !== null && b !== null && str(a) === str(b)));
            case '<': return typeof a === 'string' && typeof b === 'string' ? a < b : num(a) < num(b);
            case '>': return typeof a === 'string' && typeof b === 'string' ? a > b : num(a) > num(b);
            case '<=': return num(a) <= num(b);
            case '>=': return num(a) >= num(b);
          }
          return null;
        }
      }
    };
    let last: Value = null;
    for (const s of prog) {
      if (s.k === 'let') scope.set(s.name, ev(s.e));
      else if (s.k === 'ret') return ev(s.e);
      else last = ev(s.e);
    }
    return last;
  };
  return { source, fields: [...fields], run };
}

function closest(name: string): string {
  const names = Object.keys(FUNCTIONS);
  let best = names[0];
  let bestD = Infinity;
  for (const n of names) {
    const d = levenshtein(name.toLowerCase(), n.toLowerCase());
    if (d < bestD) { bestD = d; best = n; }
  }
  return `${best}()`;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** Validate against a dataset's field names; returns a message or null. */
export function validateFields(c: Compiled, fieldNames: string[]): string | null {
  const missing = c.fields.filter((f) => !fieldNames.includes(f));
  return missing.length ? `No field called ${missing.map((m) => `"${m}"`).join(', ')}` : null;
}

export const valueToText = str;
export const valueIsTrue = truthy;
