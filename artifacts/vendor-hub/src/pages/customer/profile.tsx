import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { toast } from "sonner";
import CustomerLayout from "./layout";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export default function CustomerProfile() {
  const { user } = useUser();
  const qc = useQueryClient();

  const { data: me, isLoading } = useQuery({
    queryKey: ["customer-me"],
    queryFn: () => fetch(`${BASE}/api/customer/me`).then(r => r.json()),
  });

  const [name,    setName]    = useState("");
  const [phone,   setPhone]   = useState("");
  const [country, setCountry] = useState("");
  const [city,    setCity]    = useState("");
  const [address, setAddress] = useState("");
  const [bio,     setBio]     = useState("");

  useEffect(() => {
    if (me && !me.code) {
      setName(me.name ?? "");
      setPhone(me.phone ?? "");
      setCountry(me.country ?? "");
      setCity(me.city ?? "");
      setAddress(me.address ?? "");
      setBio(me.bio ?? "");
    } else if (!me && user) {
      setName(user.fullName ?? "");
    }
  }, [me, user]);

  const save = useMutation({
    mutationFn: (payload: object) => fetch(`${BASE}/api/customer/me`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-me"] });
      toast.success("Profile saved");
    },
    onError: () => toast.error("Failed to save"),
  });

  const onboard = useMutation({
    mutationFn: (payload: object) => fetch(`${BASE}/api/customer/onboarding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-me"] });
      toast.success("Account created");
    },
    onError: () => toast.error("Failed to create account"),
  });

  const isNew = me?.code === "NOT_ONBOARDED";
  const profileCompleted = me?.profileCompleted ?? false;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { name, phone, country, city, address, bio,
      email: user?.primaryEmailAddress?.emailAddress ?? me?.email };
    if (isNew) onboard.mutate(payload);
    else save.mutate(payload);
  }

  if (isLoading) return <CustomerLayout><div className="p-6 text-muted-foreground animate-pulse">Loading…</div></CustomerLayout>;

  return (
    <CustomerLayout>
      <div className="p-6 max-w-xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-2xl overflow-hidden bg-violet-50 flex items-center justify-center text-3xl">
            {user?.imageUrl ? <img src={user.imageUrl} className="w-full h-full object-cover" /> : "👤"}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{me?.name ?? user?.fullName ?? "Your Profile"}</h1>
            <p className="text-sm text-muted-foreground">{me?.email ?? user?.primaryEmailAddress?.emailAddress}</p>
            <div className="flex items-center gap-2 mt-1">
              {profileCompleted
                ? <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">✅ Profile Complete — AI Unlocked</span>
                : <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">⚠️ Complete profile to unlock AI</span>
              }
            </div>
          </div>
        </div>

        {/* AI unlock progress */}
        {!profileCompleted && (
          <div className="mb-6 p-4 rounded-xl border border-amber-200 bg-amber-50">
            <p className="text-sm font-bold text-amber-800 mb-1">🤖 To unlock Awajimaa AI Dashboard, fill in:</p>
            <ul className="text-xs text-amber-700 space-y-0.5 list-none">
              {!phone   && <li>• Phone number</li>}
              {!country && <li>• Country</li>}
              {!city    && <li>• City</li>}
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          {/* Basic */}
          <h3 className="font-bold text-gray-800 text-sm border-b pb-2 mb-2">Basic Information</h3>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Full Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} required
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">
              Phone{" "}<span className="text-amber-600 normal-case text-[10px] font-normal ml-1">(required for AI access)</span>
            </label>
            <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" placeholder="+234 800 000 0000"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>

          <h3 className="font-bold text-gray-800 text-sm border-b pb-2 mt-4 pt-2">Location{" "}<span className="text-amber-600 normal-case text-[10px] font-normal ml-1">(required for AI access)</span></h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Country</label>
              <input value={country} onChange={e => setCountry(e.target.value)} placeholder="Nigeria"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">City</label>
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="Lagos"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Address</label>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Bio</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3}
              placeholder="Tell us a little about yourself…"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none" />
          </div>

          <button type="submit"
            disabled={save.isPending || onboard.isPending}
            className="w-full py-3 rounded-xl font-bold text-white text-sm disabled:opacity-70"
            style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
            {(save.isPending || onboard.isPending) ? "Saving…"
              : isNew ? "Create My Account →"
              : "Save Changes"}
          </button>
        </form>
      </div>
    </CustomerLayout>
  );
}
