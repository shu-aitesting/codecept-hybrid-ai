import { RestMethod } from './RestMethod';
import { AuthScheme, RestRequest } from './RestRequest';
import { RestHeaders, RestQueryParams } from './types';

export class CurlConverter {
  static fromCurl(curl: string): RestRequest {
    const normalized = curl.replace(/\\\n/g, ' ').trim();

    // Extract raw URL — prefer a quoted http(s) URL, fall back to bare http(s) URL
    const rawUrl =
      /["'](https?:\/\/[^"']+)["']/.exec(normalized)?.[1] ??
      /(https?:\/\/\S+)/.exec(normalized)?.[1] ??
      '';

    // Split path and query string
    const qIdx = rawUrl.indexOf('?');
    const basePath = qIdx === -1 ? rawUrl : rawUrl.slice(0, qIdx);
    const queryString = qIdx === -1 ? '' : rawUrl.slice(qIdx + 1);

    // Parse query string into params map
    const params: RestQueryParams = {};
    if (queryString) {
      for (const pair of queryString.split('&')) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx === -1) {
          params[decodeURIComponent(pair)] = '';
        } else {
          const k = decodeURIComponent(pair.slice(0, eqIdx));
          const v = decodeURIComponent(pair.slice(eqIdx + 1));
          params[k] = v;
        }
      }
    }

    const methodMatch = normalized.match(/-X\s+(\w+)/);
    const method = (methodMatch?.[1]?.toUpperCase() as RestMethod) ?? RestMethod.GET;

    const headers: RestHeaders = {};
    const headerRegex = /-H\s+['"]([^:]+):\s*([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = headerRegex.exec(normalized)) !== null) {
      headers[m[1].trim().toLowerCase()] = m[2].trim();
    }

    const bodyMatch =
      normalized.match(/(?:-d|--data|--data-raw)\s+'([^']+)'/) ??
      normalized.match(/(?:-d|--data|--data-raw)\s+"([^"]+)"/);
    let body: unknown;
    if (bodyMatch) {
      try {
        body = JSON.parse(bodyMatch[1]);
      } catch {
        body = bodyMatch[1];
      }
    }

    const authScheme = CurlConverter._detectAuthScheme(headers);

    return new RestRequest(basePath, method, headers, params, body, 30000, true, authScheme);
  }

  static toCurl(req: RestRequest): string {
    return req.toCurl();
  }

  private static _detectAuthScheme(headers: RestHeaders): AuthScheme {
    const authHeader = headers['authorization'] ?? '';
    if (!authHeader) return null;
    const lower = authHeader.toLowerCase();
    if (lower.startsWith('bearer ')) return 'bearer';
    if (lower.startsWith('basic ')) return 'basic';
    // API key patterns: "ApiKey ...", "Token ...", or bare non-standard values
    return 'apikey';
  }
}
