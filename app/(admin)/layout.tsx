"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Settings,
  LogOut,
  CheckSquare,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/alunos", label: "Alunos", icon: Users },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/configuracoes", label: "Config", icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") {
        if (session) {
          setAuthed(true);
        } else {
          window.location.href = "/login";
        }
      } else if (event === "SIGNED_OUT") {
        window.location.href = "/login";
      } else if (session) {
        setAuthed(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (!authed) {
    return (
      <div className="flex h-screen bg-[#0A0A0A] items-center justify-center">
        <p className="text-[#555] font-heading tracking-widest text-sm">VERIFICANDO...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0A0A0A] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-16 md:w-56 flex flex-col bg-[#111] border-r border-[#2A2A2A] flex-shrink-0">
        {/* Logo */}
        <div className="h-16 flex items-center justify-center md:justify-start px-4 border-b border-[#2A2A2A]">
          <span className="font-heading text-white text-lg hidden md:block tracking-widest">
            CLUBE DA LUTA
          </span>
          <span className="font-heading text-[#DC2626] text-xl md:hidden">CL</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-xl transition-colors",
                  active
                    ? "bg-[#DC2626] text-white"
                    : "text-[#A3A3A3] hover:bg-[#1A1A1A] hover:text-white"
                )}
              >
                <Icon size={20} className="flex-shrink-0" />
                <span className="hidden md:block text-sm font-medium uppercase tracking-wider">
                  {label}
                </span>
              </Link>
            );
          })}

          <Link
            href="/checkin"
            target="_blank"
            className="flex items-center gap-3 px-3 py-3 rounded-xl text-[#A3A3A3] hover:bg-[#1A1A1A] hover:text-white transition-colors"
          >
            <CheckSquare size={20} className="flex-shrink-0" />
            <span className="hidden md:block text-sm font-medium uppercase tracking-wider">
              Check-in
            </span>
          </Link>
        </nav>

        {/* Logout */}
        <div className="p-2 border-t border-[#2A2A2A]">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[#A3A3A3] hover:bg-[#1A1A1A] hover:text-red-400 transition-colors"
          >
            <LogOut size={20} className="flex-shrink-0" />
            <span className="hidden md:block text-sm font-medium uppercase tracking-wider">
              Sair
            </span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
