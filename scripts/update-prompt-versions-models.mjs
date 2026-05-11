import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env", override: false });

const updates = [
  { prompt_name: "criador", model: "gpt-5.4-2026-03-05" },
  { prompt_name: "cliente", model: "gpt-5.4-2026-03-05" },
  { prompt_name: "moderador", model: "gpt-5.4-mini-2026-03-17" },
  { prompt_name: "intencao", model: "gpt-5.4-mini-2026-03-17" },
  { prompt_name: "gerente", model: "gpt-5.4-2026-03-05" }
];

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const results = [];
for (const { prompt_name, model } of updates) {
  const { data, error } = await supabase
    .from("prompt_versions")
    .update({ model })
    .eq("prompt_name", prompt_name)
    .select("id, prompt_name, version, model, is_active");

  if (error) {
    console.error(`update failed for ${prompt_name}:`, error.message);
    process.exit(1);
  }

  results.push(...(data ?? []).map((r) => ({ ...r })));
}

console.log(JSON.stringify(results, null, 2));
