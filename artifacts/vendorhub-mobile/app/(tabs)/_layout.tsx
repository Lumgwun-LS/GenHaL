import React from 'react';
import { Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import {
  getListVendorNotificationsQueryKey,
  useListVendorNotifications,
} from '@workspace/api-client-react';

// iOS 26 uses NativeTabs for liquid glass — brand colours applied on ClassicTabLayout only.
function NativeTabLayout({ features, unreadCount }: { features: string[]; unreadCount: number }) {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="orders" hidden={!features.includes('orders')}>
        <Icon sf={{ default: 'bag', selected: 'bag.fill' }} />
        <Label>Orders</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="products" hidden={!features.includes('products')}>
        <Icon sf={{ default: 'shippingbox', selected: 'shippingbox.fill' }} />
        <Label>Products</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="inventory" hidden={!features.includes('inventory')}>
        <Icon sf={{ default: 'square.stack', selected: 'square.stack.fill' }} />
        <Label>Inventory</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="payments">
        <Icon sf={{ default: 'creditcard', selected: 'creditcard.fill' }} />
        <Label>Payments</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="expenses">
        <Icon sf={{ default: 'doc.text', selected: 'doc.text.fill' }} />
        <Label>Expenses</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="ads">
        <Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} />
        <Label>Ads</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="notifications">
        <Icon sf={{ default: 'bell', selected: 'bell.fill' }} />
        <Label>Alerts</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <Icon sf={{ default: 'person.circle', selected: 'person.circle.fill' }} />
        <Label>Account</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout({ features, unreadCount }: { features: string[]; unreadCount: number }) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.background,
          shadowColor: 'transparent',
          elevation: 0,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        } as any,
        headerTintColor: colors.primary,
        headerTitleStyle: {
          fontFamily: 'Inter_700Bold',
          fontSize: 17,
          color: colors.foreground,
        },
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : isDark ? colors.card : '#FFFFFF',
          borderTopWidth: 0,
          elevation: 0,
          shadowColor: '#7F50FF',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: isDark ? 0.3 : 0.08,
          shadowRadius: 16,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={80}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: isDark ? colors.card : '#FFFFFF',
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                },
              ]}
            />
          ) : null,
        tabBarLabelStyle: {
          fontFamily: 'Inter_600SemiBold',
          fontSize: 10,
          marginBottom: isWeb ? 4 : 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={24} />
            ) : (
              <Feather name="home" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          href: features.includes('orders') ? undefined : null,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="bag" tintColor={color} size={24} />
            ) : (
              <Feather name="shopping-bag" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Products',
          href: features.includes('products') ? undefined : null,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="shippingbox" tintColor={color} size={24} />
            ) : (
              <Feather name="package" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          href: features.includes('inventory') ? undefined : null,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="square.stack" tintColor={color} size={24} />
            ) : (
              <Feather name="layers" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: 'Payments',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="creditcard" tintColor={color} size={24} />
            ) : (
              <Feather name="credit-card" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: 'Expenses',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="doc.text" tintColor={color} size={24} />
            ) : (
              <Feather name="file-text" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="ads"
        options={{
          title: 'Ads',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="chart.bar" tintColor={color} size={24} />
            ) : (
              <Feather name="bar-chart-2" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarBadge: unreadCount > 0 ? (unreadCount > 9 ? '9+' : unreadCount) : undefined,
          tabBarBadgeStyle: { fontSize: 10, minWidth: 16 },
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView
                name={focused ? 'bell.fill' : 'bell'}
                tintColor={color}
                size={24}
              />
            ) : (
              <Feather name="bell" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="person.circle" tintColor={color} size={24} />
            ) : (
              <Feather name="user" size={22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { isLoading, isAuthenticated, needsOnboarding, features, vendor } = useAuth();
  const vendorId = vendor?.id;

  const { data: notifications } = useListVendorNotifications(vendorId as number, {
    query: {
      queryKey: getListVendorNotificationsQueryKey(vendorId as number),
      enabled: Boolean(vendorId) && isAuthenticated,
      refetchInterval: 60_000,
    },
  });

  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0;

  if (isLoading) return null;

  if (!isAuthenticated) {
    return <Redirect href={needsOnboarding ? '/onboarding' : '/sign-in'} />;
  }

  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout features={features} unreadCount={unreadCount} />;
  }
  return <ClassicTabLayout features={features} unreadCount={unreadCount} />;
}
