import { describe, expect, it } from 'vitest';
import { compile, ExpressionError, validateFields } from '../../src/lib/expr/expression';

const row = { temp_f: 212, name: 'Brant Street Pier', crashes: 0, injuries: 3, when: '2026-11-25T18:30', kind: 'Cat' };

describe('expressions', () => {
  it('converts Fahrenheit to Celsius like the course example', () => {
    expect(compile('Round(($feature.temp_f - 32) * 5 / 9, 1)').run(row)).toBe(100);
  });
  it('supports var and return', () => {
    expect(compile('var pct = $feature.injuries / Max($feature.crashes, 1) * 100; return Round(pct, 0) + "%"').run(row)).toBe('300%');
  });
  it('combines fields into a label', () => {
    expect(compile('Upper($feature.name) + " (" + Text(1234567) + ")"').run(row)).toBe('BRANT STREET PIER (1,234,567)');
  });
  it('handles precedence, comparison, logic and ternary', () => {
    expect(compile('1 + 2 * 3').run(row)).toBe(7);
    expect(compile('(1 + 2) * 3').run(row)).toBe(9);
    expect(compile('$feature.injuries > 2 && $feature.kind == "Cat"').run(row)).toBe(true);
    expect(compile('$feature.injuries > 5 ? "many" : "few"').run(row)).toBe('few');
    expect(compile('When($feature.injuries > 5, "high", $feature.injuries > 1, "medium", "low")').run(row)).toBe('medium');
  });
  it('reads dates', () => {
    expect(compile('Weekday($feature.when)').run(row)).toBe('Wednesday');
    expect(compile('Hour($feature.when)').run(row)).toBe(18);
  });
  it('divides by zero to null instead of Infinity', () => {
    expect(compile('$feature.injuries / $feature.crashes').run(row)).toBeNull();
  });
  it('gives helpful errors', () => {
    expect(() => compile('Rnd(1)')).toThrow(/Round\(\)/);
    expect(() => compile('x + 1')).toThrow(/not defined/);
    expect(() => compile('"open')).toThrow(ExpressionError);
    expect(validateFields(compile('$feature.nope'), ['a'])).toMatch(/nope/);
  });
  it('supports bracket field names with spaces', () => {
    expect(compile('$feature["Field name"] * 2').run({ 'Field name': 4 })).toBe(8);
  });
});
