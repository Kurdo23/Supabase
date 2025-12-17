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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "DELETE, PATCH, OPTIONS"
};

// Serve l'Edge Function
Deno.serve(async (req) => {
  // Autoriser OPTIONS pour le pré-vol CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Récupérer l'ID utilisateur depuis l'URL
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    const userId = pathParts[pathParts.length - 1];

    if (!userId || userId === "delete-user") {
      return new Response(
          JSON.stringify({ error: "ID utilisateur manquant" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PATCH : Restaurer un utilisateur (annuler soft delete)
    if (req.method === "PATCH") {
      const { data, error } = await supabase
          .from("User")
          .update({ isSoftDelete: false, lastmodified: new Date().toISOString() })
          .eq("idUser", userId)
          .eq("isSoftDelete", true) // Seulement les utilisateurs soft deleted
          .select();

      if (error) {
        console.error("Erreur restore:", error.message);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!data || data.length === 0) {
        return new Response(
            JSON.stringify({ error: "Utilisateur non trouvé ou non supprimé" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
          JSON.stringify({
            success: true,
            message: "Utilisateur restauré avec succès",
            user: data[0]
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // DELETE : Supprimer un utilisateur
    if (req.method !== "DELETE") {
      return new Response(
          JSON.stringify({ error: "Méthode non autorisée. Utilisez DELETE ou PATCH." }),
          { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Récupérer le type de suppression depuis les query params
    const deleteType = url.searchParams.get("type") || "soft"; // "soft" ou "hard"

    if (deleteType === "soft") {
      // Soft delete : marquer l'utilisateur comme supprimé
      const { data, error } = await supabase
          .from("User")
          .update({ isSoftDelete: true, lastmodified: new Date().toISOString() })
          .eq("idUser", userId)
          .select();

      if (error) {
        console.error("Erreur soft delete:", error.message);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!data || data.length === 0) {
        return new Response(
            JSON.stringify({ error: "Utilisateur non trouvé" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
          JSON.stringify({
            success: true,
            message: "Utilisateur supprimé (soft delete)",
            user: data[0]
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (deleteType === "hard") {
      // Hard delete : supprimer définitivement l'utilisateur
      // ATTENTION : Cela supprime toutes les données associées en cascade

      // Vérifier d'abord si l'utilisateur existe
      const { data: existingUser, error: checkError } = await supabase
          .from("User")
          .select("idUser")
          .eq("idUser", userId)
          .single();

      if (checkError || !existingUser) {
        return new Response(
            JSON.stringify({ error: "Utilisateur non trouvé" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Supprimer l'utilisateur (les contraintes ON DELETE CASCADE supprimeront les données liées)
      const { error: deleteError } = await supabase
          .from("User")
          .delete()
          .eq("idUser", userId);

      if (deleteError) {
        console.error("Erreur hard delete:", deleteError.message);
        return new Response(
            JSON.stringify({ error: deleteError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Supprimer aussi l'utilisateur de auth.users si nécessaire
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);

      if (authDeleteError) {
        console.warn("Erreur suppression auth:", authDeleteError.message);
        // On continue même si la suppression auth échoue
      }

      return new Response(
          JSON.stringify({
            success: true,
            message: "Utilisateur supprimé définitivement (hard delete)"
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else {
      return new Response(
          JSON.stringify({ error: "Type de suppression invalide. Utilisez 'soft' ou 'hard'." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (err) {
    console.error("Erreur serveur:", err);
    return new Response(
        JSON.stringify({ error: "Erreur serveur", details: err.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});