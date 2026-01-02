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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"
};

// Fonction helper pour vérifier si l'utilisateur est admin
async function isAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
      .from("User")
      .select("isadmin")
      .eq("idUser", userId)
      .single();

  if (error || !data) {
    return false;
  }

  return data.isadmin === true;
}

// Fonction helper pour extraire userId du token JWT
function getUserIdFromRequest(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  try {
    const token = authHeader.replace("Bearer ", "");
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));
    return payload.sub || null;
  } catch {
    return null;
  }
}

// Edge Function
Deno.serve(async (req) => {
  // Gérer les requêtes OPTIONS pour le pré-vol CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Récupérer l'utilisateur connecté
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return new Response(
          JSON.stringify({ error: "Non authentifié" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Vérifier que l'utilisateur est admin
    const userIsAdmin = await isAdmin(userId);
    if (!userIsAdmin) {
      return new Response(
          JSON.stringify({ error: "Accès refusé: Admin uniquement" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // GET /user-reports - Liste des signalements
    if (method === "GET" && path === "/user-reports") {
      const status = url.searchParams.get("status");
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = parseInt(url.searchParams.get("offset") || "0");

      let query = supabase
          .from("user_reports")
          .select(`
          *,
          user:User!user_reports_user_id_fkey (
            idUser,
            name,
            lastname,
            username,
            email,
            avatar
          )
        `)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

      // Filtrer par status si spécifié (si null ou "all", pas de filtre)
      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Erreur fetch reports:", error.message);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
          JSON.stringify(data || []),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PATCH /user-reports/:id/require-profile-edit - Forcer modification profil
    if (method === "PATCH" && path.includes("/require-profile-edit")) {
      const reportId = path.split("/")[2];
      const { reason } = await req.json();

      if (!reportId) {
        return new Response(
            JSON.stringify({ error: "ID de signalement manquant" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Récupérer le signalement
      const { data: report, error: fetchError } = await supabase
          .from("user_reports")
          .select("user_id")
          .eq("id", reportId)
          .single();

      if (fetchError || !report) {
        return new Response(
            JSON.stringify({ error: "Signalement introuvable" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Mettre à jour l'utilisateur signalé
      const { error: updateUserError } = await supabase
          .from("User")
          .update({
            profile_modification_required: true,
            profile_modification_reason: reason || "Contenu de profil inapproprié détecté"
          })
          .eq("idUser", report.user_id);

      if (updateUserError) {
        console.error("Erreur update user:", updateUserError.message);
        return new Response(
            JSON.stringify({ error: "Erreur lors de la mise à jour du profil" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Mettre à jour le signalement
      const { error: updateReportError } = await supabase
          .from("user_reports")
          .update({
            status: "reviewed",
            reviewed_at: new Date().toISOString(),
            reviewed_by: userId,
            admin_notes: reason
          })
          .eq("id", reportId);

      if (updateReportError) {
        console.error("Erreur update report:", updateReportError.message);
      }

      return new Response(
          JSON.stringify({ success: true, message: "Modification de profil requise" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PATCH /user-reports/:id/dismiss - Ignorer le signalement
    if (method === "PATCH" && path.includes("/dismiss")) {
      const reportId = path.split("/")[2];
      const { adminNotes } = await req.json();

      if (!reportId) {
        return new Response(
            JSON.stringify({ error: "ID de signalement manquant" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Récupérer le signalement pour avoir l'user_id
      const { data: report, error: fetchError } = await supabase
          .from("user_reports")
          .select("user_id")
          .eq("id", reportId)
          .single();

      if (fetchError || !report) {
        return new Response(
            JSON.stringify({ error: "Signalement introuvable" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Mettre à jour le signalement
      const { error: updateError } = await supabase
          .from("user_reports")
          .update({
            status: "dismissed",
            reviewed_at: new Date().toISOString(),
            reviewed_by: userId,
            admin_notes: adminNotes || null
          })
          .eq("id", reportId);

      if (updateError) {
        console.error("Erreur update report:", updateError.message);
        return new Response(
            JSON.stringify({ error: updateError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Vérifier s'il reste des signalements actifs pour cet utilisateur
      const { data: activeReports } = await supabase
          .from("user_reports")
          .select("id")
          .eq("user_id", report.user_id)
          .in("status", ["pending", "reviewed"])
          .limit(1);

      // Si aucun signalement actif, débloquer le profil
      if (!activeReports || activeReports.length === 0) {
        await supabase
            .from("User")
            .update({
              profile_modification_required: false,
              profile_modification_reason: null
            })
            .eq("idUser", report.user_id);
      }

      return new Response(
          JSON.stringify({ success: true, message: "Signalement ignoré" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Route non trouvée
    return new Response(
        JSON.stringify({ error: "Route non trouvée" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Erreur serveur:", err);
    return new Response(
        JSON.stringify({ error: "Erreur serveur" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
