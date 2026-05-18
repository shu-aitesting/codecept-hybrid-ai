import { config } from '@core/config/ConfigLoader';

import { RestClient } from '@api/rest/RestClient';
import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';

const PING_ENDPOINT = '/ping';

export const GET_PING_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      example: 'ok',
    },
  },
  required: ['status'],
} as const;

export interface GetPingResponse {
  status: string;
}

export class PingService {
  constructor(private readonly client: RestClient) {}

  async getPing() {
    const req = new RestRequestBuilder().get(`${config.apiUrl}${PING_ENDPOINT}`).build();
    return this.client.send(req);
  }
}
