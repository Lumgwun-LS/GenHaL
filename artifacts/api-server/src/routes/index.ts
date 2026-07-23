import { Router, type IRouter } from "express";
import healthRouter from "./health";
import vendorsRouter from "./vendors";
import socialAccountsRouter from "./social-accounts";
import socialOauthRouter from "./social-oauth";
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
import adminBillingSyncRouter from "./admin-billing-sync";
import adminSocialHealthRouter from "./admin-social-health";
import adminJobRunStatusRouter from "./admin-job-run-status";
import adminVoidErrorsRouter from "./admin-void-errors";
import adminInfrastructureBillingRouter from "./admin-infrastructure-billing";
import adminBillingEnforcementRouter from "./admin-billing-enforcement";
import salesRouter from "./sales";
import expensesRouter from "./expenses";
import investmentsRouter from "./investments";
import branchesRouter from "./branches";
import workersRouter from "./workers";
import storeRouter from "./store";
import storeAiLaunchRouter from "./store-ai-launch";
import notificationsRouter from "./notifications";
import accountDeletionRouter from "./account-deletion";
import voiceCampaignsRouter from "./voice-campaigns";
import subscriptionUpgradeRouter from "./subscription-upgrade";
import siteContentPublicRouter from "./site-content-public";
import analyticsPublicRouter from "./analytics-public";
import publicVendorsRouter from "./public-vendors";
import publicPostLinksRouter from "./public-post-links";
import voiceStatusCallbackRouter from "./voice-status-callback";
import voiceTtsAudioRouter from "./voice-tts-audio";
import mediaRouter from "./media";
import vendorAddonsRouter from "./vendor-addons";
import adsRouter from "./ads";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

// Health check — public
router.use(healthRouter);

// Site content (marketing copy, footer, etc.) — public read, no auth needed
router.use(siteContentPublicRouter);

// Public vendor storefronts (brand themes + safe vendor fields) — no auth needed
router.use(publicVendorsRouter);

// Public "shop this post" links — no auth needed
router.use(publicPostLinksRouter);

// Payment webhooks — public (signature-verified internally), before auth
router.use(paymentsWebhooksRouter);

// Twilio call status callbacks — public, before auth
router.use(voiceStatusCallbackRouter);

// ElevenLabs-generated call audio — public, Twilio fetches this mid-call
router.use(voiceTtsAudioRouter);

// AI-generated post media — public, Instagram/other platforms fetch this server-to-server
router.use(mediaRouter);

// External / Awajimaa bridge — has its own auth (API key + JWT), no Clerk required
router.use("/external", externalRouter);

// Awajimaa App Store — auth handled per-route inside storeRouter (public browse + auth-gated portal)
router.use("/store", storeRouter);

// AI App Launcher — requires developer auth per-route, mounts inside /store namespace
router.use("/store/ai-launch", storeAiLaunchRouter);

// Visitor pageview beacon — public, no auth needed
router.use(analyticsPublicRouter);

// All internal business routes require an authenticated Clerk session
router.use(requireAuth);

router.use(vendorsRouter);
router.use(socialAccountsRouter);
router.use(socialOauthRouter);
router.use(postsRouter);
router.use(aiRouter);
router.use(productsRouter);
router.use(inventoryRouter);
router.use(ordersRouter);
router.use(leadsRouter);
router.use(emailCampaignsRouter);
router.use(smsCampaignsRouter);
router.use(analyticsRouter);
router.use(branchesRouter);
router.use(workersRouter);
router.use(apiKeysRouter);
router.use(paymentsRouter);
router.use(vendorPaymentCredentialsRouter);
router.use(notificationsRouter);
router.use(accountDeletionRouter);
router.use(voiceCampaignsRouter);
router.use(subscriptionUpgradeRouter);
router.use(vendorAddonsRouter);
router.use(adsRouter);
router.use(adminRouter);
router.use(adminAnalyticsRouter);
router.use(adminPaymentGatewaysRouter);
router.use(adminBillingSyncRouter);
router.use(adminSocialHealthRouter);
router.use(adminJobRunStatusRouter);
router.use(adminVoidErrorsRouter);
router.use(adminInfrastructureBillingRouter);
router.use(adminBillingEnforcementRouter);
router.use(salesRouter);
router.use(expensesRouter);
router.use(investmentsRouter);

export default router;
