import { useQuery } from "@tanstack/react-query";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

async function fetchAdminCheck(): Promise<{ isAdmin: boolean }> {
  const res = await fetch(`${BASE_URL}/api/admin/check`, { credentials: "include" });
  if (!res.ok) return { isAdmin: false };
  return res.json() as Promise<{ isAdmin: boolean }>;
}

export function useIsAdmin() {
  const { data } = useQuery({
    queryKey: ["admin-check"],
    queryFn: fetchAdminCheck,
    staleTime: 5 * 60 * 1000,
  });
  return data?.isAdmin ?? false;
}
