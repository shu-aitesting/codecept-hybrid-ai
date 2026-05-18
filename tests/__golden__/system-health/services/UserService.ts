import { config } from '@core/config/ConfigLoader';

import { RestClient } from '@api/rest/RestClient';
import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';

const USERS_ENDPOINT = '/users';

export const GET_USERS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    data: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
          },
          name: {
            type: 'string',
          },
          email: {
            type: 'string',
            format: 'email',
          },
        },
        required: ['id', 'name', 'email'],
      },
    },
    total: {
      type: 'integer',
    },
  },
} as const;

export const CREATE_USER_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    id: {
      type: 'integer',
      example: 1,
    },
    name: {
      type: 'string',
      example: 'John Doe',
    },
    email: {
      type: 'string',
      format: 'email',
      example: 'john@example.com',
    },
    role: {
      type: 'string',
      enum: ['admin', 'user', 'guest'],
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
    },
  },
  required: ['id', 'name', 'email'],
} as const;

export const GET_USER_BY_ID_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    id: {
      type: 'integer',
      example: 1,
    },
    name: {
      type: 'string',
      example: 'John Doe',
    },
    email: {
      type: 'string',
      format: 'email',
      example: 'john@example.com',
    },
    role: {
      type: 'string',
      enum: ['admin', 'user', 'guest'],
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
    },
  },
  required: ['id', 'name', 'email'],
} as const;

export const UPDATE_USER_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    id: {
      type: 'integer',
      example: 1,
    },
    name: {
      type: 'string',
      example: 'John Doe',
    },
    email: {
      type: 'string',
      format: 'email',
      example: 'john@example.com',
    },
    role: {
      type: 'string',
      enum: ['admin', 'user', 'guest'],
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
    },
  },
  required: ['id', 'name', 'email'],
} as const;

export interface GetUsersResponse {
  data?: Record<string, unknown>[];
  total?: number;
}

export interface CreateUserRequest {
  name: string;
  email: string;
  role?: string;
}

export interface CreateUserResponse {
  id: number;
  name: string;
  email: string;
  role?: string;
  createdAt?: string;
}

export interface GetUserByIdResponse {
  id: number;
  name: string;
  email: string;
  role?: string;
  createdAt?: string;
}

export interface UpdateUserRequest {
  name: string;
  email?: string;
}

export interface UpdateUserResponse {
  id: number;
  name: string;
  email: string;
  role?: string;
  createdAt?: string;
}

export class UserService {
  constructor(private readonly client: RestClient) {}

  async getUsers(opts?: { page?: number; limit?: number }) {
    const builder = new RestRequestBuilder().get(`${config.apiUrl}${USERS_ENDPOINT}`);
    if (opts?.page !== undefined) builder.query('page', opts.page!);
    if (opts?.limit !== undefined) builder.query('limit', opts.limit!);
    return this.client.send(builder.build());
  }

  async createUser(body: CreateUserRequest) {
    const req = new RestRequestBuilder()
      .post(`${config.apiUrl}${USERS_ENDPOINT}`)
      .json(body)
      .build();
    return this.client.send(req);
  }

  async getUserById(id: number) {
    const req = new RestRequestBuilder().get(`${config.apiUrl}${USERS_ENDPOINT}/${id}`).build();
    return this.client.send(req);
  }

  async updateUser(id: number, body: UpdateUserRequest) {
    const req = new RestRequestBuilder()
      .put(`${config.apiUrl}${USERS_ENDPOINT}/${id}`)
      .json(body)
      .build();
    return this.client.send(req);
  }

  async deleteUser(id: number) {
    const req = new RestRequestBuilder().delete(`${config.apiUrl}${USERS_ENDPOINT}/${id}`).build();
    return this.client.send(req);
  }
}
