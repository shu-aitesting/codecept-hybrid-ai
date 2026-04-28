import { RestClient } from '@api/rest/RestClient';
import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';

const GIFT_LIST_FIND_URL = 'https://core-api.weddingshop.com/api/GiftList/Find';

export interface GiftListFindRequest {
  name: string;
  month: string;
}

export class FindService {
  constructor(private readonly client: RestClient) {}

  async findGiftList(params: GiftListFindRequest) {
    const req = new RestRequestBuilder()
      .post(GIFT_LIST_FIND_URL)
      .header('Accept', 'application/json, text/plain, */*')
      .header('Accept-Language', 'en-US,en;q=0.9,vi;q=0.8,kk;q=0.7')
      .header('Origin', 'https://www.weddingshop.com')
      .json(params)
      .build();
    return this.client.send(req);
  }
}
