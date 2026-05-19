import { config } from '@core/config/ConfigLoader';

import { RestClient } from '@api/rest/RestClient';
import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';

const USER_CREATEWITHLIST_ENDPOINT = '/user/createWithList';
const USER_ENDPOINT = '/user';
const USER_LOGIN_ENDPOINT = '/user/login';
const USER_LOGOUT_ENDPOINT = '/user/logout';
const USER_CREATEWITHARRAY_ENDPOINT = '/user/createWithArray';

export const GET_USER_BY_NAME_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    id: {
      type: 'integer',
      format: 'int64',
    },
    username: {
      type: 'string',
    },
    firstName: {
      type: 'string',
    },
    lastName: {
      type: 'string',
    },
    email: {
      type: 'string',
    },
    password: {
      type: 'string',
    },
    phone: {
      type: 'string',
    },
    userStatus: {
      type: 'integer',
      format: 'int32',
      description: 'User Status',
    },
  },
  xml: {
    name: 'User',
  },
} as const;

export const LOGIN_USER_RESPONSE_SCHEMA = {
  type: 'string',
} as const;

export interface CreateUsersWithListInputRequest {}

export interface GetUserByNameResponse {
  id?: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  phone?: string;
  userStatus?: number;
}

export interface UpdateUserRequest {
  id?: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  phone?: string;
  userStatus?: number;
}

export interface LoginUserResponse {}

export interface CreateUsersWithArrayInputRequest {}

export interface CreateUserRequest {
  id?: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  phone?: string;
  userStatus?: number;
}

export class UserService {
  constructor(private readonly client: RestClient) {}

  async createUsersWithListInput(body: CreateUsersWithListInputRequest) {
    const req = new RestRequestBuilder()
      .post(`${config.apiUrl}${USER_CREATEWITHLIST_ENDPOINT}`)
      .json(body)
      .build();
    return this.client.send(req);
  }

  async getUserByName(username: string) {
    const req = new RestRequestBuilder()
      .get(`${config.apiUrl}${USER_ENDPOINT}/${username}`)
      .build();
    return this.client.send(req);
  }

  async updateUser(username: string, body: UpdateUserRequest) {
    const req = new RestRequestBuilder()
      .put(`${config.apiUrl}${USER_ENDPOINT}/${username}`)
      .json(body)
      .build();
    return this.client.send(req);
  }

  async deleteUser(username: string) {
    const req = new RestRequestBuilder()
      .delete(`${config.apiUrl}${USER_ENDPOINT}/${username}`)
      .build();
    return this.client.send(req);
  }

  async loginUser(username: string, password: string) {
    const req = new RestRequestBuilder()
      .get(`${config.apiUrl}${USER_LOGIN_ENDPOINT}`)
      .query('username', username)
      .query('password', password)
      .build();
    return this.client.send(req);
  }

  async logoutUser() {
    const req = new RestRequestBuilder().get(`${config.apiUrl}${USER_LOGOUT_ENDPOINT}`).build();
    return this.client.send(req);
  }

  async createUsersWithArrayInput(body: CreateUsersWithArrayInputRequest) {
    const req = new RestRequestBuilder()
      .post(`${config.apiUrl}${USER_CREATEWITHARRAY_ENDPOINT}`)
      .json(body)
      .build();
    return this.client.send(req);
  }

  async createUser(body: CreateUserRequest) {
    const req = new RestRequestBuilder()
      .post(`${config.apiUrl}${USER_ENDPOINT}`)
      .json(body)
      .build();
    return this.client.send(req);
  }
}
