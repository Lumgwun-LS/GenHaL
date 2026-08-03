import React from 'react';
import { 
  Download,
  Store,
  Smartphone,
  LayoutDashboard,
  CreditCard,
  ShoppingCart,
  LineChart,
  Users,
  Megaphone,
  Share2,
  Image as ImageIcon,
  Video,
  LayoutTemplate,
  Mic,
  FileSpreadsheet,
  CheckCircle,
  PenTool
} from 'lucide-react';

export default function OnePager() {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground font-sans print:bg-white print:text-black py-12 print:py-0">
      <div className="max-w-[900px] mx-auto px-6 space-y-14 print:space-y-8">
        
        {/* 1. Header bar */}
        <header className="flex flex-col gap-6 print:gap-4">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg flex items-center justify-center">
                <span className="text-white font-bold text-2xl tracking-tighter">a</span>
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight">awajimaa</h1>
            </div>
            <div className="text-right text-sm text-muted-foreground flex flex-col gap-1">
              <span className="font-medium text-foreground print:text-black">lumgwunsolutions.com</span>
              <span className="font-medium">admin@lumgwunsolutions.com</span>
            </div>
          </div>
          
          <div>
            <h2 className="text-2xl font-semibold text-primary">Africa's All-in-One Business Operating System</h2>
            <div className="flex flex-wrap gap-2 mt-4">
              {['Awa Biz Suite', 'App Store', 'Mobile', 'AI Studio'].map((badge) => (
                <span key={badge} className="px-3 py-1 rounded-full text-xs font-semibold bg-muted text-foreground border border-border print:bg-gray-100 print:border-gray-200 uppercase tracking-wide">
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </header>

        {/* 2. Platform Overview */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:gap-4">
            <div className="p-6 rounded-2xl bg-card border border-card-border shadow-sm flex flex-col gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2">
                <LayoutDashboard size={20} />
              </div>
              <h3 className="font-bold text-lg">Awa Biz Suite</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Full business management. Payments, CRM, inventory, social, finance, marketing, AI, and mobile — in one platform.
              </p>
            </div>
            
            <div className="p-6 rounded-2xl bg-card border border-card-border shadow-sm flex flex-col gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center mb-2">
                <Store size={20} />
              </div>
              <h3 className="font-bold text-lg">Awajimaa App Store</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Africa's developer marketplace. Publish, discover, and download Android apps built for local markets. AI-powered quality review.
              </p>
            </div>
            
            <div className="p-6 rounded-2xl bg-card border border-card-border shadow-sm flex flex-col gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2">
                <Smartphone size={20} />
              </div>
              <h3 className="font-bold text-lg">Mobile App Builder</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Generate a branded Android APK in 20 minutes. No code required. Auto-listed on the App Store.
              </p>
            </div>
          </div>
        </section>

        {/* 3. Awa Biz Suite Capabilities */}
        <section className="space-y-6 print:space-y-4">
          <h3 className="text-xl font-bold border-b border-border pb-3">Biz Suite Capabilities</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-12 print:gap-y-6">
            <div className="flex gap-4 items-start">
              <div className="mt-0.5 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <CreditCard size={16} />
              </div>
              <div>
                <h4 className="font-bold text-base mb-1">Payments</h4>
                <p className="text-sm text-muted-foreground leading-snug">9 gateways — Stripe, Paystack, Flutterwave, PayPal, Interswitch, Nomba, Squad, Remita, NowPayments</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="mt-0.5 w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0">
                <ShoppingCart size={16} />
              </div>
              <div>
                <h4 className="font-bold text-base mb-1">Commerce</h4>
                <p className="text-sm text-muted-foreground leading-snug">Products, inventory, orders, invoices, storefront builder</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="mt-0.5 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <LineChart size={16} />
              </div>
              <div>
                <h4 className="font-bold text-base mb-1">Finance</h4>
                <p className="text-sm text-muted-foreground leading-snug">Sales, expenses, investments, wallet, recurring billing</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="mt-0.5 w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0">
                <Users size={16} />
              </div>
              <div>
                <h4 className="font-bold text-base mb-1">CRM</h4>
                <p className="text-sm text-muted-foreground leading-snug">Leads, UTM tracking, website pixel, form capture, timelines</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="mt-0.5 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Megaphone size={16} />
              </div>
              <div>
                <h4 className="font-bold text-base mb-1">Marketing</h4>
                <p className="text-sm text-muted-foreground leading-snug">Email, SMS, and AI voice call campaigns</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="mt-0.5 w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0">
                <Share2 size={16} />
              </div>
              <div>
                <h4 className="font-bold text-base mb-1">Social</h4>
                <p className="text-sm text-muted-foreground leading-snug">Schedule and publish to Facebook, Instagram, LinkedIn, X</p>
              </div>
            </div>
          </div>
        </section>

        {/* 4. AI Studio */}
        <section className="space-y-6 print:space-y-4">
          <h3 className="text-xl font-bold border-b border-border pb-3">AI Studio</h3>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 bg-card border border-card-border px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition-transform hover:-translate-y-0.5">
              <ImageIcon size={18} className="text-primary" /> AI captions & images
            </div>
            <div className="flex items-center gap-2 bg-card border border-card-border px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition-transform hover:-translate-y-0.5">
              <Video size={18} className="text-accent" /> Multi-scene promo video generator
            </div>
            <div className="flex items-center gap-2 bg-card border border-card-border px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition-transform hover:-translate-y-0.5">
              <LayoutTemplate size={18} className="text-primary" /> Floor plan & diagram generator
            </div>
            <div className="flex items-center gap-2 bg-card border border-card-border px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition-transform hover:-translate-y-0.5">
              <Mic size={18} className="text-accent" /> AI voice call campaigns
            </div>
            <div className="flex items-center gap-2 bg-card border border-card-border px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition-transform hover:-translate-y-0.5">
              <FileSpreadsheet size={18} className="text-primary" /> Automated data analysis
            </div>
            <div className="flex items-center gap-2 bg-card border border-card-border px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition-transform hover:-translate-y-0.5">
              <CheckCircle size={18} className="text-accent" /> AI app review
            </div>
            <div className="flex items-center gap-2 bg-card border border-card-border px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition-transform hover:-translate-y-0.5">
              <PenTool size={18} className="text-primary" /> AI Content Studio
            </div>
          </div>
        </section>

        {/* 5. Business Model */}
        <section className="space-y-6 print:space-y-4">
          <h3 className="text-xl font-bold border-b border-border pb-3">Business Model</h3>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground border-b border-border print:bg-gray-100">
                <tr>
                  <th className="px-6 py-4 font-bold text-foreground print:text-black w-[35%] uppercase tracking-wider text-xs">Stream</th>
                  <th className="px-6 py-4 font-bold text-foreground print:text-black uppercase tracking-wider text-xs">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-semibold">SaaS Subscriptions</td>
                  <td className="px-6 py-4 text-muted-foreground">Free · Growth · Pro · Enterprise tiers</td>
                </tr>
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-semibold">App Store Fee</td>
                  <td className="px-6 py-4 text-muted-foreground">One-time $15 publishing fee per app</td>
                </tr>
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-semibold">Pay-as-you-go</td>
                  <td className="px-6 py-4 text-muted-foreground">AI credits, voice minutes, SMS overage</td>
                </tr>
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-semibold">Platform Partnerships</td>
                  <td className="px-6 py-4 text-muted-foreground">Revenue share with connected businesses</td>
                </tr>
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-semibold flex items-center gap-2">
                    Mobile App Builder <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-accent/20 text-accent">Premium</span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">Premium add-on — branded APK generation</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 6. Footer */}
        <footer className="pt-8 pb-4 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-primary">Built for African businesses.</span>
            <span>Powered by AI.</span>
          </div>
          <div className="flex items-center gap-4 font-medium">
            <span className="text-foreground print:text-black">lumgwunsolutions.com</span>
            <span>·</span>
            <span className="text-foreground print:text-black">admin@lumgwunsolutions.com</span>
          </div>
          <div className="font-medium">© 2026 Awajimaa Technologies</div>
        </footer>
        
      </div>

      {/* Floating Download Button */}
      <button 
        onClick={handlePrint}
        className="fixed bottom-8 right-8 print-hidden bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_8px_30px_rgb(0,0,0,0.5)] rounded-full px-6 py-3.5 font-bold flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
      >
        <Download size={18} strokeWidth={2.5} />
        Download PDF
      </button>
    </div>
  );
}
