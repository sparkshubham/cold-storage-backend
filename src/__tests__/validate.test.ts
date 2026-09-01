import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';

describe('validate middleware', () => {
  it('accepts Express 5 read-only query', () => {
    const raw = { sourceType: 'inward', sourceId: '6a969b0e3914f5f2c4069082' };
    const req: { query: typeof raw } = {} as { query: typeof raw };
    Object.defineProperty(req, 'query', {
      get: () => raw,
      configurable: true,
    });
    const res = {} as never;
    let nextErr: unknown;
    const mw = validate(
      z.object({
        sourceType: z.enum(['inward', 'outward']),
        sourceId: z.string().min(1),
      }),
      'query',
    );
    mw(req as never, res, (err?: unknown) => {
      nextErr = err;
    });
    expect(nextErr).toBeUndefined();
    expect(req.query).toEqual(raw);
  });
});
