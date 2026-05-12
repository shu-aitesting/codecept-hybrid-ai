import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock playwright BEFORE importing RestClient so it picks up the mock.
const newContextMock = vi.fn();
vi.mock('playwright', () => ({
  request: {
    newContext: (...args: unknown[]) => newContextMock(...args),
  },
}));

// Mock the config module so we control ambient header inputs without env files.
const configMock: { apiToken?: string; apiLanguage?: string; apiTimezone?: string } = {};
vi.mock('../../../../src/core/config/ConfigLoader', () => ({
  config: new Proxy(configMock, {
    get: (target, key) => target[key as keyof typeof target],
  }),
}));

// Late import — depends on the mocks above.
let RestClient: typeof import('../../../../src/api/rest/RestClient').RestClient;
beforeAll(async () => {
  ({ RestClient } = await import('../../../../src/api/rest/RestClient'));
});

beforeEach(() => {
  newContextMock.mockReset();
  newContextMock.mockResolvedValue({
    fetch: vi.fn(),
    dispose: vi.fn(),
  });
  configMock.apiToken = undefined;
  configMock.apiLanguage = undefined;
  configMock.apiTimezone = undefined;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('RestClient.init — ambient headers', () => {
  it('sends NO extraHTTPHeaders when no ambient slots are set', async () => {
    const c = new RestClient();
    await c.init();
    expect(newContextMock).toHaveBeenCalledTimes(1);
    expect(newContextMock.mock.calls[0][0].extraHTTPHeaders).toBeUndefined();
  });

  it('injects Authorization Bearer when config.apiToken is set', async () => {
    configMock.apiToken = 'abc';
    const c = new RestClient();
    await c.init();
    expect(newContextMock.mock.calls[0][0].extraHTTPHeaders).toEqual({
      Authorization: 'Bearer abc',
    });
  });

  it('injects all three ambient headers when all slots are set', async () => {
    configMock.apiToken = 'tok';
    configMock.apiLanguage = 'vi';
    configMock.apiTimezone = 'UTC';
    const c = new RestClient();
    await c.init();
    expect(newContextMock.mock.calls[0][0].extraHTTPHeaders).toEqual({
      Authorization: 'Bearer tok',
      'Accept-Language': 'vi',
      'X-Timezone': 'UTC',
    });
  });

  it('accepts a string baseURL (legacy form) and still merges ambient headers', async () => {
    configMock.apiLanguage = 'en';
    const c = new RestClient();
    await c.init('https://api.example.com');
    const opts = newContextMock.mock.calls[0][0];
    expect(opts.baseURL).toBe('https://api.example.com');
    expect(opts.extraHTTPHeaders).toEqual({ 'Accept-Language': 'en' });
  });

  it('lets explicit extraHTTPHeaders override ambient on a per-key basis', async () => {
    configMock.apiToken = 'from-config';
    const c = new RestClient();
    await c.init({
      baseURL: 'https://x',
      extraHTTPHeaders: { Authorization: 'Bearer override', 'X-Custom': '1' },
    });
    expect(newContextMock.mock.calls[0][0].extraHTTPHeaders).toEqual({
      Authorization: 'Bearer override',
      'X-Custom': '1',
    });
  });

  it('always passes ignoreHTTPSErrors=true', async () => {
    const c = new RestClient();
    await c.init();
    expect(newContextMock.mock.calls[0][0].ignoreHTTPSErrors).toBe(true);
  });
});
