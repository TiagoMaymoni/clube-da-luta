import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function GET() {
  const supabase = adminClient();

  const { data: academia, error: acadErr } = await supabase
    .from("academias")
    .select("id, valor_aula, pin_checkin")
    .limit(1)
    .single();

  if (acadErr || !academia) {
    return NextResponse.json({ error: "academia not found" }, { status: 404 });
  }

  const { data: alunos } = await supabase
    .from("alunos")
    .select("id, nome, foto_url, aulas_credito, status")
    .eq("academia_id", academia.id)
    .eq("status", "ativo")
    .order("nome");

  return NextResponse.json({ academia, alunos: alunos || [] });
}

export async function POST(req: Request) {
  const supabase = adminClient();
  const { aluno_id, academia_id, valor, aulas_credito } = await req.json();

  if (!aluno_id || !academia_id || !valor) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const agora = new Date();
  const hoje = agora.toISOString().split("T")[0];
  const hora = agora.toTimeString().split(" ")[0];
  const temCredito = (aulas_credito || 0) > 0;

  const { error } = await supabase.from("aulas").insert({
    aluno_id,
    academia_id,
    data_aula: hoje,
    hora_aula: hora,
    valor,
    status: temCredito ? "paga" : "pendente",
    origem: temCredito ? "credito" : "checkin",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (temCredito) {
    await supabase
      .from("alunos")
      .update({ aulas_credito: aulas_credito - 1 })
      .eq("id", aluno_id);
  }

  return NextResponse.json({ ok: true });
}
