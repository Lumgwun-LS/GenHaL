/**
 * Covers task #142: vendors must be able to preview/regenerate individual
 * AI video scene images before the costly final ffmpeg render+music pass
 * runs, and only that final render step may spend `aiVideos` quota.
 *
 * Exercises the three routes end-to-end (through the real Express router,
 * auth included) with the AI/ffmpeg/storage primitives mocked:
 *   - POST /ai/generate-video-scenes  (preview only, spends aiImages)
 *   - POST /ai/regenerate-video-scene (one scene only, spends aiImages)
 *   - POST /ai/render-video           (stitches confirmed images, spends aiVideos)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.ADMIN_USER_IDS = "";

const VENDOR_ID = 10;
const MOCK_VENDOR = { id: VENDOR_ID, clerkUserId: "user_vendor" };

let insertedGenerations: Array<Record<string, unknown>> = [];
let nextGenerationId = 1;

vi.mock("@workspace/db", () => ({
  db: {
    // resolveAuthedVendor selects `{ id: vendorsTable.id }`; the render-video
    // ownership check (resolveOwnedSceneImageUrls) selects
    // `{ result: aiGenerationsTable.result }` for this vendor's own image
    // generations — disambiguate on the requested field shape so both can
    // share this one mock.
    select: (fields?: Record<string, unknown>) => ({
      from: () => ({
        where: async () => {
          if (fields && "result" in fields) {
            return insertedGenerations
              .filter((g) => g.vendorId === VENDOR_ID && g.type === "image")
              .map((g) => ({ result: g.result }));
          }
          return [{ id: VENDOR_ID }];
        },
      }),
    }),
    insert: () => ({
      values: (rows: unknown) => ({
        returning: async () => {
          const list = Array.isArray(rows) ? rows : [rows];
          const created = list.map((r) => ({
            id: nextGenerationId++,
            vendorId: VENDOR_ID,
            createdAt: new Date(),
            ...(r as Record<string, unknown>),
          }));
          insertedGenerations.push(...created);
          return created;
        },
      }),
    }),
  },
  aiGenerationsTable: {},
  vendorsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => ({ and: args }),
  desc: (col: unknown) => ({ desc: col }),
}));

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: "user_vendor" }),
}));

// Quota bookkeeping isn't the point of this test (covered elsewhere); stub it
// down to "always allowed" and just record which resource/amount each route
// asked to consume/release so we can assert on *when* aiVideos vs aiImages
// quota is touched.
const consumeQuotaCalls: Array<{ resource: string; amount: number }> = [];
const releaseQuotaCalls: Array<{ resource: string; amount: number }> = [];
vi.mock("../../lib/usage", () => ({
  getVendorForUsage: async () => MOCK_VENDOR,
  consumeQuota: async (_vendor: unknown, resource: string, amount: number) => {
    consumeQuotaCalls.push({ resource, amount });
    return { allowed: true, periodStart: new Date("2026-07-01") };
  },
  releaseQuota: async (_vendorId: number, resource: string, amount: number) => {
    releaseQuotaCalls.push({ resource, amount });
  },
  quotaExceededMessage: () => "Quota exceeded",
}));

const generateImageBuffer = vi.fn(async (prompt: string) => Buffer.from(`img:${prompt}`));
vi.mock("@workspace/integrations-openai-ai-server/image", () => ({
  generateImageBuffer: (...args: Parameters<typeof generateImageBuffer>) => generateImageBuffer(...args),
}));
vi.mock("@workspace/integrations-openai-ai-server", () => ({ openai: {} }));
vi.mock("@workspace/integrations-gemini-ai", () => ({ ai: {} }));

let storedMediaCount = 0;
vi.mock("../../lib/generated-media-storage", () => ({
  storeGeneratedMedia: async () => {
    storedMediaCount += 1;
    return { publicUrl: `https://example.repl.co/api/media/generated-${storedMediaCount}` };
  },
  extractMediaObjectId: (url: string) => {
    const match = url.match(/\/api\/media\/([^/?]+)/);
    return match ? match[1] : null;
  },
}));

const generateVideoBuffer = vi.fn(async () => Buffer.from("video-bytes"));
vi.mock("../../lib/video-generation", () => ({
  generateVideoBuffer: (...args: unknown[]) => generateVideoBuffer(...(args as [])),
}));
vi.mock("../../lib/ai-music", () => ({ generateMusicBuffer: vi.fn() }));
vi.mock("../../lib/video-frames", () => ({ extractVideoFrames: vi.fn() }));
vi.mock("../../lib/objectStorage", () => ({ ObjectStorageService: class {} }));

function findHandler(router: any, path: string, method: "post"): (req: any, res: any) => Promise<void> {
  const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
  return layer.route.stack[0].handle;
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  return res;
}

describe("AI video scene preview / regenerate / render split", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertedGenerations = [];
    nextGenerationId = 1;
    storedMediaCount = 0;
    consumeQuotaCalls.length = 0;
    releaseQuotaCalls.length = 0;
  });

  it("generate-video-scenes creates one image per scene, spends only aiImages quota, and does not render", async () => {
    const mod = await import("../ai");
    const router = mod.default as any;
    const handler = findHandler(router, "/ai/generate-video-scenes", "post");

    const req = { body: { vendorId: VENDOR_ID, prompt: "New espresso blend", sceneCount: 3 } };
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.scenes).toHaveLength(3);
    expect(res.body.scenes.every((s: any) => s.type === "image" && s.status === "completed")).toBe(true);
    expect(generateImageBuffer).toHaveBeenCalledTimes(3);
    expect(generateVideoBuffer).not.toHaveBeenCalled();
    expect(consumeQuotaCalls).toEqual([{ resource: "aiImages", amount: 3 }]);
    expect(releaseQuotaCalls).toHaveLength(0);
  });

  it("regenerate-video-scene regenerates only the requested scene and spends one aiImages unit", async () => {
    const mod = await import("../ai");
    const router = mod.default as any;
    const handler = findHandler(router, "/ai/regenerate-video-scene", "post");

    const req = { body: { vendorId: VENDOR_ID, prompt: "Scene 2: latte art close-up" } };
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.type).toBe("image");
    expect(res.body.status).toBe("completed");
    expect(generateImageBuffer).toHaveBeenCalledTimes(1);
    expect(generateImageBuffer).toHaveBeenCalledWith("Scene 2: latte art close-up", "1536x1024", "high");
    expect(consumeQuotaCalls).toEqual([{ resource: "aiImages", amount: 1 }]);
  });

  it("render-video stitches the given confirmed scene URLs without regenerating any images, and spends only aiVideos quota", async () => {
    const sceneUrls = ["https://example.repl.co/api/media/scene-1", "https://example.repl.co/api/media/scene-2"];
    // These URLs must already belong to this vendor's own completed image
    // generations (see resolveOwnedSceneImageUrls) — seed them as if
    // generate-video-scenes had produced them.
    insertedGenerations.push(
      { id: nextGenerationId++, vendorId: VENDOR_ID, type: "image", status: "completed", result: sceneUrls[0], createdAt: new Date() },
      { id: nextGenerationId++, vendorId: VENDOR_ID, type: "image", status: "completed", result: sceneUrls[1], createdAt: new Date() },
    );
    global.fetch = vi.fn(async (url: string | URL) => {
      if (sceneUrls.includes(String(url))) {
        return new Response(Buffer.from(`bytes:${url}`), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    const mod = await import("../ai");
    const router = mod.default as any;
    const handler = findHandler(router, "/ai/render-video", "post");

    const req = {
      body: {
        vendorId: VENDOR_ID,
        prompt: "New espresso blend",
        sceneImageUrls: sceneUrls,
        captionText: "New espresso blend just dropped!",
        motionTemplate: "zoom-in",
        includeMusic: false,
      },
    };
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.type).toBe("video");
    expect(res.body.status).toBe("completed");
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(generateImageBuffer).not.toHaveBeenCalled();
    expect(generateVideoBuffer).toHaveBeenCalledTimes(1);
    expect(consumeQuotaCalls).toEqual([{ resource: "aiVideos", amount: 1 }]);
  });

  it("render-video releases aiVideos quota (not aiImages) if the stitch fails", async () => {
    const sceneUrl = "https://example.repl.co/api/media/scene-1";
    insertedGenerations.push({ id: nextGenerationId++, vendorId: VENDOR_ID, type: "image", status: "completed", result: sceneUrl, createdAt: new Date() });
    global.fetch = vi.fn(async () => new Response(Buffer.from("bytes"), { status: 200 })) as unknown as typeof fetch;
    generateVideoBuffer.mockRejectedValueOnce(new Error("ffmpeg exploded"));

    const mod = await import("../ai");
    const router = mod.default as any;
    const handler = findHandler(router, "/ai/render-video", "post");

    const req = {
      body: { vendorId: VENDOR_ID, prompt: "p", sceneImageUrls: [sceneUrl] },
    };
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(502);
    expect(res.body.status).toBe("failed");
    expect(releaseQuotaCalls).toEqual([{ resource: "aiVideos", amount: 1 }]);
  });

  it("render-video rejects a URL that isn't a recognized generated-media URL (SSRF guard) without spending quota or fetching it", async () => {
    global.fetch = vi.fn();

    const mod = await import("../ai");
    const router = mod.default as any;
    const handler = findHandler(router, "/ai/render-video", "post");

    const req = {
      body: { vendorId: VENDOR_ID, prompt: "p", sceneImageUrls: ["http://169.254.169.254/latest/meta-data/"] },
    };
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(consumeQuotaCalls).toHaveLength(0);
  });

  it("render-video rejects a real /api/media URL that belongs to a different vendor, without spending quota or fetching it", async () => {
    const otherVendorUrl = "https://example.repl.co/api/media/someone-elses-image";
    insertedGenerations.push({ id: nextGenerationId++, vendorId: 999, type: "image", status: "completed", result: otherVendorUrl, createdAt: new Date() });
    global.fetch = vi.fn();

    const mod = await import("../ai");
    const router = mod.default as any;
    const handler = findHandler(router, "/ai/render-video", "post");

    const req = {
      body: { vendorId: VENDOR_ID, prompt: "p", sceneImageUrls: [otherVendorUrl] },
    };
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(consumeQuotaCalls).toHaveLength(0);
  });
});
