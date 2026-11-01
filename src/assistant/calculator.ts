import { ASSISTANT_LIMITS as L } from './config.ts';

// Numeric expression grammar only. No JavaScript evaluator or property lookup.
const TOKEN = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|^\*\*|^[+\-*/%()]/;
const PRECEDENCE: Record<string, number> = { '+': 10, '-': 10, '*': 20, '/': 20, '%': 20, '**': 30 };
const UNARY_PRECEDENCE = 25; // Binding power: exponentiation binds more strongly than unary negation.
export function calculate(expression: string): number {
  if (typeof expression !== 'string' || !expression.trim() || expression.length > L.calculationChars) throw new Error('Enter a bounded numeric expression.');
  const tokens: string[] = []; let remaining = expression.trim();
  while (remaining) {
    const token = TOKEN.exec(remaining)?.[0]; if (!token) throw new Error('Only numbers and arithmetic operators are supported.');
    tokens.push(token); if (tokens.length > L.calculationTokens) throw new Error('Calculation is too complex.'); remaining = remaining.slice(token.length).trimStart();
  }
  let cursor = 0;
  function parse(minimum: number, depth: number): number {
    if (depth > L.calculationDepth) throw new Error('Calculation is too deeply nested.');
    const token = tokens[cursor++]; let left: number;
    if (token === '+' || token === '-') left = (token === '-' ? -1 : 1) * parse(UNARY_PRECEDENCE, depth + 1);
    else if (token === '(') { left = parse(0, depth + 1); if (tokens[cursor++] !== ')') throw new Error('Unclosed calculation parentheses.'); }
    else { left = Number(token); if (token === undefined || !Number.isFinite(left)) throw new Error('Invalid calculation number.'); }
    while (cursor < tokens.length && PRECEDENCE[tokens[cursor]] !== undefined && PRECEDENCE[tokens[cursor]] >= minimum) {
      const operator = tokens[cursor++], power = PRECEDENCE[operator], right = parse(operator === '**' ? power : power + 1, depth + 1);
      switch (operator) { case '+': left += right; break; case '-': left -= right; break; case '*': left *= right; break; case '/': left /= right; break; case '%': left %= right; break; case '**': left **= right; break; }
      if (!Number.isFinite(left)) throw new Error('Calculation has no finite result.');
    }
    return left;
  }
  const result = parse(0, 0); if (cursor !== tokens.length) throw new Error('Invalid calculation expression.'); return Object.is(result, -0) ? 0 : result;
}
