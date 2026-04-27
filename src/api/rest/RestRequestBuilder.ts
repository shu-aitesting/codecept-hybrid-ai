import { RestMethod } from './RestMethod';
import { RestRequest } from './RestRequest';
import { RestHeaders, RestQueryParams } from './types';

export class RestRequestBuilder {
  private _url = '';
  private _method = RestMethod.GET;
  private _headers: RestHeaders = {};
  private _params: RestQueryParams = {};
  private _body?: unknown;
  private _timeout = 30000;
  private _followRedirects = true;

  url(u: string): this {
    this._url = u;
    return this;
  }

  method(m: RestMethod): this {
    this._method = m;
    return this;
  }

  get(u: string): this {
    return this.url(u).method(RestMethod.GET);
  }

  post(u: string): this {
    return this.url(u).method(RestMethod.POST);
  }

  put(u: string): this {
    return this.url(u).method(RestMethod.PUT);
  }

  patch(u: string): this {
    return this.url(u).method(RestMethod.PATCH);
  }

  delete(u: string): this {
    return this.url(u).method(RestMethod.DELETE);
  }

  header(k: string, v: string): this {
    this._headers[k] = v;
    return this;
  }

  headers(h: RestHeaders): this {
    Object.assign(this._headers, h);
    return this;
  }

  query(k: string, v: string | number | boolean): this {
    this._params[k] = v;
    return this;
  }

  params(p: RestQueryParams): this {
    Object.assign(this._params, p);
    return this;
  }

  body(b: unknown): this {
    this._body = b;
    return this;
  }

  json(b: unknown): this {
    this._headers['Content-Type'] = 'application/json';
    this._body = b;
    return this;
  }

  timeout(ms: number): this {
    this._timeout = ms;
    return this;
  }

  followRedirects(follow: boolean): this {
    this._followRedirects = follow;
    return this;
  }

  build(): RestRequest {
    if (!this._url) throw new Error('RestRequestBuilder: URL is required');
    return new RestRequest(
      this._url,
      this._method,
      this._headers,
      this._params,
      this._body,
      this._timeout,
      this._followRedirects,
    );
  }
}
