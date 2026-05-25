"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) {
      toast.error("Email ou senha incorretos");
      setLoading(false);
      return;
    }
    window.location.href = "/dashboard";
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] cage-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="mb-4">
            <Image
              src="/logo.png"
              alt="Clube da Luta"
              width={320}
              height={445}
              priority
              style={{ clipPath: "ellipse(44% 32% at 50% 47%)" }}
            />
          </div>
          <p className="text-[#A3A3A3] text-xs tracking-widest uppercase">Sistema de Gestão</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-[#E5E5E5] text-sm uppercase tracking-wider">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="professor@email.com"
              required
              className="h-14 bg-[#1A1A1A] border-[#2A2A2A] text-white placeholder:text-[#555] focus:border-[#DC2626] focus:ring-[#DC2626] rounded-xl text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="senha" className="text-[#E5E5E5] text-sm uppercase tracking-wider">
              Senha
            </Label>
            <Input
              id="senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              required
              className="h-14 bg-[#1A1A1A] border-[#2A2A2A] text-white placeholder:text-[#555] focus:border-[#DC2626] focus:ring-[#DC2626] rounded-xl text-base"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-14 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-heading text-xl tracking-widest rounded-xl glow-red mt-6 uppercase"
          >
            {loading ? "ENTRANDO..." : "ENTRAR"}
          </Button>
        </form>

        {/* Modo check-in link */}
        <div className="mt-8 text-center">
          <a
            href="/checkin"
            className="text-[#A3A3A3] text-sm hover:text-[#DC2626] transition-colors uppercase tracking-wider"
          >
            → Abrir Modo Check-in
          </a>
        </div>
      </div>
    </div>
  );
}
