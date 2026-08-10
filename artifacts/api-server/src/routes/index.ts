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
import purchaseOrdersRouter from "./purchase-orders";
import inventoryAnalyticsRouter from "./inventory-analytics";
import websiteRouter from "./website";
import dataAnalysisRouter from "./data-analysis";
import aiQuickCreateRouter from "./ai-quick-create";
import sitesRouter from "./sites";
import workersRouter from "./workers";
import storeRouter from "./store";
import invoicesRouter from "./invoices";
import invoicesPublicRouter from "./invoices-public";
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
import mediaLibraryRouter from "./media-library";
import realEstatePublicRouter from "./real-estate-public";
import realEstateRouter from "./real-estate";
import architectRouter from "./architect";
import developerRouter from "./developer";
import oauthRouter from "./oauth";
import platformPartnersRouter from "./platform-partners";
import connectedBusinessRouter from "./connected-business";
import embedRouter from "./embed";
import customerRouter from "./customer";
import vendorMessagesRouter from "./vendor-messages";
import vendorCustomersRouter from "./vendor-customers";
import vendorVirtualAccountsRouter from "./vendor-virtual-accounts";
import walletRouter, { walletPublicRouter } from "./wallet";
import analyticsVisitsRouter from "./analytics-visits";
import ratingsRouter from "./ratings";
import complaintsRouter from "./complaints";
import integrationErrorsRouter from "./integration-errors";
import personActivitiesRouter from "./person-activities";
import leadFormsRouter from "./lead-forms";
import utmLinksRouter from "./utm-links";
import crmTrackingRouter from "./crm-tracking";
import { requireAuth } from "../middlewares/requireAuth";
import mobileAppsRouter from "./mobile-apps";
import internalMobileAppRouter from "./internal-mobile-app";
import internalGrantTrialRouter from "./internal-grant-trial";
import tasksRouter from "./tasks";
import blogRouter from "./blog";
import genhalRouter from "./genhal";
import genhalCorpusRouter from "./genhal-corpus";
import genhalKingdomsRouter from "./genhal-kingdoms";
import genhalVaultRouter from "./genhal-vault";
import genhalMembersRouter from "./genhal-members";
import genhalSubscriptionsRouter from "./genhal-subscriptions";
import genhalSecretAccountsRouter from "./genhal-secret-accounts";
import genhalClaimsRouter from "./genhal-claims";
import genhalSuccessionRouter from "./genhal-succession";
import genhalVaultPublicRouter from "./genhal-vault-public";
import genhalWillsRouter from "./genhal-wills";
import aiGatewayRouter from "./ai-gateway";
import publicBlogRouter from "./public-blog";
import supportPublicRouter from "./support-public";
import supportRouter from "./support";
import emailTrackingRouter from "./email-tracking";
import productMediaRouter from "./product-media";
import orderFulfillmentRouter from "./order-fulfillment";
import ssoRouter from "./sso";

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

// OAuth 2.0 server — mostly public (token, revoke, well-known); /oauth/authorize verifies Clerk internally
router.use(oauthRouter);

// Public invoice pages — no auth required, scoped by shareToken
router.use(invoicesPublicRouter);

// Public site pages — no auth required
router.use(sitesRouter);

// Public real-estate: listings page, inquiry form, view-count increment
router.use(realEstatePublicRouter);

// Public: Platform Partner doc portals (/docs/:slug) + Git push webhooks (no auth)
router.use(platformPartnersRouter);

// Public: Embed widget JS + service manifest (key-based auth, no Clerk)
router.use(embedRouter);

// Public: wallet exchange-rate — no auth needed
router.use(walletPublicRouter);

// Public: customer ratings + complaints (no auth required to submit)
router.use(ratingsRouter);
router.use(complaintsRouter);

// Public: CRM tracking (website pixel, form submit, UTM redirect) — no auth
router.use(crmTrackingRouter);

// Internal callbacks from GitHub Actions (APK upload + build-fail report) — secret-verified, no Clerk
router.use(internalMobileAppRouter);

// TEMPORARY: grant a feature trial without Clerk auth (SESSION_SECRET protected) — remove after use
router.use(internalGrantTrialRouter);

// Public blog — no auth required (visitor-facing pages)
router.use(publicBlogRouter);

// Public support ticket form — no auth required (customer-facing)
router.use(supportPublicRouter);

// Public product detail pages — no auth required
router.use(productMediaRouter);

// Public order receipt confirmation — no auth required (token-gated)
router.use(orderFulfillmentRouter);

// Email open-tracking pixel — public, no auth
router.use(emailTrackingRouter);

// Awajimaa Unified SSO bridge — public (check-email + exchange); admin (backfill-notify)
router.use("/sso", ssoRouter);

// All internal business routes require an authenticated Clerk session
router.use(requireAuth);

// Platform Partner authenticated routes (marketplace, admin CRUD, analytics)
// mounted again after requireAuth — the public-only routes above return before next()
router.use(platformPartnersRouter);
router.use(connectedBusinessRouter);

router.use(vendorsRouter);
router.use(socialAccountsRouter);
router.use(socialOauthRouter);
router.use(postsRouter);
router.use(aiRouter);
router.use(productsRouter);
router.use(productMediaRouter);
router.use(inventoryRouter);
router.use(ordersRouter);
router.use(orderFulfillmentRouter);
router.use(leadsRouter);
router.use(personActivitiesRouter);
router.use(leadFormsRouter);
router.use(utmLinksRouter);
router.use(emailCampaignsRouter);
router.use(smsCampaignsRouter);
router.use(analyticsRouter);
router.use(analyticsVisitsRouter);
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
router.use(mediaLibraryRouter);
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
router.use(purchaseOrdersRouter);
router.use(inventoryAnalyticsRouter);
router.use(websiteRouter);
router.use(dataAnalysisRouter);
router.use(aiQuickCreateRouter);
router.use(invoicesRouter);
router.use(realEstateRouter);
router.use(architectRouter);
router.use(developerRouter);
router.use(customerRouter);
router.use(vendorMessagesRouter);
router.use(vendorCustomersRouter);
router.use(vendorVirtualAccountsRouter);
router.use(walletRouter);
// Admin rating/complaint management (auth-gated inside the router)
router.use(ratingsRouter);
router.use(complaintsRouter);
router.use(integrationErrorsRouter);
router.use(mobileAppsRouter);
router.use(tasksRouter);
  router.use(blogRouter);
router.use(supportRouter);
router.use(genhalRouter);
router.use(genhalCorpusRouter);
router.use(genhalKingdomsRouter);
router.use(genhalVaultRouter);
router.use(genhalMembersRouter);
router.use(genhalSubscriptionsRouter);
router.use(genhalSecretAccountsRouter);
router.use(genhalClaimsRouter);
router.use(genhalSuccessionRouter);
router.use(genhalVaultPublicRouter);
router.use(genhalWillsRouter);

// AI Gateway — key-based auth (X-Gateway-Key), callable by Spring Boot + Python workers
router.use(aiGatewayRouter);

export default router;
