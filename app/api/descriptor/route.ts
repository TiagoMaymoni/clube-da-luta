import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const BUCKET = "descritores";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function garantirBucket(supabase: ReturnType<typeof adminClient>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, { public: false });
  }
}

// GET /api/descriptor?academia_id=xxx
// Retorna todos os descritores da academia: { aluno_id: number[] }
export async function GET(req: Request) {
  const academia_id = new URL(req.url).searchParams.get("academia_id");
  if (!academia_id) return NextResponse.json({}, { status: 400 });

  const supabase = adminClient();
  await garantirBucket(supabase);

  const { data: files } = await supabase.storage.from(BUCKET).list(academia_id);
  if (!files || files.length === 0) return NextResponse.json({});

  const resultado: Record<string, number[]> = {};
  await Promise.all(
    files.map(async (f) => {
      const aluno_id = f.name.replace(".json", "");
      const { data } = await supabase.storage
        .from(BUCKET)
        .download(`${academia_id}/${f.name}`);
      if (data) {
        const text = await data.text();
        resultado[aluno_id] = JSON.parse(text);
      }
    })
  );

  return NextResponse.json(resultado);
}

// POST /api/descriptor
// Body: { academia_id, aluno_id, descriptor: number[] }
export async function POST(req: Request) {
  const { academia_id, aluno_id, descriptor } = await req.json();
  if (!academia_id || !aluno_id || !descriptor) {
    return NextResponse.json({ error: "dados incompletos" }, { status: 400 });
  }

  const supabase = adminClient();
  await garantirBucket(supabase);

  const json = JSON.stringify(descriptor);
  const blob = new Blob([json], { type: "application/json" });
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`${academia_id}/${aluno_id}.json`, blob, { upsert: true, contentType: "application/json" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/descriptor?academia_id=xxx&aluno_id=yyy
export async function DELETE(req: Request) {
  const params = new URL(req.url).searchParams;
  const academia_id = params.get("academia_id");
  const aluno_id = params.get("aluno_id");
  if (!academia_id || !aluno_id) return NextResponse.json({ error: "dados incompletos" }, { status: 400 });

  const supabase = adminClient();
  await supabase.storage.from(BUCKET).remove([`${academia_id}/${aluno_id}.json`]);
  return NextResponse.json({ ok: true });
}
