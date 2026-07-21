/**
 * Ads Suite — tab entry screen.
 * Four sub-sections via a segmented control:
 *   Contacts | Campaigns | Analytics | Email
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/Card';
import { LoadingView } from '@/components/LoadingView';
import { ErrorView } from '@/components/ErrorView';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { AnimatedListItem } from '@/components/AnimatedListItem';
import { GradientButton } from '@/components/GradientButton';
import { MiniBarChart } from '@/components/MiniBarChart';
import {
  getListAdCampaignsQueryKey,
  getListAdContactsQueryKey,
  getListAdEmailCampaignsQueryKey,
  getListCampaignAnalyticsSnapshotsQueryKey,
  getSyncCampaignAnalyticsFromPlatformQueryKey,
  useCreateAdContact,
  useCreateAdEmailCampaign,
  useDeleteAdContact,
  useListAdCampaigns,
  useListAdContacts,
  useListAdEmailCampaigns,
  useListCampaignAnalyticsSnapshots,
  useSendAdEmailCampaign,
  useSyncCampaignAnalyticsFromPlatform,
  useUpdateAdContact,
} from '@workspace/api-client-react';
import type {
  AdCampaign,
  AdContact,
  AdEmailCampaign,
} from '@workspace/api-client-react';

// ─── Helpers ────────────────────────────────────────────────────────────────

type Segment = 'contacts' | 'campaigns' | 'analytics' | 'email';

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'contacts', label: 'Contacts' },
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'email', label: 'Email' },
];

const PLATFORM_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  facebook: 'facebook',
  instagram: 'instagram',
  twitter: 'twitter',
  x: 'twitter',
  linkedin: 'linkedin',
  google: 'search',
  tiktok: 'music',
};

function platformIcon(platform: string): keyof typeof Feather.glyphMap {
  return PLATFORM_ICON[platform.toLowerCase()] ?? 'radio';
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusColor(
  status: string,
  colors: ReturnType<typeof useColors>,
): string {
  switch (status.toLowerCase()) {
    case 'active':
      return colors.success;
    case 'paused':
      return colors.warning;
    case 'ended':
    case 'completed':
      return colors.mutedForeground;
    case 'draft':
    default:
      return colors.primary;
  }
}

// ─── Shared small components ─────────────────────────────────────────────────

function TagChip({ label }: { label: string }) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.tagChip,
        { backgroundColor: colors.primary + '1A', borderColor: colors.primary + '30' },
      ]}
    >
      <Text style={[styles.tagChipText, { color: colors.primary }]}>{label}</Text>
    </View>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const colors = useColors();
  return (
    <View style={[styles.platformBadge, { backgroundColor: colors.secondary }]}>
      <Feather name={platformIcon(platform)} size={12} color={colors.primary} />
      <Text style={[styles.platformBadgeText, { color: colors.primary }]}>
        {platform.charAt(0).toUpperCase() + platform.slice(1)}
      </Text>
    </View>
  );
}

function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={[styles.sectionHeaderTitle, { color: colors.foreground }]}>{title}</Text>
      {action && onAction && (
        <Pressable onPress={onAction} style={styles.sectionHeaderAction}>
          <Feather name="refresh-cw" size={14} color={colors.primary} />
          <Text style={[styles.sectionHeaderActionText, { color: colors.primary }]}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Segmented control ────────────────────────────────────────────────────────

function SegmentControl({
  active,
  onChange,
}: {
  active: Segment;
  onChange: (s: Segment) => void;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.segmentBar,
        { backgroundColor: colors.secondary, borderColor: colors.border },
      ]}
    >
      {SEGMENTS.map(({ key, label }) => {
        const isActive = key === active;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={({ pressed }) => [
              styles.segmentItem,
              isActive && { backgroundColor: colors.primary + '18' },
              pressed && !isActive && { opacity: 0.7 },
            ]}
          >
            {isActive ? (
              <LinearGradient
                colors={['#7F50FF', '#FF7F50']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.segmentActiveBar}
              />
            ) : null}
            <Text
              style={[
                styles.segmentLabel,
                {
                  color: isActive ? colors.primary : colors.mutedForeground,
                  fontFamily: isActive ? 'Inter_700Bold' : 'Inter_400Regular',
                },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Add Contact Modal ────────────────────────────────────────────────────────

function AddContactModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const colors = useColors();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');

  const { mutateAsync, isPending } = useCreateAdContact();

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a contact name.');
      return;
    }
    try {
      const tags = tagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await mutateAsync({ data: { name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined, tags } });
      setName(''); setEmail(''); setPhone(''); setTagsRaw('');
      onCreated();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not add contact.');
    }
  }, [name, email, phone, tagsRaw, mutateAsync, onCreated]);

  const inputStyle = [
    styles.modalInput,
    { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground },
  ];
  const labelStyle = [styles.modalLabel, { color: colors.mutedForeground }];

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalSheetWrap}
      >
        <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Handle */}
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

          <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Contact</Text>

          <Text style={labelStyle}>Name *</Text>
          <TextInput
            style={inputStyle}
            placeholder="Full name"
            placeholderTextColor={colors.mutedForeground}
            value={name}
            onChangeText={setName}
          />

          <Text style={labelStyle}>Email</Text>
          <TextInput
            style={inputStyle}
            placeholder="email@example.com"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={labelStyle}>Phone</Text>
          <TextInput
            style={inputStyle}
            placeholder="+1 234 567 8900"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />

          <Text style={labelStyle}>Tags (comma-separated)</Text>
          <TextInput
            style={inputStyle}
            placeholder="vip, lagos, retail"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            value={tagsRaw}
            onChangeText={setTagsRaw}
          />

          <View style={styles.modalActions}>
            <Pressable
              onPress={onClose}
              style={[styles.modalCancelBtn, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>
                Cancel
              </Text>
            </Pressable>
            <GradientButton
              label={isPending ? 'Saving…' : 'Add Contact'}
              loading={isPending}
              onPress={handleSave}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Contact Detail Modal ─────────────────────────────────────────────────────

function ContactDetailModal({
  contact,
  onClose,
  onSaved,
  onDeleted,
}: {
  contact: AdContact;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const colors = useColors();
  const [name, setName] = useState(contact.name);
  const [email, setEmail] = useState(contact.email ?? '');
  const [phone, setPhone] = useState(contact.phone ?? '');
  const [tagsRaw, setTagsRaw] = useState(contact.tags.join(', '));

  const { mutateAsync: updateAsync, isPending: isSaving } = useUpdateAdContact();
  const { mutateAsync: deleteAsync, isPending: isDeleting } = useDeleteAdContact();

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a contact name.');
      return;
    }
    try {
      const tags = tagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await updateAsync({
        id: contact.id,
        data: {
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          tags,
        },
      });
      onSaved();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not update contact.');
    }
  }, [name, email, phone, tagsRaw, contact.id, updateAsync, onSaved]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete contact',
      `Remove "${contact.name}" from your contacts? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAsync({ id: contact.id });
              onDeleted();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Could not delete contact.');
            }
          },
        },
      ],
    );
  }, [contact.id, contact.name, deleteAsync, onDeleted]);

  const inputStyle = [
    styles.modalInput,
    { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground },
  ];
  const labelStyle = [styles.modalLabel, { color: colors.mutedForeground }];
  const isBusy = isSaving || isDeleting;

  return (
    <Modal visible animationType="slide" transparent presentationStyle="overFullScreen">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalSheetWrap}
      >
        <View style={[styles.modalSheet, styles.detailSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Handle */}
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

          {/* Header row with delete */}
          <View style={styles.detailHeaderRow}>
            <LinearGradient
              colors={['#7F50FF22', '#FF7F5022']}
              style={[styles.detailAvatar, { borderColor: colors.primary + '30', borderWidth: 1 }]}
            >
              <Text style={[styles.contactAvatarText, { color: colors.primary }]}>
                {name.charAt(0).toUpperCase() || '?'}
              </Text>
            </LinearGradient>
            <Text style={[styles.modalTitle, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>
              Edit Contact
            </Text>
            <TouchableOpacity
              onPress={handleDelete}
              disabled={isBusy}
              style={[styles.deleteBtn, { borderColor: colors.destructive + '40' }]}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color={colors.destructive} />
              ) : (
                <Feather name="trash-2" size={18} color={colors.destructive} />
              )}
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={labelStyle}>Name *</Text>
            <TextInput
              style={inputStyle}
              placeholder="Full name"
              placeholderTextColor={colors.mutedForeground}
              value={name}
              onChangeText={setName}
              editable={!isBusy}
            />

            <Text style={labelStyle}>Email</Text>
            <TextInput
              style={inputStyle}
              placeholder="email@example.com"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              editable={!isBusy}
            />

            <Text style={labelStyle}>Phone</Text>
            <TextInput
              style={inputStyle}
              placeholder="+1 234 567 8900"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              editable={!isBusy}
            />

            <Text style={labelStyle}>Tags (comma-separated)</Text>
            <TextInput
              style={inputStyle}
              placeholder="vip, lagos, retail"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              value={tagsRaw}
              onChangeText={setTagsRaw}
              editable={!isBusy}
            />
          </ScrollView>

          <View style={[styles.modalActions, { marginTop: 8 }]}>
            <Pressable
              onPress={onClose}
              style={[styles.modalCancelBtn, { borderColor: colors.border }]}
              disabled={isBusy}
            >
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>
                Cancel
              </Text>
            </Pressable>
            <GradientButton
              label={isSaving ? 'Saving…' : 'Save Changes'}
              loading={isSaving}
              onPress={handleSave}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── CONTACTS SECTION ─────────────────────────────────────────────────────────

function ContactsSection() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<AdContact | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = useListAdContacts({
    query: { queryKey: getListAdContactsQueryKey() },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={() => refetch()} />;

  const contacts: AdContact[] = data ?? [];

  return (
    <>
      <FlatList
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 80 },
          contacts.length === 0 && styles.emptyContent,
        ]}
        data={contacts}
        keyExtractor={(c) => String(c.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState
            icon="users"
            title="No contacts yet"
            message="Add your first contact with the + button below."
          />
        }
        renderItem={({ item, index }) => (
          <AnimatedListItem index={index} baseDelay={40}>
            <Card style={styles.contactCard} onPress={() => setSelected(item)}>
              <View style={styles.contactRow}>
                <LinearGradient
                  colors={['#7F50FF22', '#FF7F5022']}
                  style={[styles.contactAvatar, { borderColor: colors.primary + '30', borderWidth: 1 }]}
                >
                  <Text style={[styles.contactAvatarText, { color: colors.primary }]}>
                    {item.name.charAt(0).toUpperCase()}
                  </Text>
                </LinearGradient>

                <View style={styles.contactInfo}>
                  <Text style={[styles.contactName, { color: colors.foreground }]}>{item.name}</Text>
                  {item.email ? (
                    <Text style={[styles.contactMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {item.email}
                    </Text>
                  ) : null}
                  {item.phone ? (
                    <Text style={[styles.contactMeta, { color: colors.mutedForeground }]}>{item.phone}</Text>
                  ) : null}

                  {item.tags.length > 0 && (
                    <View style={styles.tagRow}>
                      {item.tags.slice(0, 4).map((tag) => (
                        <TagChip key={tag} label={tag} />
                      ))}
                      {item.tags.length > 4 && (
                        <Text style={[styles.tagMore, { color: colors.mutedForeground }]}>
                          +{item.tags.length - 4}
                        </Text>
                      )}
                    </View>
                  )}
                </View>

                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </View>
            </Card>
          </AnimatedListItem>
        )}
      />

      {/* FAB */}
      <View style={[styles.fab, { bottom: insets.bottom + 24 }]}>
        <Pressable
          onPress={() => setShowAdd(true)}
          style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
        >
          <LinearGradient
            colors={['#7F50FF', '#FF7F50']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabInner}
          >
            <Feather name="user-plus" size={22} color="#FFFFFF" />
          </LinearGradient>
        </Pressable>
      </View>

      <AddContactModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={() => { setShowAdd(false); refetch(); }}
      />

      {selected && (
        <ContactDetailModal
          contact={selected}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); refetch(); }}
          onDeleted={() => { setSelected(null); refetch(); }}
        />
      )}
    </>
  );
}

// ─── CAMPAIGNS SECTION ────────────────────────────────────────────────────────

function CampaignRow({ item, index }: { item: AdCampaign; index: number }) {
  const colors = useColors();
  const sc = statusColor(item.status, colors);

  return (
    <AnimatedListItem index={index} baseDelay={40}>
      <Card
        style={styles.campaignCard}
        onPress={() => router.push(`/ads/${item.id}` as any)}
      >
        <View style={styles.campaignRow}>
          <LinearGradient
            colors={['#7F50FF22', '#FF7F5022']}
            style={[styles.campaignIcon, { borderColor: colors.primary + '30', borderWidth: 1 }]}
          >
            <Feather name={platformIcon(item.platform)} size={18} color={colors.primary} />
          </LinearGradient>

          <View style={styles.campaignMain}>
            <Text style={[styles.campaignName, { color: colors.foreground }]} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={styles.campaignMeta}>
              <PlatformBadge platform={item.platform} />
              {item.budgetAmount && (
                <Text style={[styles.campaignBudget, { color: colors.accent }]}>
                  {item.budgetCurrency} {Number(item.budgetAmount).toLocaleString()}
                </Text>
              )}
            </View>
            {(item.startDate || item.endDate) && (
              <Text style={[styles.campaignDates, { color: colors.mutedForeground }]}>
                {fmtDate(item.startDate)} – {fmtDate(item.endDate)}
              </Text>
            )}
          </View>

          <View style={styles.campaignTrailing}>
            <View style={[styles.statusDot, { backgroundColor: sc }]} />
            <Text style={[styles.campaignStatus, { color: sc }]}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </Text>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ marginTop: 4 }} />
          </View>
        </View>

        {item.lastPublishError && (
          <View style={[styles.errorBanner, { backgroundColor: colors.destructive + '12' }]}>
            <Feather name="alert-circle" size={12} color={colors.destructive} />
            <Text style={[styles.errorBannerText, { color: colors.destructive }]} numberOfLines={2}>
              {item.lastPublishError}
            </Text>
          </View>
        )}
      </Card>
    </AnimatedListItem>
  );
}

function CampaignsSection() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = useListAdCampaigns({
    query: { queryKey: getListAdCampaignsQueryKey() },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={() => refetch()} />;

  const campaigns: AdCampaign[] = data ?? [];

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: insets.bottom + 32 },
        campaigns.length === 0 && styles.emptyContent,
      ]}
      data={campaigns}
      keyExtractor={(c) => String(c.id)}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      ListEmptyComponent={
        <EmptyState
          icon="bar-chart-2"
          title="No campaigns yet"
          message="Create your first ad campaign from the web dashboard."
        />
      }
      ListHeaderComponent={
        campaigns.length > 0 ? (
          <View style={[styles.webNudge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Feather name="monitor" size={14} color={colors.primary} />
            <Text style={[styles.webNudgeText, { color: colors.mutedForeground }]}>
              Create new campaigns from the web dashboard.
            </Text>
          </View>
        ) : null
      }
      renderItem={({ item, index }) => <CampaignRow item={item} index={index} />}
    />
  );
}

// ─── ANALYTICS SECTION ────────────────────────────────────────────────────────

function CampaignAnalyticsCard({ campaign }: { campaign: AdCampaign }) {
  const colors = useColors();

  const snapshotsQuery = useListCampaignAnalyticsSnapshots(campaign.id, {
    query: { queryKey: getListCampaignAnalyticsSnapshotsQueryKey(campaign.id) },
  });

  const syncQuery = useSyncCampaignAnalyticsFromPlatform(campaign.id, {
    query: { enabled: false, queryKey: getSyncCampaignAnalyticsFromPlatformQueryKey(campaign.id) },
  });

  const handleSync = useCallback(async () => {
    try {
      await syncQuery.refetch();
      await snapshotsQuery.refetch();
    } catch {
      Alert.alert('Sync failed', 'Could not sync analytics from the platform.');
    }
  }, [syncQuery, snapshotsQuery]);

  const snapshots = snapshotsQuery.data ?? [];

  // Aggregate totals from all snapshots
  const totalImpressions = snapshots.reduce((s, d) => s + d.impressions, 0);
  const totalClicks = snapshots.reduce((s, d) => s + d.clicks, 0);
  const totalSpend = snapshots.reduce((s, d) => s + Number(d.spend), 0);
  const avgCtr = snapshots.length > 0
    ? snapshots.reduce((s, d) => s + Number(d.ctr), 0) / snapshots.length
    : 0;

  // Last 7 days bar chart data (impressions trend)
  const last7 = snapshots
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7)
    .map((d) => {
      const dt = new Date(d.date);
      const label = `${dt.getMonth() + 1}/${dt.getDate()}`;
      return { label, value: d.impressions };
    });

  const isSyncing = syncQuery.isFetching || snapshotsQuery.isLoading;

  return (
    <Card style={[styles.analyticsCard, { borderColor: colors.border }]}>
      {/* Header */}
      <View style={styles.analyticsCardHeader}>
        <View style={styles.analyticsCardTitle}>
          <Feather name={platformIcon(campaign.platform)} size={15} color={colors.primary} />
          <Text style={[styles.analyticsName, { color: colors.foreground }]} numberOfLines={1}>
            {campaign.name}
          </Text>
        </View>
        <Pressable
          onPress={handleSync}
          disabled={isSyncing}
          style={({ pressed }) => [styles.syncBtn, { opacity: pressed || isSyncing ? 0.6 : 1 }]}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Feather name="refresh-cw" size={14} color={colors.primary} />
          )}
          <Text style={[styles.syncBtnText, { color: colors.primary }]}>Sync</Text>
        </Pressable>
      </View>

      {snapshotsQuery.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
      ) : snapshots.length === 0 ? (
        <Text style={[styles.analyticsEmpty, { color: colors.mutedForeground }]}>
          No analytics data yet. Tap Sync to pull from the platform.
        </Text>
      ) : (
        <>
          {/* Metric tiles */}
          <View style={styles.metricGrid}>
            {[
              { label: 'Impressions', value: totalImpressions.toLocaleString(), icon: 'eye' as const },
              { label: 'Clicks', value: totalClicks.toLocaleString(), icon: 'mouse-pointer' as const },
              { label: 'Spend', value: `$${totalSpend.toFixed(2)}`, icon: 'dollar-sign' as const },
              { label: 'Avg CTR', value: `${avgCtr.toFixed(2)}%`, icon: 'trending-up' as const },
            ].map(({ label, value, icon }) => (
              <View key={label} style={[styles.metricTile, { backgroundColor: colors.secondary }]}>
                <Feather name={icon} size={13} color={colors.accent} />
                <Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text>
                <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>
              </View>
            ))}
          </View>

          {/* 7-day impressions chart */}
          {last7.length > 1 && (
            <View style={{ marginTop: 12 }}>
              <Text style={[styles.chartTitle, { color: colors.mutedForeground }]}>
                Impressions — last {last7.length} days
              </Text>
              <MiniBarChart data={last7} barColor={colors.primary} height={90} />
            </View>
          )}
        </>
      )}
    </Card>
  );
}

function AnalyticsSection() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = useListAdCampaigns({
    query: { queryKey: getListAdCampaignsQueryKey() },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={() => refetch()} />;

  const campaigns: AdCampaign[] = data ?? [];

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: insets.bottom + 32 },
        campaigns.length === 0 && styles.emptyContent,
      ]}
      data={campaigns}
      keyExtractor={(c) => String(c.id)}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      ListEmptyComponent={
        <EmptyState
          icon="bar-chart-2"
          title="No campaigns"
          message="Analytics will appear here once you have active campaigns."
        />
      }
      renderItem={({ item, index }) => (
        <Animated.View entering={FadeInDown.delay(index * 70).springify().damping(18)}>
          <CampaignAnalyticsCard campaign={item} />
        </Animated.View>
      )}
    />
  );
}

// ─── EMAIL SECTION ────────────────────────────────────────────────────────────

// ── Compose Email Modal ───────────────────────────────────────────────────────

function ComposeEmailModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (campaign: AdEmailCampaign) => void;
}) {
  const colors = useColors();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [fromName, setFromName] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');

  const { mutateAsync, isPending } = useCreateAdEmailCampaign();

  const handleSave = useCallback(async () => {
    if (!subject.trim()) {
      Alert.alert('Subject required', 'Please enter a subject line.');
      return;
    }
    if (!body.trim()) {
      Alert.alert('Body required', 'Please write something in the email body.');
      return;
    }
    if (!fromName.trim()) {
      Alert.alert('Sender name required', 'Please enter a sender name.');
      return;
    }
    try {
      const tags = tagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const result = await mutateAsync({
        data: {
          subject: subject.trim(),
          bodyHtml: body.trim(),
          fromName: fromName.trim(),
          ...(tags.length > 0 ? { contactFilterJson: { tags } } : {}),
        },
      });
      setSubject('');
      setBody('');
      setFromName('');
      setTagsRaw('');
      onCreated(result);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not create campaign.');
    }
  }, [subject, body, fromName, tagsRaw, mutateAsync, onCreated]);

  const inputStyle = [
    styles.modalInput,
    { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground },
  ];
  const labelStyle = [styles.modalLabel, { color: colors.mutedForeground }];

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalSheetWrap}
      >
        <View
          style={[
            styles.modalSheet,
            styles.composeSheet,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

          <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Email Campaign</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={labelStyle}>Subject *</Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. Big summer sale — 30% off everything"
              placeholderTextColor={colors.mutedForeground}
              value={subject}
              onChangeText={setSubject}
            />

            <Text style={labelStyle}>Sender name *</Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. Awa Store"
              placeholderTextColor={colors.mutedForeground}
              value={fromName}
              onChangeText={setFromName}
            />

            <Text style={labelStyle}>Body *</Text>
            <TextInput
              style={[inputStyle, styles.composeBodyInput]}
              placeholder="Write your message here…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              textAlignVertical="top"
              value={body}
              onChangeText={setBody}
            />

            <Text style={labelStyle}>Tag filter (comma-separated, optional)</Text>
            <TextInput
              style={inputStyle}
              placeholder="vip, lagos — leave blank to send to all"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              value={tagsRaw}
              onChangeText={setTagsRaw}
            />
          </ScrollView>

          <View style={[styles.modalActions, { marginTop: 8 }]}>
            <Pressable
              onPress={onClose}
              style={[styles.modalCancelBtn, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>
                Cancel
              </Text>
            </Pressable>
            <GradientButton
              label={isPending ? 'Saving…' : 'Save Draft'}
              loading={isPending}
              onPress={handleSave}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EmailDetailModal({
  campaign,
  onClose,
  onSent,
}: {
  campaign: AdEmailCampaign;
  onClose: () => void;
  onSent: () => void;
}) {
  const colors = useColors();
  const { mutateAsync, isPending } = useSendAdEmailCampaign();
  const isDraft = campaign.status === 'draft';

  const handleSend = useCallback(async () => {
    Alert.alert(
      'Send campaign',
      `This will send "${campaign.subject}" to all matching contacts. This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'default',
          onPress: async () => {
            try {
              await mutateAsync({ id: campaign.id });
              onSent();
            } catch (err) {
              Alert.alert('Send failed', err instanceof Error ? err.message : 'Could not send campaign.');
            }
          },
        },
      ],
    );
  }, [campaign, mutateAsync, onSent]);

  const sc = campaign.status === 'sent' ? colors.success : colors.primary;

  return (
    <Modal visible animationType="slide" transparent presentationStyle="overFullScreen">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalSheetWrap}
      >
        <View style={[styles.emailSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

          <View style={styles.emailSheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.emailSubject, { color: colors.foreground }]} numberOfLines={2}>
                {campaign.subject}
              </Text>
              <Text style={[styles.emailFrom, { color: colors.mutedForeground }]}>
                From: {campaign.fromName}
              </Text>
            </View>
            <View style={[styles.emailStatusChip, { backgroundColor: sc + '18', borderColor: sc + '35' }]}>
              <Text style={[styles.emailStatusText, { color: sc }]}>
                {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
              </Text>
            </View>
          </View>

          {/* Body preview */}
          <ScrollView
            style={[styles.emailBodyScroll, { borderColor: colors.border }]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.emailBodyText, { color: colors.foreground }]}>
              {campaign.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
            </Text>
          </ScrollView>

          {/* Recipients */}
          <View style={[styles.recipientRow, { borderColor: colors.border }]}>
            <Feather name="users" size={14} color={colors.mutedForeground} />
            <Text style={[styles.recipientText, { color: colors.mutedForeground }]}>
              {campaign.sentCount > 0
                ? `Sent to ${campaign.sentCount.toLocaleString()} recipients`
                : 'No recipients matched yet'}
            </Text>
          </View>

          <View style={styles.emailActions}>
            <Pressable
              onPress={onClose}
              style={[styles.modalCancelBtn, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>
                Close
              </Text>
            </Pressable>
            {isDraft && (
              <GradientButton
                label={isPending ? 'Sending…' : 'Send Campaign'}
                loading={isPending}
                onPress={handleSend}
                style={{ flex: 1 }}
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EmailSection() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<AdEmailCampaign | null>(null);
  const [showCompose, setShowCompose] = useState(false);

  const { data, isLoading, isError, refetch } = useListAdEmailCampaigns({
    query: { queryKey: getListAdEmailCampaignsQueryKey() },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleCreated = useCallback(async (campaign: AdEmailCampaign) => {
    setShowCompose(false);
    await refetch();
    setSelected(campaign);
  }, [refetch]);

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={() => refetch()} />;

  const campaigns: AdEmailCampaign[] = data ?? [];

  return (
    <>
      <FlatList
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 80 },
          campaigns.length === 0 && styles.emptyContent,
        ]}
        data={campaigns}
        keyExtractor={(c) => String(c.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState
            icon="mail"
            title="No email campaigns"
            message="Tap the + button to compose your first email campaign."
          />
        }
        renderItem={({ item, index }) => {
          const sc = item.status === 'sent' ? colors.success : colors.primary;
          return (
            <AnimatedListItem index={index} baseDelay={40}>
              <Card style={styles.emailCard} onPress={() => setSelected(item)}>
                <View style={styles.emailRow}>
                  <LinearGradient
                    colors={['#7F50FF22', '#FF7F5022']}
                    style={[styles.emailIcon, { borderColor: colors.primary + '30', borderWidth: 1 }]}
                  >
                    <Feather name="mail" size={18} color={colors.primary} />
                  </LinearGradient>

                  <View style={styles.emailMain}>
                    <Text style={[styles.emailSubjectRow, { color: colors.foreground }]} numberOfLines={1}>
                      {item.subject}
                    </Text>
                    <Text style={[styles.emailFromSmall, { color: colors.mutedForeground }]}>
                      {item.fromName}
                      {item.sentCount > 0 ? ` · ${item.sentCount.toLocaleString()} sent` : ''}
                    </Text>
                    {item.sentAt && (
                      <Text style={[styles.emailDate, { color: colors.mutedForeground }]}>
                        {fmtDate(item.sentAt)}
                      </Text>
                    )}
                  </View>

                  <View style={[styles.emailStatusChip, { backgroundColor: sc + '18', borderColor: sc + '35' }]}>
                    <Text style={[styles.emailStatusText, { color: sc }]}>
                      {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                    </Text>
                  </View>
                </View>
              </Card>
            </AnimatedListItem>
          );
        }}
      />

      {/* FAB — compose new campaign */}
      <View style={[styles.fab, { bottom: insets.bottom + 24 }]}>
        <Pressable
          onPress={() => setShowCompose(true)}
          style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
        >
          <LinearGradient
            colors={['#7F50FF', '#FF7F50']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabInner}
          >
            <Feather name="plus" size={24} color="#FFFFFF" />
          </LinearGradient>
        </Pressable>
      </View>

      <ComposeEmailModal
        visible={showCompose}
        onClose={() => setShowCompose(false)}
        onCreated={handleCreated}
      />

      {selected && (
        <EmailDetailModal
          campaign={selected}
          onClose={() => setSelected(null)}
          onSent={() => { setSelected(null); refetch(); }}
        />
      )}
    </>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AdsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<Segment>('contacts');

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Segment control below the header */}
      <View style={[styles.segmentWrap, { borderBottomColor: colors.border }]}>
        <SegmentControl active={segment} onChange={setSegment} />
      </View>

      {/* Section content */}
      <View style={{ flex: 1 }}>
        {segment === 'contacts' && <ContactsSection />}
        {segment === 'campaigns' && <CampaignsSection />}
        {segment === 'analytics' && <AnalyticsSection />}
        {segment === 'email' && <EmailSection />}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Segment control
  segmentWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  segmentBar: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    position: 'relative',
  },
  segmentActiveBar: {
    position: 'absolute',
    bottom: 0,
    left: 8,
    right: 8,
    height: 2.5,
    borderRadius: 99,
  },
  segmentLabel: {
    fontSize: 12,
  },

  // Shared list layout
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  // Contacts
  contactCard: { marginBottom: 10 },
  contactRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  contactAvatarText: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  contactInfo: { flex: 1, gap: 3 },
  contactName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  contactMeta: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tagChipText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  tagMore: { fontSize: 11, fontFamily: 'Inter_400Regular', alignSelf: 'center' },

  // FAB
  fab: { position: 'absolute', right: 20 },
  fabInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7F50FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },

  // Campaigns
  campaignCard: { marginBottom: 10 },
  campaignRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  campaignIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  campaignMain: { flex: 1, gap: 5 },
  campaignName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  campaignMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  campaignBudget: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  campaignDates: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  campaignTrailing: { alignItems: 'flex-end', gap: 4 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  campaignStatus: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 10,
    padding: 8,
    borderRadius: 8,
  },
  errorBannerText: { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular' },

  // Platform badge
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  platformBadgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  // Web nudge
  webNudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  webNudgeText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular' },

  // Section header
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeaderTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  sectionHeaderAction: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sectionHeaderActionText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  // Analytics
  analyticsCard: { marginBottom: 14 },
  analyticsCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  analyticsCardTitle: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  analyticsName: { fontSize: 13, fontFamily: 'Inter_600SemiBold', flex: 1 },
  syncBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  syncBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  analyticsEmpty: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingVertical: 12 },
  metricGrid: { flexDirection: 'row', gap: 8 },
  metricTile: {
    flex: 1,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    gap: 4,
  },
  metricValue: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  metricLabel: { fontSize: 9, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  chartTitle: { fontSize: 11, fontFamily: 'Inter_400Regular', marginBottom: 6 },

  // Email list
  emailCard: { marginBottom: 10 },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emailIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emailMain: { flex: 1, gap: 3 },
  emailSubjectRow: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  emailFromSmall: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  emailDate: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  emailStatusChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emailStatusText: { fontSize: 11, fontFamily: 'Inter_700Bold' },

  // Add contact modal / email detail modal (shared parts)
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalSheetWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    paddingBottom: 36,
    gap: 10,
  },
  emailSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    paddingBottom: 36,
    maxHeight: '80%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  modalLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  modalInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancelBtn: {
    flex: 0.45,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },

  // Contact detail modal specifics
  detailSheet: { gap: 0 },
  detailHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  detailAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  deleteBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Compose email modal specifics
  composeSheet: { maxHeight: '88%', gap: 0 },
  composeBodyInput: { minHeight: 120, paddingTop: 12 },

  // Email detail modal specifics
  emailSheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  emailSubject: { fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 3 },
  emailFrom: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  emailBodyScroll: {
    maxHeight: 180,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  emailBodyText: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  recipientText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  emailActions: { flexDirection: 'row', gap: 10 },
});
