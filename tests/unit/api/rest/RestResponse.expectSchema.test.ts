import { describe, expect, it } from 'vitest';

import { RestResponse } from '../../../../src/api/rest/RestResponse';

function makeResponse<T>(body: T, headers: Record<string, string> = {}): RestResponse<T> {
  return new RestResponse<T>(200, headers, body, 0);
}

describe('RestResponse.expectSchema', () => {
  it('returns this on valid body — allows chaining', () => {
    const schema = { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] };
    const res = makeResponse({ id: 1 });
    expect(res.expectSchema(schema)).toBe(res);
  });

  it('passes for matching object schema', () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'number' } },
      required: ['name'],
    };
    expect(() => makeResponse({ name: 'Alice', age: 30 }).expectSchema(schema)).not.toThrow();
  });

  it('throws with error details when required field is missing', () => {
    const schema = { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] };
    expect(() => makeResponse({}).expectSchema(schema)).toThrow(
      '[RestResponse] Schema validation failed',
    );
  });

  it('throws when type does not match', () => {
    const schema = { type: 'object' };
    expect(() => makeResponse('not-an-object').expectSchema(schema)).toThrow('[RestResponse]');
  });

  it('passes for array schema with items', () => {
    const schema = { type: 'array', items: { type: 'number' } };
    expect(() => makeResponse([1, 2, 3]).expectSchema(schema)).not.toThrow();
  });

  it('fails for array schema with wrong item type', () => {
    const schema = { type: 'array', items: { type: 'number' } };
    expect(() => makeResponse(['a', 'b']).expectSchema(schema)).toThrow();
  });
});

describe('RestResponse.expectContentType', () => {
  it('returns this on match — allows chaining', () => {
    const res = makeResponse({}, { 'content-type': 'application/json; charset=utf-8' });
    expect(res.expectContentType('application/json')).toBe(res);
  });

  it('passes when content-type starts with expected', () => {
    expect(() =>
      makeResponse({}, { 'content-type': 'application/json; charset=utf-8' }).expectContentType(
        'application/json',
      ),
    ).not.toThrow();
  });

  it('passes for exact match', () => {
    expect(() =>
      makeResponse({}, { 'content-type': 'text/plain' }).expectContentType('text/plain'),
    ).not.toThrow();
  });

  it('throws when content-type does not match', () => {
    expect(() =>
      makeResponse({}, { 'content-type': 'text/html' }).expectContentType('application/json'),
    ).toThrow('[RestResponse] Content-Type');
  });

  it('throws when content-type header is absent', () => {
    expect(() => makeResponse({}).expectContentType('application/json')).toThrow(
      '[RestResponse] Content-Type',
    );
  });
});
