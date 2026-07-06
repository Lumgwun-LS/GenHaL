import { Router } from "express";
import authRouter from "./auth";
import profileRouter from "./profile";
import featuresRouter from "./features";

const router = Router();

// Auth is public (validates API key, not user JWT)
router.use("/auth", authRouter);

// Profile and feature routes require a valid external JWT
router.use(profileRouter);
router.use(featuresRouter);

export default router;
