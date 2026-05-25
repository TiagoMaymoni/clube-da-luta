"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient, createDbClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Camera, Image, ArrowLeft, X } from "lucide-react";
import Link from "next/link";

export default function EditarAlunoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [status, setStatus] = useState<"ativo" | "inativo">("ativo");
  const [fotoAtual, setFotoAtual] = useState<string | null>(null);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [academiaId, setAcademiaId] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  useEffect(() => {
    loadAluno();
  }, [id]);

  async function loadAluno() {
    try {
    const { data: { session } } = await createClient().auth.getSession();
    const user = session?.user;
    if (!user) { window.location.href = "/login"; return; }
    const supabase = createDbClient(session.access_token);

    const { data: academia } = await supabase.from("academias").select("id").eq("owner_id", user.id).single();
    if (academia) setAcademiaId(academia.id);

    const { data } = await supabase.from("alunos").select("*").eq("id", id).single();
    if (data) {
      setNome(data.nome);
      setTelefone(data.telefone || "");
      setObservacoes(data.observacoes || "");
      setStatus(data.status);
      setFotoAtual(data.foto_url);
    }
    } catch (err) {
      console.error("editar aluno error", err);
    } finally {
      setLoadingData(false);
    }
  }

  function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
    e.target.value = "";
  }

  function removerFoto() {
    setFotoFile(null);
    setFotoPreview(null);
    setFotoAtual(null);
  }

  async function autoCalibrar(academia_id: string, aluno_id: string, foto_url: string) {
    try {
      const fa = await import("face-api.js");
      await Promise.all([
        fa.nets.ssdMobilenetv1.loadFromUri("/models"),
        fa.nets.faceLandmark68Net.loadFromUri("/models"),
        fa.nets.faceRecognitionNet.loadFromUri("/models"),
      ]);
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const el = new Image(); el.crossOrigin = "anonymous";
        el.onload = () => res(el); el.onerror = rej;
        el.src = `/api/foto?url=${encodeURIComponent(foto_url)}`;
      });
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = Math.round(img.naturalHeight * (400 / img.naturalWidth));
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      const det = await fa.detectSingleFace(canvas, new fa.SsdMobilenetv1Options({ minConfidence: 0.2 }))
        .withFaceLandmarks().withFaceDescriptor();
      if (det) {
        await fetch("/api/descriptor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ academia_id, aluno_id, descriptor: Array.from(det.descriptor) }),
        });
        return true;
      }
    } catch {}
    return false;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { toast.error("Nome é obrigatório"); return; }
    setLoading(true);

    const { data: { session: submitSession } } = await createClient().auth.getSession();
    if (!submitSession) { toast.error("Sessão expirada"); setLoading(false); return; }
    const supabase = createDbClient(submitSession.access_token);
    let foto_url = fotoAtual;
    let fotoNova = false;

    if (fotoFile && academiaId) {
      const ext = fotoFile.name.split(".").pop() ?? "jpg";
      const fd = new FormData();
      fd.append("file", fotoFile);
      fd.append("path", `${academiaId}/${id}-${Date.now()}.${ext}`);
      const uploadRes = await fetch("/api/upload-foto", { method: "POST", body: fd });
      if (uploadRes.ok) {
        foto_url = (await uploadRes.json()).url;
        fotoNova = true;
      } else {
        toast.error("Erro no upload da foto");
        setLoading(false);
        return;
      }
    }

    const { error } = await supabase.from("alunos").update({
      nome: nome.trim(),
      telefone: telefone.trim() || null,
      observacoes: observacoes.trim() || null,
      status,
      foto_url,
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    if (error) { toast.error("Erro ao salvar"); setLoading(false); return; }

    // Calibração automática se foto foi alterada
    if (fotoNova && foto_url && academiaId) {
      const calibrado = await autoCalibrar(academiaId, id, foto_url);
      toast.success(calibrado
        ? "Aluno atualizado! Rosto calibrado automaticamente ✓"
        : "Aluno atualizado! Rosto não detectado na foto — calibre manualmente no perfil"
      );
    } else {
      toast.success("Aluno atualizado!");
    }

    router.push(`/alunos/${id}`);
  }

  async function handleInativar() {
    const { data: { session } } = await createClient().auth.getSession();
    if (!session) return;
    const supabase = createDbClient(session.access_token);
    await supabase.from("alunos").update({ status: "inativo" }).eq("id", id);
    toast.success("Aluno inativado");
    router.push("/alunos");
  }

  if (loadingData) {
    return <div className="flex items-center justify-center h-full"><p className="text-[#555] font-heading tracking-widest">CARREGANDO...</p></div>;
  }

  const fotoExibida = fotoPreview || fotoAtual;

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Link href={`/alunos/${id}`} className="text-[#A3A3A3] hover:text-white transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <h1 className="font-heading text-3xl text-white tracking-widest">EDITAR ALUNO</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Foto */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-32 h-32 rounded-full bg-[#1A1A1A] border-2 border-[#2A2A2A] overflow-hidden">
              {fotoExibida ? (
                <img src={fotoExibida} alt="Foto" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#555]">
                  <Camera size={40} />
                </div>
              )}
            </div>
            {fotoExibida && (
              <button type="button" onClick={removerFoto} className="absolute -top-1 -right-1 w-7 h-7 bg-[#DC2626] rounded-full flex items-center justify-center hover:bg-[#B91C1C]">
                <X size={14} className="text-white" />
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <label htmlFor="foto-camera" className="cursor-pointer flex items-center gap-2 px-5 py-3 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-heading text-sm tracking-widest rounded-xl transition-colors uppercase">
              <Camera size={18} /> Tirar Foto
            </label>
            <label htmlFor="foto-galeria" className="cursor-pointer flex items-center gap-2 px-5 py-3 bg-[#1A1A1A] hover:bg-[#222] text-[#A3A3A3] border border-[#2A2A2A] font-heading text-sm tracking-widest rounded-xl transition-colors uppercase">
              <Image size={18} /> Galeria
            </label>
          </div>
          <input id="foto-camera" type="file" accept="image/*" capture="environment" onChange={handleFotoChange} className="hidden" />
          <input id="foto-galeria" type="file" accept="image/*" onChange={handleFotoChange} className="hidden" />
        </div>

        {/* Nome */}
        <div className="space-y-2">
          <Label className="text-[#E5E5E5] text-xs uppercase tracking-widest">Nome completo *</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} required className="h-14 bg-[#1A1A1A] border-[#2A2A2A] text-white focus:border-[#DC2626] rounded-xl text-base" />
        </div>

        {/* Telefone */}
        <div className="space-y-2">
          <Label className="text-[#E5E5E5] text-xs uppercase tracking-widest">Telefone / WhatsApp</Label>
          <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} type="tel" placeholder="(11) 99999-9999" className="h-14 bg-[#1A1A1A] border-[#2A2A2A] text-white focus:border-[#DC2626] rounded-xl text-base" />
        </div>

        {/* Status */}
        <div className="space-y-2">
          <Label className="text-[#E5E5E5] text-xs uppercase tracking-widest">Status</Label>
          <div className="flex gap-3">
            {(["ativo", "inativo"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setStatus(s)}
                className={`flex-1 h-12 rounded-xl font-heading text-sm tracking-widest uppercase transition-colors ${status === s ? "bg-[#DC2626] text-white" : "bg-[#1A1A1A] text-[#A3A3A3] border border-[#2A2A2A]"}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Observações */}
        <div className="space-y-2">
          <Label className="text-[#E5E5E5] text-xs uppercase tracking-widest">Observações</Label>
          <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3}
            className="w-full p-4 bg-[#1A1A1A] border border-[#2A2A2A] text-white focus:border-[#DC2626] rounded-xl text-base focus:outline-none resize-none" />
        </div>

        <Button type="submit" disabled={loading} className="w-full h-14 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-heading text-xl tracking-widest rounded-xl uppercase">
          {loading ? "SALVANDO..." : "SALVAR ALTERAÇÕES"}
        </Button>
      </form>
    </div>
  );
}
