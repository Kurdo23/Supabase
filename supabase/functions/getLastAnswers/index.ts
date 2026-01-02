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

        // Récupérer le dernier questionnaire non-simulation
        const { data: lastQuestionary, error: questionaryError } = await supabase
            .from("Questionary")
            .select("idQuestionary")
            .eq("idUser", userId)
            .eq("isSimulation", false)
            .order("dateSended", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (questionaryError) {
            console.error("Error fetching questionary:", questionaryError);
            return jsonError("Erreur lors de la récupération du questionnaire", 500);
        }

        // Si aucun questionnaire, retourner un objet vide
        if (!lastQuestionary) {
            return jsonOk({ answers: {} });
        }

        // Récupérer les réponses encodées
        const { data: encodedAnswers, error: encodedError } = await supabase
            .from("EncodedAnswer")
            .select("idQuestion, value")
            .eq("idQuestionary", lastQuestionary.idQuestionary);

        if (encodedError) {
            console.error("Error fetching encoded answers:", encodedError);
            return jsonError("Erreur lors de la récupération des réponses encodées", 500);
        }

        // Récupérer les choix multiples
        const { data: choices, error: choicesError } = await supabase
            .from("Choice")
            .select("idMultipleChoicesAnswer, MultipleChoicesAnswer!inner(idQuestion)")
            .eq("idQuestionary", lastQuestionary.idQuestionary);

        if (choicesError) {
            console.error("Error fetching choices:", choicesError);
            return jsonError("Erreur lors de la récupération des choix", 500);
        }

        // Construire l'objet answers
        const answers: Record<number, { value: string | number; isMultipleChoice: boolean }> = {};

        encodedAnswers?.forEach((answer: any) => {
            answers[answer.idQuestion] = {
                value: answer.value,
                isMultipleChoice: false,
            };
        });

        choices?.forEach((choice: any) => {
            const idQuestion = choice.MultipleChoicesAnswer.idQuestion;
            answers[idQuestion] = {
                value: choice.idMultipleChoicesAnswer,
                isMultipleChoice: true,
            };
        });

        return jsonOk({ answers });

    } catch (error) {
        console.error("Unexpected error:", error);
        return jsonError("Erreur serveur interne: " + error.message, 500);
    }
});