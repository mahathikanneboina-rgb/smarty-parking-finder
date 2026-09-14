import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error The migrated CommonJS Express app has no separate type declaration.
import parkingApi from "./parkingApi.cjs";

type ResponseData = {
  status: number;
  body: string;
};

let server: Server;
let baseUrl: string;

function request(path: string, options?: RequestInit): Promise<ResponseData> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = fetch(url, options);
    req
      .then(async response => {
        resolve({ status: response.status, body: await response.text() });
      })
      .catch(reject);
  });
}

beforeAll(async () => {
  server = createServer(parkingApi);
  await new Promise<void>(resolve => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose an address");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
});

describe("parking API", () => {
  it("returns all parking floors", async () => {
    const response = await request("/api/parking/slots");
    expect(response.status).toBe(200);
    const slots = JSON.parse(response.body);
    expect(Object.keys(slots)).toEqual(expect.arrayContaining(["ground", "first", "second"]));
  });

  it("rejects invalid manual slot statuses", async () => {
    const response = await request("/api/parking/slots/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ floor: "ground", slotId: 1, status: "broken" }),
    });
    expect(response.status).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/Invalid status/);
  });
});
