import app from "./app";
import { logger } from "./lib/logger";
import { startBirthdayScheduler } from "./lib/birthday-scheduler";
import { startWebhookBufferDrainer } from "./lib/webhook-buffer";
import { startVoiceCampaignScheduler } from "./lib/voice-campaign-scheduler";
import { startPendingReminderScheduler } from "./lib/pending-reminders";
import { startGatewayHealthScheduler } from "./lib/gateway-health-scheduler";
import { startSubscriptionSyncScheduler } from "./lib/subscription-sync-scheduler";
import { startPostScheduler } from "./lib/post-scheduler";
import { startVoiceBackfillScheduler } from "./lib/voice-backfill";
import { runSchemaDriftGuard } from "./lib/schema-guard";

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
  startVoiceBackfillScheduler();
});
