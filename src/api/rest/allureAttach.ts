import type { RestRequest } from './RestRequest';
import type { RestResponse } from './RestResponse';

/**
 * Attaches HTTP request and response details as JSON attachments to the active
 * Allure test via @codeceptjs/allure-legacy plugin. Silently no-ops when:
 *   - not running inside a CodeceptJS context (unit tests, scripts)
 *   - the allure plugin is disabled or unavailable
 */
export function tryAllureAttach(req: RestRequest, res: RestResponse<unknown>): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const { container } = require('codeceptjs') as { container: any };
    const allure = container.plugins?.('allure');
    if (!allure) return;

    const label = `${req.method} ${req.buildUrl()}`;

    const reqPayload = JSON.stringify(
      {
        method: req.method,
        url: req.buildUrl(),
        headers: req.headers,
        body: req.body ?? null,
        curl: req.toCurl(),
      },
      null,
      2,
    );

    const resPayload = JSON.stringify(
      {
        status: res.status,
        durationMs: res.durationMs,
        headers: res.headers,
        body: res.body,
      },
      null,
      2,
    );

    const attach: ((name: string, content: Buffer, mime: string) => void) | undefined =
      allure.addAttachment?.bind(allure) ?? allure.createAttachment?.bind(allure);

    if (typeof attach === 'function') {
      attach(`${label} — Request`, Buffer.from(reqPayload), 'application/json');
      attach(`${label} — Response (${res.status})`, Buffer.from(resPayload), 'application/json');
    }
  } catch {
    // Not in a CodeceptJS/Allure context — ignore silently
  }
}
