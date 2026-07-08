import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { LoadingView } from '@/components/LoadingView';
import { useAuth } from '@/context/AuthContext';

export default function RootIndex() {
  const { isLoaded: isClerkLoaded, isSignedIn } = useClerkAuth();
  const { isLoading, isAuthenticated, needsOnboarding } = useAuth();

  if (!isClerkLoaded || isLoading) {
    return <LoadingView />;
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  if (needsOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href={isSignedIn ? '/onboarding' : '/sign-in'} />;
}
