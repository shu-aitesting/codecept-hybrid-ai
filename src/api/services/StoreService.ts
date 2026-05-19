import { config } from '@core/config/ConfigLoader';

import { RestClient } from '@api/rest/RestClient';
import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';

const STORE_INVENTORY_ENDPOINT = '/store/inventory';
const STORE_ORDER_ENDPOINT = '/store/order';

export const GET_INVENTORY_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: {
    type: 'integer',
    format: 'int32',
  },
} as const;

export const PLACE_ORDER_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    id: {
      type: 'integer',
      format: 'int64',
    },
    petId: {
      type: 'integer',
      format: 'int64',
    },
    quantity: {
      type: 'integer',
      format: 'int32',
    },
    shipDate: {
      type: 'string',
      format: 'date-time',
    },
    status: {
      type: 'string',
      description: 'Order Status',
      enum: ['placed', 'approved', 'delivered'],
    },
    complete: {
      type: 'boolean',
    },
  },
  xml: {
    name: 'Order',
  },
} as const;

export const GET_ORDER_BY_ID_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    id: {
      type: 'integer',
      format: 'int64',
    },
    petId: {
      type: 'integer',
      format: 'int64',
    },
    quantity: {
      type: 'integer',
      format: 'int32',
    },
    shipDate: {
      type: 'string',
      format: 'date-time',
    },
    status: {
      type: 'string',
      description: 'Order Status',
      enum: ['placed', 'approved', 'delivered'],
    },
    complete: {
      type: 'boolean',
    },
  },
  xml: {
    name: 'Order',
  },
} as const;

export interface GetInventoryResponse {}

export interface PlaceOrderRequest {
  id?: number;
  petId?: number;
  quantity?: number;
  shipDate?: string;
  status?: string;
  complete?: boolean;
}

export interface PlaceOrderResponse {
  id?: number;
  petId?: number;
  quantity?: number;
  shipDate?: string;
  status?: string;
  complete?: boolean;
}

export interface GetOrderByIdResponse {
  id?: number;
  petId?: number;
  quantity?: number;
  shipDate?: string;
  status?: string;
  complete?: boolean;
}

export class StoreService {
  constructor(private readonly client: RestClient) {}

  async getInventory() {
    const req = new RestRequestBuilder().get(`${config.apiUrl}${STORE_INVENTORY_ENDPOINT}`).build();
    return this.client.send(req);
  }

  async placeOrder(body: PlaceOrderRequest) {
    const req = new RestRequestBuilder()
      .post(`${config.apiUrl}${STORE_ORDER_ENDPOINT}`)
      .json(body)
      .build();
    return this.client.send(req);
  }

  async getOrderById(orderId: string) {
    const req = new RestRequestBuilder()
      .get(`${config.apiUrl}${STORE_ORDER_ENDPOINT}/${orderId}`)
      .build();
    return this.client.send(req);
  }

  async deleteOrder(orderId: string) {
    const req = new RestRequestBuilder()
      .delete(`${config.apiUrl}${STORE_ORDER_ENDPOINT}/${orderId}`)
      .build();
    return this.client.send(req);
  }
}
