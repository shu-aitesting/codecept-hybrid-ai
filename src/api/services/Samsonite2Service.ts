import { config } from '@core/config/ConfigLoader';

import { RestClient } from '@api/rest/RestClient';
import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';

const GIFT_LIST_FIND_ENDPOINT = '/api/GiftList/Find';

export interface Samsonite2Request {
  name: string;
  month: string;
}

export interface Samsonite2Response {
  id: string;
  name: string;
  month: string;
}

export class Samsonite2Service {
  constructor(private readonly client: RestClient) {}

  async findGiftList(params: Samsonite2Request) {
    const req = new RestRequestBuilder()
      .get(`${config.apiUrl}${GIFT_LIST_FIND_ENDPOINT}`)
      .header('Accept', 'application/json, text/plain, */*')
      .json(params)
      .build();
    return this.client.send<Samsonite2Response>(req);
  }
}
