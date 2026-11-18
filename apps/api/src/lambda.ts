import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { ApiRequest, ApiResponse } from "./http.js";

export type Api = (req: ApiRequest) => Promise<ApiResponse>;

function parseCookies(list: string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of list ?? []) {
    const index = entry.indexOf("=");
    if (index > 0) out[entry.slice(0, index).trim()] = entry.slice(index + 1).trim();
  }
  return out;
}

function parseBody(event: APIGatewayProxyEventV2): { ok: true; value: unknown } | { ok: false } {
  if (!event.body) return { ok: true, value: undefined };
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

const jsonResult = (statusCode: number, body: unknown, cookies?: string[]): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
  ...(cookies && cookies.length > 0 ? { cookies } : {}),
});

export function createLambdaHandler(getApi: () => Promise<Api>) {
  return async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
    const body = parseBody(event);
    if (!body.ok) return jsonResult(400, { error: "invalid_json" });

    const req: ApiRequest = {
      method: event.requestContext.http.method,
      path: event.rawPath,
      query: event.queryStringParameters ?? {},
      headers: event.headers ?? {},
      cookies: parseCookies(event.cookies),
      body: body.value,
    };
    try {
      const res = await (await getApi())(req);
      return jsonResult(res.status, res.body, res.cookies);
    } catch (err) {
      console.error(err);
      return jsonResult(500, { error: "internal_error" });
    }
  };
}
