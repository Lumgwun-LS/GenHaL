/**
 * Pure helpers for the BulkMessageDialog opt-out count computation.
 *
 * Extracted so the logic can be unit-tested without rendering the full React
 * component tree.
 */

export type OptOutVendor = {
  id: number;
  announcementEmailOptOut: boolean;
};

/**
 * Returns the vendors from `vendors` that will NOT receive an announcement
 * email because they opted out, given the current selection state.
 *
 * - When `allSelected` is true the entire vendor list is the audience, so
 *   every vendor with `announcementEmailOptOut=true` is counted.
 * - When `allSelected` is false only vendors whose id appears in
 *   `selectedIds` are in the audience, and we count opted-out ones among
 *   those.
 */
export function computeOptedOutVendors<T extends OptOutVendor>(
  vendors: T[],
  allSelected: boolean,
  selectedIds: number[],
): T[] {
  if (allSelected) {
    return vendors.filter((v) => v.announcementEmailOptOut);
  }
  return vendors.filter((v) => selectedIds.includes(v.id) && v.announcementEmailOptOut);
}

/**
 * Returns the grammatically-correct banner body text for the opt-out
 * warning shown inside BulkMessageDialog.
 *
 * @param optOutCount   Number of vendors that won't get an email.
 * @param recipientCount Total number of vendors the message is addressed to.
 */
export function formatOptOutBannerText(optOutCount: number, recipientCount: number): string {
  const vendorWord = recipientCount === 1 ? "vendor" : "vendors";
  const hasHave = optOutCount === 1 ? "has" : "have";
  return `${optOutCount} of ${recipientCount} ${vendorWord} ${hasHave} opted out of announcement emails`;
}

/**
 * Returns the grammatically-correct description line inside the opt-out
 * popover that lists individual vendors.
 *
 * @param optOutCount Number of opted-out vendors shown in the popover.
 */
export function formatOptOutPopoverDescription(optOutCount: number): string {
  const subject = optOutCount === 1 ? "This vendor" : "These vendors";
  return `${subject} will still receive the in-app notification.`;
}
