import { config } from '@core/config/ConfigLoader';

import { RestClient } from '@api/rest/RestClient';
import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';

const SAMSONITE_ENDPOINT = '/api/Brands/GetBySeoName/samsonite';

export interface SamsoniteResponse {
  id: number;
  name: string;
  seoName: string;
  description: string;
}

export class SamsoniteService {
  constructor(private readonly client: RestClient) {}

  async getSamsonite() {
    const req = new RestRequestBuilder()
      .get(`${config.apiUrl}${SAMSONITE_ENDPOINT}`)
      .header('Accept', 'application/json, text/plain, */*')
      .header('Accept-Language', 'en-US,en;q=0.9,vi;q=0.8,kk;q=0.7')
      .header('Origin', 'https://www.weddingshop.com')
      .build();
    return this.client.send<SamsoniteResponse>(req);
  }
}
