import { useQuery } from "@tanstack/react-query";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

async function fetchAdminCheck(): Promise<{ isAdmin: boolean }> {
  const res = await fetch(`${BASE_URL}/api/admin/check`, { credentials: "include" });
  if (!res.ok) return { isAdmin: false };
  return res.json() as Promise<{ isAdmin: boolean }>;
}

/** Returns both the admin flag and whether the check is still in flight, for callers that need to avoid acting on the default-false value before it settles. */
export function useIsAdminStatus() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-check"],
    queryFn: fetchAdminCheck,
    staleTime: 5 * 60 * 1000,
  });
  return { isAdmin: data?.isAdmin ?? false, isLoading };
}

export function useIsAdmin() {
  return useIsAdminStatus().isAdmin;
}
