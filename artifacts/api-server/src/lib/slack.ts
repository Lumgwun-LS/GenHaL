/**
 * Lightweight Slack Web API helper.
 * Uses SLACK_LIVE_API_KEY (Bot Token) and SLACK_ALERT_CHANNEL (defaults to #webhook-alerts).
 */

const SLACK_API = "https://slack.com/api/chat.postMessage";

export async function sendSlackAlert(message: string): Promise<void> {
  const token = process.env.SLACK_LIVE_API_KEY;
  if (!token) {
    console.warn("[slack] SLACK_LIVE_API_KEY not set — alert not sent:", message);
    return;
  }

  const channel = process.env.SLACK_ALERT_CHANNEL ?? "#webhook-alerts";

  try {
    const res = await fetch(SLACK_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channel, text: message }),
    });

    const body = (await res.json()) as { ok: boolean; error?: string };
    if (!body.ok) {
      console.error("[slack] chat.postMessage failed:", body.error);
    }
  } catch (err) {
    console.error("[slack] Failed to send alert:", err);
  }
}
