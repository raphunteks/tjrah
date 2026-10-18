import { createClient } from "@supabase/supabase-js";

const url = (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) || (typeof process !== "undefined" ? process.env?.VITE_SUPABASE_URL : undefined);
const key = (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) || (typeof process !== "undefined" ? process.env?.VITE_SUPABASE_ANON_KEY : undefined);

export const HAS_SUPABASE = Boolean(url && key && !url.includes("xxxx"));
export const supabase = HAS_SUPABASE ? createClient(url, key) : null;
