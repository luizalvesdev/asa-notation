import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { describe, expect, it, vi } from "vitest";
import { createLambdaHandler } from "../src/lambda.js";

function event(overrides: Partial<APIGatewayProxyEventV2> & { method?: string } = {}): APIGatewayProxyEventV2 {
  const { method = "GET", ...rest } = overrides;
  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: "/sync/head",
    rawQueryString: "",
    headers: {},
    isBase64Encoded: false,
    requestContext: { http: { method } },
    ...rest,
  } as unknown as APIGatewayProxyEventV2;
}

describe("createLambdaHandler", () => {
  it("maps the event to a request and the response to JSON", async () => {
    const router = vi.fn(async () => ({ status: 200, body: { seq: 7 } }));
    const handler = createLambdaHandler(async () => router);
    const res = await handler(
      event({
        rawPath: "/changes",
        queryStringParameters: { since: "3" },
        headers: { authorization: "Bearer asa_x" },
        cookies: ["asa_session=abc.def", "other=1=2"],
      }),
    );
    expect(router).toHaveBeenCalledWith({
      method: "GET",
      path: "/changes",
      query: { since: "3" },
      headers: { authorization: "Bearer asa_x" },
      cookies: { asa_session: "abc.def", other: "1=2" },
      body: undefined,
    });
    expect(res).toEqual({
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seq: 7 }),
    });
  });

  it("defaults query, headers and cookies", async () => {
    const router = vi.fn(async () => ({ status: 200, body: {} }));
    await createLambdaHandler(async () => router)(event({ headers: undefined }));
    expect(router).toHaveBeenCalledWith({
      method: "GET",
      path: "/sync/head",
      query: {},
      headers: {},
      cookies: {},
      body: undefined,
    });
  });

  it("parses JSON bodies, including base64 ones", async () => {
    const router = vi.fn(async () => ({ status: 200, body: {} }));
    const handler = createLambdaHandler(async () => router);
    await handler(event({ method: "POST", body: '{"a":1}' }));
    await handler(event({ method: "POST", body: Buffer.from('{"b":2}').toString("base64"), isBase64Encoded: true }));
    expect(router.mock.calls.map((c) => (c as unknown as [{ body: unknown }])[0].body)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("answers 400 to invalid JSON without calling the router", async () => {
    const router = vi.fn(async () => ({ status: 200, body: {} }));
    const res = await createLambdaHandler(async () => router)(event({ method: "POST", body: "{nope" }));
    expect(res).toMatchObject({ statusCode: 400, body: JSON.stringify({ error: "invalid_json" }) });
    expect(router).not.toHaveBeenCalled();
  });

  it("forwards Set-Cookie values through the cookies field", async () => {
    const router = vi.fn(async () => ({ status: 200, body: {}, cookies: ["a=1; Path=/", "b=2; Path=/"] }));
    const res = await createLambdaHandler(async () => router)(event());
    expect(res).toMatchObject({ cookies: ["a=1; Path=/", "b=2; Path=/"] });
  });

  it("returns 500 without leaking the error message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createLambdaHandler(async () => {
      throw new Error("postgres://secret@host/db");
    });
    const res = await handler(event());
    expect(res).toMatchObject({ statusCode: 500, body: JSON.stringify({ error: "internal_error" }) });
    spy.mockRestore();
  });
});
