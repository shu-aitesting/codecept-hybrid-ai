import { Helper } from 'codeceptjs';

import { config as appConfig } from '@core/config/ConfigLoader';

import { RestClient } from '@api/rest/RestClient';
import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';
import { RestResponse } from '@api/rest/RestResponse';
import { RestHeaders, RestQueryParams } from '@api/rest/types';

class RestHelper extends Helper {
  private client = new RestClient();

  async _before(): Promise<void> {
    await this.client.init(appConfig.apiUrl);
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
    const builder = new RestRequestBuilder()
      .delete(path)
      .headers(options.headers ?? {});
    return this.client.send<T>(builder.build());
  }
}

export = RestHelper;
