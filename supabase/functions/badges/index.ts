import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Variables d'environnement
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Client Supabase
const supabase = createClient(supabaseUrl!, supabaseKey!);

// CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

// Helper JSON
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  // Préflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathSegments = url.pathname.split("/").filter(Boolean); // ex: ["badges", "user", ":idUser"]

  try {
    // ================= GET /badges/user/:idUser =================
    if (
        req.method === "GET" &&
        pathSegments[0] === "badges" &&
        pathSegments[1] === "user" &&
        pathSegments.length === 3
    ) {
      const idUser = pathSegments[2];

      // On récupère les badges liés à l'utilisateur via la table de jointure
      const { data, error } = await supabase
          .from("BadgesOwned")
          .select(
              `
            idUser,
            idBadge,
            Badge (
              idBadge,
              name,
              description,
              idChallenge,
              badgeDate
            )
          `
          )
          .eq("idUser", idUser);

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      // Option : renvoyer seulement la liste des Badge
      const badges = (data ?? []).map((row: any) => row.Badge);
      return jsonResponse(badges);
    }

    // ================= POST /badges/add =================
    // Crée un badge dans la table Badge
    if (
        req.method === "POST" &&
        pathSegments[0] === "badges" &&
        pathSegments[1] === "add"
    ) {
      const payload = await req.json();

      const { name, description, idChallenge, badgeDate } = payload;

      if (!name) {
        return jsonResponse(
            { success: false, error: "Le champ 'name' est obligatoire" },
            400
        );
      }

      if (!description) {
        return jsonResponse(
            { success: false, error: "Le champ 'name' est obligatoire" },
            400
        );
      }

      // Création du badge
      const { data: createdBadge, error: insertError } = await supabase
          .from("Badge")
          .insert({
            name,
            description,
            idChallenge,
            badgeDate: badgeDate ?? new Date().toISOString(),
          })
          .select()
          .single();

      if (insertError || !createdBadge) {
        return jsonResponse(
            { success: false, error: insertError?.message ?? "Erreur création badge" },
            500
        );
      }

      return jsonResponse({ success: true, badge: createdBadge }, 201);
    }

    // ================= PUT /badges/:idBadge =================
    if (
        req.method === "PUT" &&
        pathSegments[0] === "badges" &&
        pathSegments.length === 2
    ) {
      const idBadge = pathSegments[1];
      const body = await req.json();

      const { name, description, idChallenge, badgeDate } = body;

      const { data, error } = await supabase
          .from("Badge")
          .update({
            ...(name !== undefined && { name }),
            ...(description !== undefined && { description }),
            ...(idChallenge !== undefined && { idChallenge }),
            ...(badgeDate !== undefined && { badgeDate }),
          })
          .eq("idBadge", idBadge)
          .select()
          .single();

      if (error) {
        return jsonResponse({ success: false, error: error.message }, 500);
      }

      return jsonResponse({ success: true, badge: data });
    }

    // ================= DELETE /badges/:idBadge =================
    if (
        req.method === "DELETE" &&
        pathSegments[0] === "badges" &&
        pathSegments.length === 2
    ) {
      const idBadge = pathSegments[1];

      // On supprime d'abord les liens dans BadgesOwned
      const { error: relError } = await supabase
          .from("BadgesOwned")
          .delete()
          .eq("idBadge", idBadge);

      if (relError) {
        return jsonResponse(
            { success: false, error: `Erreur suppression relations: ${relError.message}` },
            500
        );
      }

      // Puis on supprime le badge lui-même
      const { error: badgeError } = await supabase
          .from("Badge")
          .delete()
          .eq("idBadge", idBadge);

      if (badgeError) {
        return jsonResponse(
            { success: false, error: `Erreur suppression badge: ${badgeError.message}` },
            500
        );
      }

      return jsonResponse({ success: true });
    }

    // ================= POST /badges/link =================
    // Lie un badge existant à un utilisateur dans BadgesOwned
    if (
        req.method === "POST" &&
        pathSegments[0] === "badges" &&
        pathSegments[1] === "link"
    ) {
      const payload = await req.json();
      const { idUser, idBadge } = payload;

      if (!idUser || !idBadge) {
        return jsonResponse(
            { success: false, error: "Les champs 'idUser' et 'idBadge' sont obligatoires" },
            400
        );
      }

      const { error } = await supabase
          .from("BadgesOwned")
          .insert({ idUser, idBadge });

      if (error) {
        return jsonResponse(
            { success: false, error: error.message },
            500
        );
      }

      return jsonResponse({ success: true }, 201);
    }

    // Route non trouvée
    return jsonResponse({ error: "Route non trouvée" }, 404);
  } catch (err) {
    console.error("badgesEdge function error:", err);
    return jsonResponse(
        {
          error:
              err instanceof Error ? err.message : "Erreur serveur dans la fonction badges",
        },
        500
    );
  }
});
