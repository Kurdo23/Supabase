import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Variables d'environnement
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); // clé admin côté serveur
// Client Supabase unique avec role key
const supabase = createClient(supabaseUrl, supabaseKey);
// CORS
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
};
// Helper JSON
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
        }
    });
}
// Edge Function
Deno.serve(async (req)=>{
    // Préflight CORS
    if (req.method === "OPTIONS") return new Response(null, {
        headers: corsHeaders
    });
    const url = new URL(req.url);
    const pathSegments = url.pathname.split("/").filter(Boolean);
    try {
        // ================= POST /users/add (ajout d'un utilisateur) =================
        if (req.method === "POST" && req.url.endsWith("/users/add")) {
            const userProfil = await req.json();
            if (!userProfil?.idUser) {
                return jsonResponse({ success: false, error: "Paramètres utilisateur invalides" }, 400);
            }

            // Insertion dans la table "User"
            const { error } = await supabase.from("User").insert({
                idUser: userProfil.idUser,
                name: userProfil.name,
                lastname: userProfil.lastname,
                email: userProfil.email,
                username: userProfil.username,
                isadmin: userProfil.isadmin,
                dateinscription: userProfil.dateinscription,
                lastmodified: userProfil.lastmodified,
                xp: userProfil.xp,
                isSoftDelete: userProfil.isSoftDelete ?? false,
                last_sign_in_at: userProfil.last_sign_in_at ?? new Date().toISOString(),
                avatar: userProfil.avatar ?? "",
                first_login: userProfil.first_login
            });

            if (error) {
                return jsonResponse({ success: false, error: error.message }, 400);
            }
            return jsonResponse({ success: true });
        }
        // ================= GET /users/all (récupérer tous les utilisateurs) =================
        if (req.method === "GET" && pathSegments[0] === "users" && pathSegments[1] === "all") {
            const { data, error } = await supabase.from("User").select();
            if (error) return jsonResponse({
                error: error.message
            }, 500);
            return jsonResponse(data);
        }

        // ================= GET /users/:id (récupérer un utilisateur précis) =================
        if (req.method === "GET" && pathSegments[0] === "users" && pathSegments.length === 2) {
            const id = pathSegments[1];
            const { data: user, error } = await supabase.from("User").select().eq("idUser", id).maybeSingle();
            if (error || !user) return jsonResponse({
                error: "Utilisateur introuvable"
            }, 404);
            return jsonResponse(user);
        }

        // ================= PUT /users/update/:id =================
        if (req.method === "PUT" && pathSegments[0] === "users" && pathSegments[1] === "update" && pathSegments[2]) {
            const id = pathSegments[2];
            const updatedData = await req.json();

            const { error } = await supabase.from("User").update(updatedData).eq("idUser", id);

            if (error) {
                return jsonResponse({ success: false, error: error.message }, 400);
            }

            return jsonResponse({ success: true });
        }

        return jsonResponse({
            error: "Route non trouvée"
        }, 404);
    } catch (err) {
        console.error("usersEdge function error:", err);
        return jsonResponse({
            error: err instanceof Error ? err.message : "Erreur serveur"
        }, 500);
    }
});
