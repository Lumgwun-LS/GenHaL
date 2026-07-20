import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

type Tone = 'success' | 'warning' | 'destructive' | 'muted' | 'primary';

const TONE_BY_STATUS: Record<string, Tone> = {
  // Orders
  pending: 'warning',
  processing: 'primary',
  completed: 'success',
  delivered: 'success',
  cancelled: 'destructive',
  refunded: 'destructive',
  // Payments
  paid: 'success',
  failed: 'destructive',
  // Products
  active: 'success',
  draft: 'muted',
  archived: 'muted',
  out_of_stock: 'destructive',
  // Vendor / verification
  approved: 'success',
  suspended: 'destructive',
  // Social posts
  pending_review: 'warning',
  scheduled: 'primary',
  published: 'success',
  // publication per-platform
  publishing: 'primary',
  skipped: 'muted',
};

function humanize(value: string): string {
  return value
    .split(/[_-]/g)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function StatusBadge({ status }: { status: string }) {
  const colors = useColors();
  const tone = TONE_BY_STATUS[status.toLowerCase()] ?? 'muted';

  const toneColors: Record<Tone, { bg: string; fg: string }> = {
    success: { bg: colors.success + '1f', fg: colors.success },
    warning: { bg: colors.warning + '1f', fg: colors.warning },
    destructive: { bg: colors.destructive + '1f', fg: colors.destructive },
    primary: { bg: colors.primary + '1f', fg: colors.primary },
    muted: { bg: colors.muted, fg: colors.mutedForeground },
  };

  const { bg, fg } = toneColors[tone];

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{humanize(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
});
