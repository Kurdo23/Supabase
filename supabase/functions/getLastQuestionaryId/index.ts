import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
};

function jsonOk(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: corsHeaders,
    });
}

function jsonError(message: string, status = 400): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: corsHeaders,
    });
}

Deno.serve(async (req: Request): Promise<Response> => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // Authentification
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return jsonError("Missing or invalid Authorization header", 401);
        }

        const token = authHeader.replace("Bearer ", "");

        // Créer un client avec l'ANON_KEY et le token utilisateur pour l'auth
        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: {
                    Authorization: authHeader,
                },
            },
        });

        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
        if (authError || !user) {
            return jsonError("Utilisateur non authentifié", 401);
        }

        const authenticatedUserId = user.id;

        // Récupérer le body
        const { userId } = await req.json();

        if (!userId) {
            return jsonError("Missing userId", 400);
        }

        // Vérifier que l'utilisateur authentifié demande ses propres données
        // ou est admin
        if (userId !== authenticatedUserId) {
            const { data: userProfile } = await supabase
                .from("User")
                .select("isadmin")
                .eq("idUser", authenticatedUserId)
                .maybeSingle();

            if (!userProfile?.isadmin) {
                return jsonError("Accès refusé : vous ne pouvez consulter que vos propres données", 403);
            }
        }

        // Récupérer le dernier questionnaire
        const { data: questionary, error } = await supabase
            .from("Questionary")
            .select("idQuestionary, dateSended")
            .eq("idUser", userId)
            .order("dateSended", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error("Error fetching questionary:", error);
            return jsonError("Erreur lors de la récupération du questionnaire", 500);
        }

        if (!questionary) {
            return jsonOk({ idQuestionary: null, dateSended: null });
        }

        return jsonOk({
            idQuestionary: questionary.idQuestionary,
            dateSended: questionary.dateSended
        });

    } catch (error) {
        console.error("Unexpected error:", error);
        return jsonError("Erreur serveur interne: " + error.message, 500);
    }
});