import { Helper } from 'codeceptjs';

import { config as appConfig } from '@core/config/ConfigLoader';

import { RestClient } from '@api/rest/RestClient';
import { RestRequest } from '@api/rest/RestRequest';
import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';
import { RestResponse } from '@api/rest/RestResponse';
import { RestHeaders, RestQueryParams } from '@api/rest/types';

const SENSITIVE_HEADERS = ['authorization', 'cookie', 'x-api-key'];

class RestHelper extends Helper {
  private client!: RestClient;

  async _before(): Promise<void> {
    this.client = new RestClient({
      onResponse: (req, res) => this.attachToAllure(req, res),
    });
    await this.client.init(appConfig.apiUrl);
  }

  private attachToAllure(req: RestRequest, res: RestResponse): void {
    if (process.env.ATTACH_API_TO_REPORT === 'false') return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allure = (codeceptjs as any).container.plugins('allure');
      if (!allure?.addAttachment) return;
      const reqBlob = JSON.stringify(
        {
          method: req.method,
          url: req.buildUrl(),
          headers: this.redactHeaders(req.headers),
          body: req.body,
        },
        null,
        2,
      );
      const resBlob = JSON.stringify(
        { status: res.status, durationMs: res.durationMs, headers: res.headers, body: res.body },
        null,
        2,
      );
      allure.addAttachment(`API Request — ${req.method} ${req.url}`, reqBlob, 'application/json');
      allure.addAttachment(
        `API Response — ${res.status} (${res.durationMs}ms)`,
        resBlob,
        'application/json',
      );
    } catch {
      // Allure plugin absent or threw — silently skip attachment
    }
  }

  private redactHeaders(headers: RestHeaders): RestHeaders {
    return Object.fromEntries(
      Object.entries(headers).map(([k, v]) =>
        SENSITIVE_HEADERS.includes(k.toLowerCase()) ? [k, '***redacted***'] : [k, v],
      ),
    );
  }

  async _after(): Promise<void> {
    await this.client.dispose();
  }

  api(): RestRequestBuilder {
    return new RestRequestBuilder();
  }

  async sendApiRequest<T = unknown>(builder: RestRequestBuilder): Promise<RestResponse<T>> {
    return this.client.send<T>(builder.build());
  }

  async sendGet<T = unknown>(
    path: string,
    options: { headers?: RestHeaders; params?: RestQueryParams } = {},
  ): Promise<RestResponse<T>> {
    const builder = new RestRequestBuilder()
      .get(path)
      .headers(options.headers ?? {})
      .params(options.params ?? {});
    return this.client.send<T>(builder.build());
  }

  async sendPost<T = unknown>(
    path: string,
    body: unknown,
    options: { headers?: RestHeaders } = {},
  ): Promise<RestResponse<T>> {
    const builder = new RestRequestBuilder()
      .post(path)
      .json(body)
      .headers(options.headers ?? {});
    return this.client.send<T>(builder.build());
  }

  async sendPut<T = unknown>(
    path: string,
    body: unknown,
    options: { headers?: RestHeaders } = {},
  ): Promise<RestResponse<T>> {
    const builder = new RestRequestBuilder()
      .put(path)
      .json(body)
      .headers(options.headers ?? {});
    return this.client.send<T>(builder.build());
  }

  async sendPatch<T = unknown>(
    path: string,
    body: unknown,
    options: { headers?: RestHeaders } = {},
  ): Promise<RestResponse<T>> {
    const builder = new RestRequestBuilder()
      .patch(path)
      .json(body)
      .headers(options.headers ?? {});
    return this.client.send<T>(builder.build());
  }

  async sendDelete<T = unknown>(
    path: string,
    options: { headers?: RestHeaders } = {},
  ): Promise<RestResponse<T>> {
    const builder = new RestRequestBuilder().delete(path).headers(options.headers ?? {});
    return this.client.send<T>(builder.build());
  }
}

export = RestHelper;
