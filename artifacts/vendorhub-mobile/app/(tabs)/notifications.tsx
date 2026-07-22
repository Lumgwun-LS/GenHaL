import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListVendorNotificationsQueryKey,
  useListVendorNotifications,
  useMarkVendorNotificationRead,
  useMarkAllVendorNotificationsRead,
} from '@workspace/api-client-react';
import type { VendorNotification } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { LoadingView } from '@/components/LoadingView';
import { ErrorView } from '@/components/ErrorView';
import { EmptyState } from '@/components/EmptyState';
import { AnimatedListItem } from '@/components/AnimatedListItem';

// ─── helpers ────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type NotificationType = VendorNotification['type'];

function typeIcon(
  type: string,
  colors: ReturnType<typeof useColors>,
): { name: keyof typeof Feather.glyphMap; color: string } {
  switch (type as NotificationType) {
    case 'birthday':
      return { name: 'gift', color: '#FF7F50' };
    case 'tier_change':
      return { name: 'trending-up', color: colors.primary };
    case 'verification_change':
      return { name: 'shield', color: colors.primary };
    case 'voice_campaign':
      return { name: 'phone', color: '#FF7F50' };
    case 'social_reconnect':
      return { name: 'link-2', color: colors.destructive };
    case 'post_reminder':
      return { name: 'clock', color: '#FF7F50' };
    default:
      return { name: 'info', color: colors.mutedForeground };
  }
}

/** Navigate to the most relevant screen for a notification type. */
function navigateForType(type: string) {
  switch (type as NotificationType) {
    case 'post_reminder':
    case 'social_reconnect':
      router.push('/social/new');
      break;
    case 'voice_campaign':
      router.push('/voice-campaigns');
      break;
    case 'tier_change':
    case 'verification_change':
      router.push('/(tabs)/account');
      break;
    default:
      break;
  }
}

// ─── item ────────────────────────────────────────────────────────────────────

function NotificationItem({
  item,
  vendorId,
  onRead,
  index,
}: {
  item: VendorNotification;
  vendorId: number;
  onRead: (n: VendorNotification) => void;
  index: number;
}) {
  const colors = useColors();
  const isUnread = !item.readAt;
  const { name: iconName, color: iconColor } = typeIcon(item.type, colors);

  const handlePress = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    if (isUnread) onRead(item);
    navigateForType(item.type);
  };

  return (
    <AnimatedListItem index={index} baseDelay={40}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.item,
          {
            backgroundColor: isUnread
              ? colors.primary + '0D'
              : colors.background,
            borderBottomColor: colors.border,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        {/* icon bubble */}
        <View
          style={[
            styles.iconBubble,
            { backgroundColor: iconColor + '1A' },
          ]}
        >
          <Feather name={iconName} size={16} color={iconColor} />
        </View>

        {/* body */}
        <View style={styles.body}>
          {item.type === 'general' && item.adminDisplayName ? (
            <Text style={[styles.sender, { color: colors.mutedForeground }]}>
              From {item.adminDisplayName}
            </Text>
          ) : null}
          <Text
            style={[
              styles.message,
              {
                color: colors.foreground,
                fontFamily: isUnread ? 'Inter_600SemiBold' : 'Inter_400Regular',
              },
            ]}
          >
            {item.message}
          </Text>
          <Text style={[styles.timestamp, { color: colors.mutedForeground }]}>
            {formatRelativeTime(item.createdAt)}
          </Text>
        </View>

        {/* unread dot */}
        {isUnread && (
          <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
        )}
      </Pressable>
    </AnimatedListItem>
  );
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { vendor } = useAuth();
  const vendorId = vendor?.id;
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = useListVendorNotifications(
    vendorId as number,
    {
      query: {
        queryKey: getListVendorNotificationsQueryKey(vendorId as number),
        enabled: Boolean(vendorId),
        refetchInterval: 60_000,
      },
    },
  );

  const { mutate: markRead } = useMarkVendorNotificationRead({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({
          queryKey: getListVendorNotificationsQueryKey(vendorId as number),
        });
      },
    },
  });

  const { mutate: markAllRead } = useMarkAllVendorNotificationsRead({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({
          queryKey: getListVendorNotificationsQueryKey(vendorId as number),
        });
      },
    },
  });

  const handleRead = useCallback(
    (n: VendorNotification) => {
      if (!vendorId) return;
      markRead({ id: vendorId, nid: n.id });
    },
    [vendorId, markRead],
  );

  const handleMarkAllRead = () => {
    if (!vendorId) return;
    markAllRead({ id: vendorId });
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch().catch(() => {});
    setRefreshing(false);
  };

  const unreadCount = data?.filter((n) => !n.readAt).length ?? 0;

  if (!vendorId || isLoading) return <LoadingView />;
  if (isError) return <ErrorView message="Could not load notifications." onRetry={refetch} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* sub-header */}
      {unreadCount > 0 && (
        <View
          style={[
            styles.subHeader,
            { borderBottomColor: colors.border, backgroundColor: colors.background },
          ]}
        >
          <Text style={[styles.unreadLabel, { color: colors.mutedForeground }]}>
            {unreadCount} unread
          </Text>
          <Pressable onPress={handleMarkAllRead} hitSlop={8}>
            <Text style={[styles.markAll, { color: colors.primary }]}>Mark all read</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={data}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item, index }) => (
          <NotificationItem
            item={item}
            vendorId={vendorId}
            onRead={handleRead}
            index={index}
          />
        )}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 24 },
          (!data || data.length === 0) && styles.listEmpty,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="bell"
            title="You're all caught up"
            message="Birthdays, tier changes, post reminders, and other alerts will appear here."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  unreadLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  markAll: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  list: {
    paddingTop: 4,
  },
  listEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  sender: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
  },
  timestamp: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
    marginTop: 6,
  },
});
