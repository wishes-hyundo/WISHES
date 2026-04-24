// L-sec132 (2026-04-23): L-sec106/114/126 회귀 방지.
//   escapeIlike 가 빠지면 과거와 같은 predicate injection 이 다시 열린다.
//   이 파일이 실패하면 즉시 원상복구.

import { describe, it, expect } from 'vitest';
import { escapeIlike } from './sqlEscape';

describe('escapeIlike', () => {
  it('passes plain ASCII through unchanged', () => {
    expect(escapeIlike('foo')).toBe('foo');
    expect(escapeIlike('hello world')).toBe('hello world');
  });

  it('passes Korean through unchanged (common legitimate input)', () => {
    expect(escapeIlike('강남구 역삼동')).toBe('강남구 역삼동');
    expect(escapeIlike('원룸')).toBe('원룸');
  });

  it('escapes % wildcard to \\%', () => {
    expect(escapeIlike('50%')).toBe('50\\%');
    expect(escapeIlike('%%%')).toBe('\\%\\%\\%');
  });

  it('escapes _ wildcard to \\_', () => {
    expect(escapeIlike('foo_bar')).toBe('foo\\_bar');
    expect(escapeIlike('___')).toBe('\\_\\_\\_');
  });

  it('escapes backslash itself to \\\\ (prevents escape-of-escape bypass)', () => {
    expect(escapeIlike('foo\\bar')).toBe('foo\\\\bar');
  });

  it('escapes all three metacharacters in one pass', () => {
    expect(escapeIlike('%_\\')).toBe('\\%\\_\\\\');
  });

  it('defuses prompt-injection style payloads as literals', () => {
    // 공격 페이로드: filters.dong = '%" OR status."eq."공개%'
    // escape 후 결과는 정확히 리터럴로 LIKE 에 넘어가야 함 (predicate 조작 불가)
    const attack = '%" OR status."eq."공개%';
    const escaped = escapeIlike(attack);
    expect(escaped).toBe('\\%" OR status."eq."공개\\%');
    // %, _, \ 만 escape 되었고 다른 문자(", space, OR, 한글 등) 는 전부 리터럴.
    // 불변식: escape 후 문자열에는 "\\ 로 preceded 되지 않은 raw %" 가 단 한 글자도 없어야 한다.
    //   (단순 substring 검사인 not.toContain('%"') 는 \\%" 에도 걸려서 부적합.)
    expect(escaped).not.toMatch(/(?<!\\)%/);
    expect(escaped).not.toMatch(/(?<!\\)_/);
  });

  it('is idempotent under empty string', () => {
    expect(escapeIlike('')).toBe('');
  });
});
