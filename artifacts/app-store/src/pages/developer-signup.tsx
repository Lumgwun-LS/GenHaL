import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Link, useLocation } from "wouter";
import { CheckCircle, CreditCard, ArrowRight, Shield, Zap, Globe } from "lucide-react";

const GATEWAYS = [
  { id: "stripe", label: "Stripe", desc: "Pay with card (Visa, Mastercard, etc.)", emoji: "💳" },
  { id: "paystack", label: "Paystack", desc: "Pay with Nigerian card or bank transfer", emoji: "🏦" },
  { id: "paypal", label: "PayPal", desc: "Pay with your PayPal account", emoji: "🌐" },
];

export default function DeveloperSignupPage() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [gateway, setGateway] = useState("stripe");
  const [form, setForm] = useState({ displayName: "", bio: "", website: "", company: "" });
  const [paymentRef, setPaymentRef] = useState("");

  const initPayment = useMutation({
    mutationFn: () => apiFetch<{ checkoutUrl?: string; paystackAuthorizationUrl?: string; paymentRef: string }>(
      "/payments/developer-signup",
      { method: "POST", body: JSON.stringify({ gateway }) }
    ),
    onSuccess: (data) => {
      setPaymentRef(data.paymentRef ?? "");
      const url = data.checkoutUrl ?? data.paystackAuthorizationUrl;
      if (url) {
        window.open(url, "_blank");
      }
      setStep(2);
    },
  });

  const register = useMutation({
    mutationFn: () => apiFetch("/developers/register", {
      method: "POST",
      body: JSON.stringify({ ...form, paymentRef }),
    }),
    onSuccess: () => {
      setStep(3);
      setTimeout(() => navigate("/developer"), 2000);
    },
  });

  return (
    <div className="max-w-xl mx-auto px-4 py-16">
      {/* Progress */}
      <div className="flex items-center justify-center gap-3 mb-12">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all
              ${step >= s ? "bg-gradient-to-br from-[#7F50FF] to-[#FF7F50] text-white" : "bg-white/10 text-gray-500"}`}>
              {step > s ? "✓" : s}
            </div>
            {s < 3 && <div className={`w-12 h-0.5 transition-colors ${step > s ? "bg-[#7F50FF]" : "bg-white/10"}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Choose payment */}
      {step === 1 && (
        <div>
          <h1 className="text-2xl font-bold text-white text-center mb-2">Choose Payment Method</h1>
          <p className="text-gray-400 text-center mb-8 text-sm">One-time $15 developer registration fee</p>

          <div className="space-y-3 mb-8">
            {GATEWAYS.map(g => (
              <button
                key={g.id}
                onClick={() => setGateway(g.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all
                  ${gateway === g.id ? "bg-[#7F50FF]/15 border-[#7F50FF]/60" : "bg-[#0d0d1a] border-white/15 hover:border-white/30"}`}
              >
                <span className="text-2xl">{g.emoji}</span>
                <div className="text-left">
                  <p className="text-white font-semibold">{g.label}</p>
                  <p className="text-gray-400 text-xs">{g.desc}</p>
                </div>
                <div className={`ml-auto w-5 h-5 rounded-full border-2 transition-colors
                  ${gateway === g.id ? "border-[#7F50FF] bg-[#7F50FF]" : "border-gray-600"}`}>
                  {gateway === g.id && <div className="w-full h-full rounded-full scale-50 bg-white" />}
                </div>
              </button>
            ))}
          </div>

          {/* Benefits */}
          <div className="bg-[#0d0d1a] border border-[#7F50FF]/15 rounded-2xl p-5 mb-8">
            <h3 className="text-white font-semibold mb-3 text-sm">What you get:</h3>
            <div className="space-y-2">
              {[
                { icon: Zap, text: "Publish unlimited apps" },
                { icon: Globe, text: "Reach millions of Awajimaa users" },
                { icon: Shield, text: "AI-assisted policy review" },
                { icon: CheckCircle, text: "Developer analytics dashboard" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2 text-gray-300 text-sm">
                  <Icon className="w-4 h-4 text-[#7F50FF] flex-shrink-0" />
                  {text}
                </div>
              ))}
            </div>
          </div>

          {initPayment.isError && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 text-red-400 text-sm mb-4">
              Payment initiation failed. Please try again.
            </div>
          )}

          <button
            onClick={() => initPayment.mutate()}
            disabled={initPayment.isPending}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#7F50FF] to-[#FF7F50] text-white font-bold py-4 rounded-xl hover:opacity-90 disabled:opacity-60 transition-opacity text-lg"
          >
            <CreditCard className="w-5 h-5" />
            {initPayment.isPending ? "Processing..." : "Pay $15 & Continue"}
          </button>
        </div>
      )}

      {/* Step 2: Profile + confirm payment */}
      {step === 2 && (
        <div>
          <h1 className="text-2xl font-bold text-white text-center mb-2">Complete Your Profile</h1>
          <div className="bg-blue-500/10 border border-blue-500/25 rounded-xl p-4 mb-6 text-blue-300 text-sm">
            💡 Complete your payment in the window that opened, then fill in your profile below.
          </div>

          <div className="space-y-4 mb-6">
            {[
              { key: "displayName", label: "Developer / Studio Name *", placeholder: "Acme Labs" },
              { key: "company", label: "Company (optional)", placeholder: "Acme Technologies Ltd." },
              { key: "website", label: "Website (optional)", placeholder: "https://acme.ng" },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="text-sm text-gray-400 mb-1.5 block">{label}</label>
                <input
                  value={(form as any)[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full bg-[#0d0d1a] border border-white/15 text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#7F50FF]/50"
                />
              </div>
            ))}
            <div>
              <label className="text-sm text-gray-400 mb-1.5 block">Bio (optional)</label>
              <textarea
                value={form.bio}
                onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                placeholder="Tell us about yourself or your studio..."
                rows={3}
                className="w-full bg-[#0d0d1a] border border-white/15 text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:border-[#7F50FF]/50"
              />
            </div>
          </div>

          {register.isError && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 text-red-400 text-sm mb-4">
              Registration failed. Make sure your payment was completed.
            </div>
          )}

          <button
            onClick={() => register.mutate()}
            disabled={register.isPending || !form.displayName}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#7F50FF] to-[#9b6bff] text-white font-bold py-3 rounded-xl hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {register.isPending ? "Activating account..." : <>Complete Registration <ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      )}

      {/* Step 3: Success */}
      {step === 3 && (
        <div className="text-center">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#7F50FF] to-[#FF7F50] flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Welcome, Developer!</h1>
          <p className="text-gray-400 mb-6">Your account is active. Start publishing apps to the Awajimaa community.</p>
          <p className="text-gray-500 text-sm">Redirecting to your dashboard...</p>
        </div>
      )}

      <div className="text-center mt-8">
        <Link href="/" className="text-gray-500 text-sm hover:text-white transition-colors">← Back to Store</Link>
      </div>
    </div>
  );
}
