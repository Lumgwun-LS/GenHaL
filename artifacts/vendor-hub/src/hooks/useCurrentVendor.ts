import { useQuery, useQueryClient } from "@tanstack/react-query";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export type VendorMe = {
  id: number;
  clerkUserId: string | null;
  name: string;
  email: string;
  [key: string]: unknown;
};

async function fetchVendorMe(): Promise<VendorMe | null> {
  const res = await fetch(`${BASE_URL}/api/vendors/me`, { credentials: "include" });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json() as Promise<VendorMe>;
}

export const VENDOR_ME_QUERY_KEY = ["vendor-me"] as const;

/**
 * Returns the current user's own vendor profile.
 * Works for any signed-in user (not admin-only like useListVendors).
 * `hasVendor` is true only once the fetch has settled and a vendor row exists.
 */
export function useCurrentVendor() {
  const { data, isLoading } = useQuery({
    queryKey: VENDOR_ME_QUERY_KEY,
    queryFn: fetchVendorMe,
    staleTime: 30_000,
    retry: false,
  });

  return {
    vendor: data ?? null,
    hasVendor: !isLoading && data !== null && data !== undefined,
    isLoading,
  };
}

/** After onboarding succeeds, call this to immediately update the cache. */
export function useSetVendorMe() {
  const qc = useQueryClient();
  return (vendor: VendorMe) => {
    qc.setQueryData(VENDOR_ME_QUERY_KEY, vendor);
  };
}
