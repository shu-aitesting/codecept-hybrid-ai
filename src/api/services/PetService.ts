import { config } from '@core/config/ConfigLoader';

import { RestClient } from '@api/rest/RestClient';
import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';

const PET_ENDPOINT = '/pet';
const PET_FINDBYSTATUS_ENDPOINT = '/pet/findByStatus';
const PET_FINDBYTAGS_ENDPOINT = '/pet/findByTags';

export const UPLOAD_FILE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    code: {
      type: 'integer',
      format: 'int32',
    },
    type: {
      type: 'string',
    },
    message: {
      type: 'string',
    },
  },
} as const;

export const FIND_PETS_BY_STATUS_RESPONSE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    required: ['name', 'photoUrls'],
    properties: {
      id: {
        type: 'integer',
        format: 'int64',
      },
      category: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            format: 'int64',
          },
          name: {
            type: 'string',
          },
        },
        xml: {
          name: 'Category',
        },
      },
      name: {
        type: 'string',
        example: 'doggie',
      },
      photoUrls: {
        type: 'array',
        xml: {
          wrapped: true,
        },
        items: {
          type: 'string',
          xml: {
            name: 'photoUrl',
          },
        },
      },
      tags: {
        type: 'array',
        xml: {
          wrapped: true,
        },
        items: {
          xml: {
            name: 'tag',
          },
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              format: 'int64',
            },
            name: {
              type: 'string',
            },
          },
        },
      },
      status: {
        type: 'string',
        description: 'pet status in the store',
        enum: ['available', 'pending', 'sold'],
      },
    },
    xml: {
      name: 'Pet',
    },
  },
} as const;

export const FIND_PETS_BY_TAGS_RESPONSE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    required: ['name', 'photoUrls'],
    properties: {
      id: {
        type: 'integer',
        format: 'int64',
      },
      category: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            format: 'int64',
          },
          name: {
            type: 'string',
          },
        },
        xml: {
          name: 'Category',
        },
      },
      name: {
        type: 'string',
        example: 'doggie',
      },
      photoUrls: {
        type: 'array',
        xml: {
          wrapped: true,
        },
        items: {
          type: 'string',
          xml: {
            name: 'photoUrl',
          },
        },
      },
      tags: {
        type: 'array',
        xml: {
          wrapped: true,
        },
        items: {
          xml: {
            name: 'tag',
          },
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              format: 'int64',
            },
            name: {
              type: 'string',
            },
          },
        },
      },
      status: {
        type: 'string',
        description: 'pet status in the store',
        enum: ['available', 'pending', 'sold'],
      },
    },
    xml: {
      name: 'Pet',
    },
  },
} as const;

export const GET_PET_BY_ID_RESPONSE_SCHEMA = {
  type: 'object',
  required: ['name', 'photoUrls'],
  properties: {
    id: {
      type: 'integer',
      format: 'int64',
    },
    category: {
      type: 'object',
      properties: {
        id: {
          type: 'integer',
          format: 'int64',
        },
        name: {
          type: 'string',
        },
      },
      xml: {
        name: 'Category',
      },
    },
    name: {
      type: 'string',
      example: 'doggie',
    },
    photoUrls: {
      type: 'array',
      xml: {
        wrapped: true,
      },
      items: {
        type: 'string',
        xml: {
          name: 'photoUrl',
        },
      },
    },
    tags: {
      type: 'array',
      xml: {
        wrapped: true,
      },
      items: {
        xml: {
          name: 'tag',
        },
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            format: 'int64',
          },
          name: {
            type: 'string',
          },
        },
      },
    },
    status: {
      type: 'string',
      description: 'pet status in the store',
      enum: ['available', 'pending', 'sold'],
    },
  },
  xml: {
    name: 'Pet',
  },
} as const;

export interface UploadFileResponse {
  code?: number;
  type?: string;
  message?: string;
}

export interface AddPetRequest {
  id?: number;
  category?: Record<string, unknown>;
  name: string;
  photoUrls: string[];
  tags?: Record<string, unknown>[];
  status?: string;
}

export interface UpdatePetRequest {
  id?: number;
  category?: Record<string, unknown>;
  name: string;
  photoUrls: string[];
  tags?: Record<string, unknown>[];
  status?: string;
}

export interface FindPetsByStatusResponse {}

export interface FindPetsByTagsResponse {}

export interface GetPetByIdResponse {
  id?: number;
  category?: Record<string, unknown>;
  name: string;
  photoUrls: string[];
  tags?: Record<string, unknown>[];
  status?: string;
}

export class PetService {
  constructor(private readonly client: RestClient) {}

  async uploadFile(petId: string) {
    const req = new RestRequestBuilder()
      .post(`${config.apiUrl}${PET_ENDPOINT}/${petId}/uploadImage`)
      .build();
    return this.client.send(req);
  }

  async addPet(body: AddPetRequest) {
    const req = new RestRequestBuilder().post(`${config.apiUrl}${PET_ENDPOINT}`).json(body).build();
    return this.client.send(req);
  }

  async updatePet(body: UpdatePetRequest) {
    const req = new RestRequestBuilder().put(`${config.apiUrl}${PET_ENDPOINT}`).json(body).build();
    return this.client.send(req);
  }

  async findPetsByStatus(status: string) {
    const req = new RestRequestBuilder()
      .get(`${config.apiUrl}${PET_FINDBYSTATUS_ENDPOINT}`)
      .query('status', status)
      .build();
    return this.client.send(req);
  }

  async findPetsByTags(tags: string) {
    const req = new RestRequestBuilder()
      .get(`${config.apiUrl}${PET_FINDBYTAGS_ENDPOINT}`)
      .query('tags', tags)
      .build();
    return this.client.send(req);
  }

  async getPetById(petId: string) {
    const req = new RestRequestBuilder().get(`${config.apiUrl}${PET_ENDPOINT}/${petId}`).build();
    return this.client.send(req);
  }

  async updatePetWithForm(petId: string) {
    const req = new RestRequestBuilder().post(`${config.apiUrl}${PET_ENDPOINT}/${petId}`).build();
    return this.client.send(req);
  }

  async deletePet(petId: string) {
    const req = new RestRequestBuilder().delete(`${config.apiUrl}${PET_ENDPOINT}/${petId}`).build();
    return this.client.send(req);
  }
}
