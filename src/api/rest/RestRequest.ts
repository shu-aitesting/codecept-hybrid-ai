import { RestMethod } from './RestMethod';
import { RestHeaders, RestQueryParams } from './types';

export type AuthScheme = 'bearer' | 'basic' | 'apikey' | null;

export class RestRequest {
  constructor(
    public readonly url: string,
    public readonly method: RestMethod,
    public readonly headers: RestHeaders = {},
    public readonly params: RestQueryParams = {},
    public readonly body?: unknown,
    public readonly timeout: number = 30000,
    public readonly followRedirects: boolean = true,
    public readonly authScheme: AuthScheme = null,
  ) {}

  buildUrl(): string {
    const entries = Object.entries(this.params);
    if (entries.length === 0) return this.url;
    const qs = entries
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    return `${this.url}?${qs}`;
  }

  toCurl(): string {
    const parts = [`curl -X ${this.method}`];
    Object.entries(this.headers).forEach(([k, v]) => parts.push(`-H "${k}: ${v}"`));
    if (this.body) parts.push(`-d '${JSON.stringify(this.body)}'`);
    parts.push(`"${this.buildUrl()}"`);
    return parts.join(' \\\n  ');
  }
}
