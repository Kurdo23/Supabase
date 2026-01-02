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
        const { userId, includeSimulation = false } = await req.json();

        if (!userId) {
            return jsonError("Missing userId", 400);
        }

        // Vérifier que l'utilisateur authentifié demande ses propres données
        // ou est admin (optionnel, selon vos besoins)
        if (userId !== authenticatedUserId) {
            // Vérifier si l'utilisateur est admin
            const { data: userProfile } = await supabase
                .from("User")
                .select("isadmin")
                .eq("idUser", authenticatedUserId)
                .maybeSingle();

            if (!userProfile?.isadmin) {
                return jsonError("Accès refusé : vous ne pouvez consulter que vos propres données", 403);
            }
        }

        // Logique existante pour récupérer le questionnaire
        let questionary;

        if (includeSimulation) {
            const { data: sim, error: simError } = await supabase
                .from("Questionary")
                .select("idQuestionary, dateSended")
                .eq("idUser", userId)
                .eq("isSimulation", true)
                .order("dateSended", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (simError) {
                console.error("Error fetching simulation:", simError);
                return jsonError("Erreur lors de la récupération de la simulation", 500);
            }

            if (sim) {
                questionary = sim;
            } else {
                const { data: real, error: realError } = await supabase
                    .from("Questionary")
                    .select("idQuestionary, dateSended")
                    .eq("idUser", userId)
                    .eq("isSimulation", false)
                    .order("dateSended", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (realError) {
                    console.error("Error fetching real questionary:", realError);
                    return jsonError("Erreur lors de la récupération du questionnaire", 500);
                }

                if (!real) {
                    return jsonError("Questionnaire introuvable", 404);
                }

                questionary = real;
            }
        } else {
            const { data: real, error: realError } = await supabase
                .from("Questionary")
                .select("idQuestionary, dateSended")
                .eq("idUser", userId)
                .eq("isSimulation", false)
                .order("dateSended", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (realError) {
                console.error("Error fetching questionary:", realError);
                return jsonError("Erreur lors de la récupération du questionnaire", 500);
            }

            if (!real) {
                return jsonError("Questionnaire introuvable", 404);
            }

            questionary = real;
        }

        // Récupérer les choix
        const { data: choices, error: choicesError } = await supabase
            .from("Choice")
            .select("idChoice, idMultipleChoicesAnswer, idQuestionary")
            .eq("idQuestionary", questionary.idQuestionary);

        if (choicesError) {
            console.error("Error fetching choices:", choicesError);
            return jsonError("Erreur lors de la récupération des choix", 500);
        }

        // Récupérer les réponses à choix multiples
        const { data: mcAnswers, error: mcError } = await supabase
            .from("MultipleChoicesAnswer")
            .select("idMultipleChoicesAnswer, idQuestion, value");

        if (mcError) {
            console.error("Error fetching multiple choices:", mcError);
            return jsonError("Erreur lors de la récupération des réponses", 500);
        }

        const mcMap = new Map(mcAnswers.map(mc => [String(mc.idMultipleChoicesAnswer), mc]));

        // Récupérer les questions et types
        const { data: questions, error: questionsError } = await supabase
            .from("Question")
            .select("idQuestion, idTypeQuestion");

        if (questionsError) {
            console.error("Error fetching questions:", questionsError);
            return jsonError("Erreur lors de la récupération des questions", 500);
        }

        const { data: types, error: typesError } = await supabase
            .from("TypeQuestion")
            .select("idTypeQuestion, name");

        if (typesError) {
            console.error("Error fetching types:", typesError);
            return jsonError("Erreur lors de la récupération des types", 500);
        }

        const questionToType = new Map(questions.map(q => [q.idQuestion, q.idTypeQuestion]));
        const totalsByTypeId = new Map<number, number>();

        // Calculer les totaux pour les choix multiples
        (choices ?? []).forEach(choice => {
            const mc = mcMap.get(String(choice.idMultipleChoicesAnswer));
            if (!mc) return;
            const typeId = questionToType.get(mc.idQuestion);
            if (!typeId) return;
            totalsByTypeId.set(typeId, (totalsByTypeId.get(typeId) ?? 0) + Number(mc.value ?? 0));
        });

        // Récupérer et calculer les réponses encodées
        const { data: encodedAnswers, error: encodedError } = await supabase
            .from("EncodedAnswer")
            .select("idQuestion, value")
            .eq("idQuestionary", questionary.idQuestionary);

        if (encodedError) {
            console.error("Error fetching encoded answers:", encodedError);
            return jsonError("Erreur lors de la récupération des réponses encodées", 500);
        }

        const { data: coeficients, error: coefsError } = await supabase
            .from("Coeficient")
            .select("idQuestion, value");

        if (coefsError) {
            console.error("Error fetching coefficients:", coefsError);
            return jsonError("Erreur lors de la récupération des coefficients", 500);
        }

        const coefByQuestion = new Map(coeficients.map(c => [c.idQuestion, Number(c.value ?? 0)]));

        (encodedAnswers ?? []).forEach(ea => {
            const coef = coefByQuestion.get(ea.idQuestion) ?? 0;
            const contrib = Number(ea.value ?? 0) * coef;
            const typeId = questionToType.get(ea.idQuestion);
            if (typeId) {
                totalsByTypeId.set(typeId, (totalsByTypeId.get(typeId) ?? 0) + contrib);
            }
        });

        // Construire le résultat
        const result = types.map(t => ({
            name: t.name,
            value: totalsByTypeId.get(t.idTypeQuestion) ?? 0,
        }));

        return jsonOk(result);

    } catch (error) {
        console.error("Unexpected error:", error);
        return jsonError("Erreur serveur interne: " + error.message, 500);
    }
});