import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  try {
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json(data);
  } catch (e) {
    res.status(500).json({ status: "error", error: String(e) });
  }
});

export default router;
