import { Router, json } from "express";
import type { VtxRequest } from "@bytenew/vortex-shared";
import { VtxErrorCode } from "@bytenew/vortex-shared";
import type { MessageRouter } from "./message-router.js";

export function createHttpRoutes(router: MessageRouter): Router {
  const app = Router();
  app.use(json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  app.post("/api/:namespace/:method", async (req, res) => {
    const action = `${req.params.namespace}.${req.params.method}`;
    const vtxReq: VtxRequest = {
      action,
      params: req.body,
      id: `http-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tabId: req.body?.tabId,
    };

    const resp = await router.routeToExtensionSync(vtxReq);
    const statusCode =
      !resp.error ? 200 :
      resp.error.code === VtxErrorCode.EXTENSION_NOT_CONNECTED ? 503 :
      resp.error.code === VtxErrorCode.TIMEOUT ? 504 :
      resp.error.code === VtxErrorCode.INVALID_PARAMS ? 400 :
      resp.error.code === VtxErrorCode.UNKNOWN_ACTION ? 404 : 500;
    res.status(statusCode).json(resp);
  });

  app.get("/api/:namespace/:method", async (req, res) => {
    const action = `${req.params.namespace}.${req.params.method}`;
    const vtxReq: VtxRequest = {
      action,
      params: req.query as Record<string, unknown>,
      id: `http-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tabId: req.query.tabId ? Number(req.query.tabId) : undefined,
    };

    const resp = await router.routeToExtensionSync(vtxReq);
    const statusCode = resp.error ? 500 : 200;
    res.status(statusCode).json(resp);
  });

  return app;
}
