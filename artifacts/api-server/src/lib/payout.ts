/**
 * Payout dispatcher — initiates bank transfers via Paystack, Interswitch, or Squad.
 *
 * Flow:
 *  1. Admin approves a payout in the admin panel.
 *  2. POST /admin/payouts/:id/approve calls initiatePayout().
 *  3. initiatePayout() sends the transfer to the provider and returns a providerReference.
 *  4. The caller sets payout.status = "processing" and deducts pendingNgnPayout from the wallet.
 *  5. On Paystack transfer.success/transfer.failed webhook, status is finalised.
 *
 * Squad and Interswitch disbursements are fire-and-forget (no async webhook) — they
 * move straight to "completed" on success. Paystack uses the async webhook path.
 */
import { resolveGatewayField } from "./platform-gateways";
import { resolveSquadKey, resolveInterswitchCreds } from "./vendor-keys";
import { squadInitiateTransfer } from "./squad";
import { interswitchSendMoney } from "./interswitch";

const PAYSTACK_BASE = "https://api.paystack.co";

export interface PayoutRecipient {
  bankCode:      string;
  accountNumber: string;
  accountName:   string;
  /** Paystack recipient code if previously created (skips re-creation). */
  paystackRecipientCode?: string | null;
}

export interface PayoutResult {
  providerReference: string;
  /** "processing" for Paystack (async webhook), "completed" for Squad/Interswitch. */
  initialStatus: "processing" | "completed";
  /** Updated recipient code if Paystack created one. */
  paystackRecipientCode?: string;
}

// ── Paystack ──────────────────────────────────────────────────────────────────

async function paystackPayout(
  amountNgn: number,
  recipient: PayoutRecipient,
  reference: string,
): Promise<PayoutResult> {
  const secretKey = await resolveGatewayField("paystack", "secretKey");
  if (!secretKey) throw Object.assign(new Error("Paystack is not configured."), { statusCode: 503 });

  // Create or reuse transfer recipient
  let recipientCode = recipient.paystackRecipientCode ?? null;
  if (!recipientCode) {
    const rcRes = await fetch(`${PAYSTACK_BASE}/transferrecipient`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "nuban",
        name: recipient.accountName,
        account_number: recipient.accountNumber,
        bank_code: recipient.bankCode,
        currency: "NGN",
      }),
    });
    const rcData = (await rcRes.json()) as { status: boolean; message: string; data?: { recipient_code: string } };
    if (!rcData.status || !rcData.data?.recipient_code) {
      throw new Error(`Paystack: failed to create transfer recipient — ${rcData.message}`);
    }
    recipientCode = rcData.data.recipient_code;
  }

  // Initiate transfer (amount in kobo)
  const transferRes = await fetch(`${PAYSTACK_BASE}/transfer`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "balance",
      amount: Math.round(amountNgn * 100),
      recipient: recipientCode,
      reason: "Awa Biz Suite payout",
      reference,
    }),
  });
  const transferData = (await transferRes.json()) as { status: boolean; message: string; data?: { transfer_code: string } };
  if (!transferData.status || !transferData.data?.transfer_code) {
    throw new Error(`Paystack: transfer failed — ${transferData.message}`);
  }

  return {
    providerReference: transferData.data.transfer_code,
    initialStatus: "processing", // finalised by transfer.success/failed webhook
    paystackRecipientCode: recipientCode,
  };
}

// ── Squad ─────────────────────────────────────────────────────────────────────

async function squadPayout(
  amountNgn: number,
  recipient: PayoutRecipient,
  reference: string,
): Promise<PayoutResult> {
  const secretKey = await resolveSquadKey();
  const result = await squadInitiateTransfer(secretKey, {
    amount: amountNgn,
    bankCode: recipient.bankCode,
    accountNumber: recipient.accountNumber,
    accountName: recipient.accountName,
    remark: "Awa Biz Suite payout",
    transactionRef: reference,
  });
  const ref = (result.data as { transaction_reference?: string })?.transaction_reference ?? reference;
  return { providerReference: ref, initialStatus: "completed" };
}

// ── Interswitch ───────────────────────────────────────────────────────────────

async function interswitchPayout(
  amountNgn: number,
  recipient: PayoutRecipient,
  reference: string,
): Promise<PayoutResult> {
  const creds = await resolveInterswitchCreds();
  const result = await interswitchSendMoney(creds, {
    amount:             Math.round(amountNgn * 100), // kobo
    requestRef:         reference,
    beneficiaryAccount: recipient.accountNumber,
    beneficiaryBankCode: recipient.bankCode,
    beneficiaryName:    recipient.accountName,
    senderName:         "Awa Biz Suite",
    narration:          "Awa Biz Suite payout",
  });
  const ref = (result as { transactionRef?: string })?.transactionRef ?? reference;
  return { providerReference: ref, initialStatus: "completed" };
}

// ── Public dispatcher ─────────────────────────────────────────────────────────

export async function initiatePayout(
  provider: "paystack" | "interswitch" | "squad",
  amountNgn: number,
  recipient: PayoutRecipient,
  /** Unique idempotency reference (payout ID works well). */
  reference: string,
): Promise<PayoutResult> {
  switch (provider) {
    case "paystack":    return paystackPayout(amountNgn, recipient, reference);
    case "squad":       return squadPayout(amountNgn, recipient, reference);
    case "interswitch": return interswitchPayout(amountNgn, recipient, reference);
    default:            throw new Error(`Unknown payout provider: ${provider}`);
  }
}
