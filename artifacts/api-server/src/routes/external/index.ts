import { Router } from "express";
import authRouter from "./auth";
import profileRouter from "./profile";
import featuresRouter from "./features";
import paymentsRouter from "./payments";
import pushRouter from "./push";
import voiceCampaignsRouter from "./voice-campaigns";
import adminVoidErrorsRouter from "./admin-void-errors";

const router = Router();

// Auth is public (validates API key, not user JWT)
router.use("/auth", authRouter);

// Profile and feature routes require a valid external JWT
router.use(profileRouter);
router.use(featuresRouter);
router.use(paymentsRouter);
router.use(pushRouter);
router.use(voiceCampaignsRouter);
router.use(adminVoidErrorsRouter);

export default router;
