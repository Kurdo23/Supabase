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

        // Récupérer le dernier questionnaire de l'utilisateur
        const { data: questionary, error: qError } = await supabase
            .from("Questionary")
            .select("idQuestionary")
            .eq("idUser", userId)
            .order("dateSended", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (qError) {
            console.error("Error fetching questionary:", qError);
            return jsonError("Erreur lors de la récupération du questionnaire", 500);
        }

        // Si aucun questionnaire, retourner un tableau vide
        if (!questionary) {
            return jsonOk([]);
        }

        const questionaryId = questionary.idQuestionary;

        // Récupérer toutes les questions avec leurs réponses possibles
        const { data: questions, error: questionsError } = await supabase
            .from("Question")
            .select("idQuestion, description, MultipleChoicesAnswer(idMultipleChoicesAnswer, name)")
            .order("idQuestion");

        if (questionsError) {
            console.error("Error fetching questions:", questionsError);
            return jsonError("Erreur lors de la récupération des questions", 500);
        }

        // Récupérer les choix multiples pour ce questionnaire
        const { data: choices, error: choicesError } = await supabase
            .from("Choice")
            .select("idMultipleChoicesAnswer")
            .eq("idQuestionary", questionaryId);

        if (choicesError) {
            console.error("Error fetching choices:", choicesError);
            return jsonError("Erreur lors de la récupération des choix", 500);
        }

        // Récupérer les réponses encodées pour ce questionnaire
        const { data: encodedAnswers, error: encodedError } = await supabase
            .from("EncodedAnswer")
            .select("idQuestion, value")
            .eq("idQuestionary", questionaryId);

        if (encodedError) {
            console.error("Error fetching encoded answers:", encodedError);
            return jsonError("Erreur lors de la récupération des réponses encodées", 500);
        }

        // Construire le résumé
        const summary = (questions ?? []).map((q) => {
            // Vérifier si c'est un choix multiple
            const choice = choices?.find((c) =>
                q.MultipleChoicesAnswer?.some((m) => m.idMultipleChoicesAnswer === c.idMultipleChoicesAnswer)
            );

            if (choice) {
                const selected = q.MultipleChoicesAnswer?.find(
                    (m) => m.idMultipleChoicesAnswer === choice.idMultipleChoicesAnswer
                );
                return {
                    question: q.description,
                    answer: selected?.name ?? "Non répondu"
                };
            }

            // Sinon, vérifier si c'est une réponse encodée
            const encoded = encodedAnswers?.find((ea) => ea.idQuestion === q.idQuestion);
            if (encoded) {
                return {
                    question: q.description,
                    answer: String(encoded.value)
                };
            }

            // Aucune réponse trouvée
            return {
                question: q.description,
                answer: "Non répondu"
            };
        });

        return jsonOk(summary);

    } catch (error) {
        console.error("Unexpected error:", error);
        return jsonError("Erreur serveur interne: " + error.message, 500);
    }
});