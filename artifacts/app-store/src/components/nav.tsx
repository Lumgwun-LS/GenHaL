import { Link, useLocation } from "wouter";
import { Search, Store, Code2, Shield, Menu, X } from "lucide-react";
import { useState } from "react";

export function Nav() {
  const [loc] = useLocation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const links = [
    { href: "/", label: "Browse", icon: Store },
    { href: "/developer", label: "Developer", icon: Code2 },
    { href: "/admin", label: "Admin", icon: Shield },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-[#07070f]/95 backdrop-blur border-b border-[#7F50FF]/15">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#7F50FF] to-[#FF7F50] flex items-center justify-center text-sm font-bold text-white">
            A
          </div>
          <span className="font-bold text-white text-lg hidden sm:block">
            Awajimaa <span className="text-[#7F50FF]">Store</span>
          </span>
        </Link>

        {/* Search bar */}
        <form
          className="flex-1 max-w-md mx-auto"
          onSubmit={(e) => { e.preventDefault(); if (q.trim()) window.location.href = `/search?q=${encodeURIComponent(q)}`; }}
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search apps..."
              className="w-full bg-[#0d0d1a] border border-[#7F50FF]/25 text-white placeholder-gray-500 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-[#7F50FF]/60 transition-colors"
            />
          </div>
        </form>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${loc === href ? "bg-[#7F50FF]/20 text-[#7F50FF]" : "text-gray-400 hover:text-white hover:bg-white/5"}`}>
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-gray-400 hover:text-white"
          onClick={() => setOpen(!open)}
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-[#7F50FF]/15 bg-[#07070f] px-4 py-3 flex flex-col gap-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-colors">
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
