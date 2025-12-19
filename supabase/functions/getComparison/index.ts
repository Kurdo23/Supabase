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

        // Récupérer les questionnaires
        const { data: questionaries, error: questError } = await supabase
            .from("Questionary")
            .select("idQuestionary, dateSended, isSimulation")
            .eq("idUser", userId)
            .order("dateSended", { ascending: false });

        if (questError) {
            console.error("Error fetching questionaries:", questError);
            return jsonError("Erreur lors de la récupération des questionnaires", 500);
        }

        if (!questionaries || questionaries.length === 0) {
            return jsonOk([]);
        }

        const current = questionaries[0];
        const previous = questionaries.length > 1 ? questionaries[1] : null;

        async function getCategoryTotals(idQuestionary: number) {
            const { data: choices, error: choicesError } = await supabase
                .from("Choice")
                .select("idMultipleChoicesAnswer")
                .eq("idQuestionary", idQuestionary);

            if (choicesError) {
                console.error("Error fetching choices:", choicesError);
                throw new Error("Erreur lors de la récupération des choix");
            }

            const { data: mcAnswers, error: mcError } = await supabase
                .from("MultipleChoicesAnswer")
                .select("idMultipleChoicesAnswer, idQuestion, value");

            if (mcError) {
                console.error("Error fetching MC answers:", mcError);
                throw new Error("Erreur lors de la récupération des réponses");
            }

            const { data: questions, error: questionsError } = await supabase
                .from("Question")
                .select("idQuestion, idTypeQuestion");

            if (questionsError) {
                console.error("Error fetching questions:", questionsError);
                throw new Error("Erreur lors de la récupération des questions");
            }

            const { data: types, error: typesError } = await supabase
                .from("TypeQuestion")
                .select("idTypeQuestion, name");

            if (typesError) {
                console.error("Error fetching types:", typesError);
                throw new Error("Erreur lors de la récupération des types");
            }

            const { data: encodedAnswers, error: encodedError } = await supabase
                .from("EncodedAnswer")
                .select("idQuestion, value")
                .eq("idQuestionary", idQuestionary);

            if (encodedError) {
                console.error("Error fetching encoded answers:", encodedError);
                throw new Error("Erreur lors de la récupération des réponses encodées");
            }

            const { data: coeficients, error: coefsError } = await supabase
                .from("Coeficient")
                .select("idQuestion, value");

            if (coefsError) {
                console.error("Error fetching coefficients:", coefsError);
                throw new Error("Erreur lors de la récupération des coefficients");
            }

            const mcMap = new Map(mcAnswers?.map(mc => [mc.idMultipleChoicesAnswer, mc]));
            const questionToType = new Map(questions?.map(q => [q.idQuestion, q.idTypeQuestion]));
            const coefByQuestion = new Map(coeficients?.map(c => [c.idQuestion, Number(c.value ?? 0)]));

            const totals = new Map<number, number>();

            choices?.forEach(choice => {
                const mc = mcMap.get(choice.idMultipleChoicesAnswer);
                if (!mc) return;
                const typeId = questionToType.get(mc.idQuestion);
                if (!typeId) return;
                totals.set(typeId, (totals.get(typeId) ?? 0) + (mc.value ?? 0));
            });

            encodedAnswers?.forEach(ea => {
                const coef = coefByQuestion.get(ea.idQuestion) ?? 0;
                const contrib = Number(ea.value ?? 0) * coef;
                const typeId = questionToType.get(ea.idQuestion);
                if (typeId) {
                    totals.set(typeId, (totals.get(typeId) ?? 0) + contrib);
                }
            });

            return types?.map(t => ({
                name: t.name,
                value: totals.get(t.idTypeQuestion) ?? 0
            })) ?? [];
        }

        const currentData = await getCategoryTotals(current.idQuestionary);
        const previousData = previous ? await getCategoryTotals(previous.idQuestionary) : [];

        const result = currentData.map(cat => {
            const prev = previousData.find(p => p.name === cat.name)?.value ?? 0;
            return {
                name: cat.name,
                actuel: cat.value,
                precedent: prev
            };
        });

        return jsonOk(result);

    } catch (error) {
        console.error("Unexpected error:", error);
        return jsonError("Erreur serveur interne: " + error.message, 500);
    }
});