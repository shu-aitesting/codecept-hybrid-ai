import { RestClient } from '@api/rest/RestClient';
import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';

export class KitchenaidService {
  constructor(private readonly client: RestClient) {}

  async getKitchenaid(seoName: string = 'kitchenaid') {
    const req = new RestRequestBuilder()
      .get(`https://core-api.weddingshop.com/api/Brands/GetBySeoName/${seoName}`)
      .header('accept', 'application/json, text/plain, */*')
      .header('accept-language', 'en-US,en;q=0.9,vi;q=0.8,kk;q=0.7')
      .header('origin', 'https://www.weddingshop.com')
      .build();
    return this.client.send(req);
  }
}
