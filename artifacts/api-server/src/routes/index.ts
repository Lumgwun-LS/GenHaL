import { Router, type IRouter } from "express";
import healthRouter from "./health";
import vendorsRouter from "./vendors";
import socialAccountsRouter from "./social-accounts";
import postsRouter from "./posts";
import aiRouter from "./ai";
import productsRouter from "./products";
import inventoryRouter from "./inventory";
import ordersRouter from "./orders";
import leadsRouter from "./leads";
import emailCampaignsRouter from "./email-campaigns";
import smsCampaignsRouter from "./sms-campaigns";
import analyticsRouter from "./analytics";
import apiKeysRouter from "./api-keys";
import externalRouter from "./external/index";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

// Health check — public
router.use(healthRouter);

// External / Awajimaa bridge — has its own auth (API key + JWT), no Clerk required
router.use("/external", externalRouter);

// All internal business routes require an authenticated Clerk session
router.use(requireAuth);

router.use(vendorsRouter);
router.use(socialAccountsRouter);
router.use(postsRouter);
router.use(aiRouter);
router.use(productsRouter);
router.use(inventoryRouter);
router.use(ordersRouter);
router.use(leadsRouter);
router.use(emailCampaignsRouter);
router.use(smsCampaignsRouter);
router.use(analyticsRouter);
router.use(apiKeysRouter);

export default router;
