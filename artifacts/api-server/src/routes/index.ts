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
import paymentsRouter from "./payments/index";
import paymentsWebhooksRouter from "./payments/webhooks";
import externalRouter from "./external/index";
import vendorPaymentCredentialsRouter from "./vendor-payment-credentials";
import adminRouter from "./admin";
import adminAnalyticsRouter from "./admin-analytics";
import adminPaymentGatewaysRouter from "./admin-payment-gateways";
import notificationsRouter from "./notifications";
import accountDeletionRouter from "./account-deletion";
import voiceCampaignsRouter from "./voice-campaigns";
import subscriptionUpgradeRouter from "./subscription-upgrade";
import siteContentPublicRouter from "./site-content-public";
import publicVendorsRouter from "./public-vendors";
import voiceStatusCallbackRouter from "./voice-status-callback";
import voiceTtsAudioRouter from "./voice-tts-audio";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

// Health check — public
router.use(healthRouter);

// Site content (marketing copy, footer, etc.) — public read, no auth needed
router.use(siteContentPublicRouter);

// Public vendor storefronts (brand themes + safe vendor fields) — no auth needed
router.use(publicVendorsRouter);

// Payment webhooks — public (signature-verified internally), before auth
router.use(paymentsWebhooksRouter);

// Twilio call status callbacks — public, before auth
router.use(voiceStatusCallbackRouter);

// ElevenLabs-generated call audio — public, Twilio fetches this mid-call
router.use(voiceTtsAudioRouter);

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
router.use(paymentsRouter);
router.use(vendorPaymentCredentialsRouter);
router.use(notificationsRouter);
router.use(accountDeletionRouter);
router.use(voiceCampaignsRouter);
router.use(subscriptionUpgradeRouter);
router.use(adminRouter);
router.use(adminAnalyticsRouter);
router.use(adminPaymentGatewaysRouter);

export default router;
