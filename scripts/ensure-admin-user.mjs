import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const email = (process.argv[2] ?? "rdnaves@gmail.com").trim().toLowerCase();
const name = process.argv[3] ?? "Rodrigo Naves";

// Check if exists
const { data: existing } = await supabase
  .from("users")
  .select("id, name, email, level, is_active")
  .eq("email", email)
  .maybeSingle();

if (existing) {
  console.log("user already exists:", existing);
  process.exit(0);
}

// Pick any company so the FK is happy (admin user doesn't need a real company)
const { data: company } = await supabase
  .from("companies")
  .select("id, trade_name")
  .limit(1)
  .maybeSingle();

const { data: inserted, error } = await supabase
  .from("users")
  .insert({
    company_id: company?.id ?? null,
    name,
    email,
    level: 3,
    is_active: true
  })
  .select("id, name, email, level, company_id")
  .single();

if (error) {
  console.error("insert failed:", error.message);
  process.exit(1);
}
console.log("admin user inserted:", inserted);
