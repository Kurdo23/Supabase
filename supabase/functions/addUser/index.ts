import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Récupération des variables d'environnement
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Création du client Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// En-têtes CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

// Edge Function
Deno.serve(async (req) => {
  // Gérer les requêtes OPTIONS pour le pré-vol CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Récupérer l'objet utilisateur depuis le corps JSON
    const userProfil = await req.json();

    if (!userProfil || !userProfil.id) {
      return new Response(
          JSON.stringify({ error: "Paramètres utilisateur manquants ou invalides" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insérer l'utilisateur dans la table "User"
    const { error } = await supabase
        .from("User")
        .insert({
          idUser: userProfil.id,
          name: userProfil.name,
          lastname: userProfil.lastname,
          email: userProfil.email,
          username: userProfil.username,
          isadmin: userProfil.isadmin,
          dateinscription: userProfil.dateinscription,
          lastmodified: userProfil.lastmodified,
          xp: userProfil.xp
        });

    if (error) {
      console.error("Erreur addUser:", error.message);
      return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Erreur serveur:", err);
    return new Response(
        JSON.stringify({ success: false, error: "Erreur serveur" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
