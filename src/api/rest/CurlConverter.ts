import { RestMethod } from './RestMethod';
import { RestRequest } from './RestRequest';
import { RestHeaders } from './types';

export class CurlConverter {
  static fromCurl(curl: string): RestRequest {
    const normalized = curl.replace(/\\\n/g, ' ').trim();

    const urlMatch = normalized.match(/curl\s+(?:[^'"]\S*|'[^']*'|"[^"]*")/);
    const rawUrl = urlMatch?.[0]?.replace(/^curl\s+/, '').replace(/^['"]|['"]$/g, '') ?? '';

    const methodMatch = normalized.match(/-X\s+(\w+)/);
    const method = (methodMatch?.[1]?.toUpperCase() as RestMethod) ?? RestMethod.GET;

    const headers: RestHeaders = {};
    const headerRegex = /-H\s+['"]([^:]+):\s*([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = headerRegex.exec(normalized)) !== null) {
      headers[m[1].trim()] = m[2].trim();
    }

    const bodyMatch = normalized.match(/(?:-d|--data|--data-raw)\s+'([^']+)'/) ??
      normalized.match(/(?:-d|--data|--data-raw)\s+"([^"]+)"/);
    let body: unknown;
    if (bodyMatch) {
      try {
        body = JSON.parse(bodyMatch[1]);
      } catch {
        body = bodyMatch[1];
      }
    }

    return new RestRequest(rawUrl, method, headers, {}, body);
  }

  static toCurl(req: RestRequest): string {
    return req.toCurl();
  }
}
