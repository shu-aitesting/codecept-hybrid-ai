export type RestHeaders = Record<string, string>;
export type RestQueryParams = Record<string, string | number | boolean>;

export interface RestRequestConfig {
  timeout?: number;
  failOnStatusCode?: boolean;
  followRedirects?: boolean;
}
