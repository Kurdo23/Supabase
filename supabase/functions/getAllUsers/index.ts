import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Récupère les variables d'environnement
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Crée le client Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// En-têtes CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

// Serve l'Edge Function
Deno.serve(async (req) => {
  // Autoriser OPTIONS pour le pré-vol CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Récupère tous les utilisateurs depuis la table "User"
    const { data, error } = await supabase.from("User").select();

    if (error) {
      console.error("Erreur fetchUsers:", error.message);
      return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
        JSON.stringify(data),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Erreur serveur:", err);
    return new Response(
        JSON.stringify({ error: "Erreur serveur" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
