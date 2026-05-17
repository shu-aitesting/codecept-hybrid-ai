import { config } from '@core/config/ConfigLoader';

import { RestClient } from '@api/rest/RestClient';
import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';

const GIFT_LIST_FIND_ENDPOINT = '/api/GiftList/Find';

export interface GiftListFindRequest {
  name: string;
  month: string;
}

export class FindService {
  constructor(private readonly client: RestClient) {}

  async findGiftList(params: GiftListFindRequest) {
    const req = new RestRequestBuilder()
      .post(`${config.apiUrl}${GIFT_LIST_FIND_ENDPOINT}`)
      .header('Accept', 'application/json, text/plain, */*')
      .json(params)
      .build();
    return this.client.send(req);
  }
}
