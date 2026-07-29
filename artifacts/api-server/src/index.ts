import app from "./app";
import { logger } from "./lib/logger";
import { startBirthdayScheduler } from "./lib/birthday-scheduler";
import { startWebhookBufferDrainer } from "./lib/webhook-buffer";
import { startVoiceCampaignScheduler } from "./lib/voice-campaign-scheduler";
import { startPendingReminderScheduler } from "./lib/pending-reminders";
import { startGatewayHealthScheduler } from "./lib/gateway-health-scheduler";
import { startSubscriptionSyncScheduler } from "./lib/subscription-sync-scheduler";
import { startPostScheduler } from "./lib/post-scheduler";
import { startVideoPublishFinalizer } from "./lib/video-publish-finalizer";
import { startPostReminderScheduler } from "./lib/post-reminders";
import { startVoiceBackfillScheduler } from "./lib/voice-backfill";
import { startSocialAccountHealthScheduler } from "./lib/social-account-health-scheduler";
import { startTokenRefreshScheduler } from "./lib/token-refresh-scheduler";
import { startMediaCleanupScheduler } from "./lib/media-cleanup";
import { startRecurringExpenseScheduler } from "./lib/recurring-expenses";
import { startVoidErrorCheckScheduler } from "./lib/void-error-check-scheduler";
import { startTrialReminderScheduler } from "./lib/trial-reminder-scheduler";
import { startBillingThresholdScheduler } from "./lib/billing-threshold-scheduler";
import { startOrderExpiryScheduler } from "./lib/order-expiry-scheduler";
import { startWebhookEventsCleanup } from "./lib/webhook-events-cleanup";
import { runSchemaDriftGuard } from "./lib/schema-guard";
import { startStockAlertScheduler } from "./lib/stock-alert-scheduler";
import { startOverdueInvoiceScheduler } from "./lib/overdue-invoice-scheduler";
import { startFeatureTrialExpiryScheduler } from "./lib/feature-trial-expiry-scheduler";
import { startStoreUploadTrialScheduler } from "./lib/store-upload-trial-scheduler";
import { initTrustedVendorsCache } from "./lib/trusted-vendors-cache";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  runSchemaDriftGuard().catch(() => {});
  startBirthdayScheduler();
  startWebhookBufferDrainer();
  startVoiceCampaignScheduler();
  startPendingReminderScheduler();
  startGatewayHealthScheduler();
  startSubscriptionSyncScheduler();
  startPostScheduler();
  startVideoPublishFinalizer();
  startPostReminderScheduler();
  startVoiceBackfillScheduler();
  startSocialAccountHealthScheduler();
  startTokenRefreshScheduler();
  startMediaCleanupScheduler();
  startRecurringExpenseScheduler();
  startVoidErrorCheckScheduler();
  startTrialReminderScheduler();
  startBillingThresholdScheduler();
  startOrderExpiryScheduler();
  startWebhookEventsCleanup();
  startStockAlertScheduler();
  startOverdueInvoiceScheduler();
  startFeatureTrialExpiryScheduler();
  startStoreUploadTrialScheduler();
  void initTrustedVendorsCache();
});
