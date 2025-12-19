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

        // Récupérer les questionnaires réels
        const { data: realQuestionaries, error: realError } = await supabase
            .from("Questionary")
            .select("idQuestionary, dateSended")
            .eq("idUser", userId)
            .eq("isSimulation", false)
            .order("dateSended", { ascending: false });

        if (realError) {
            console.error("Error fetching real questionaries:", realError);
            return jsonError("Erreur lors de la récupération des questionnaires", 500);
        }

        // Grouper par mois
        const grouped = new Map<string, any[]>();
        for (const q of realQuestionaries) {
            const d = new Date(q.dateSended);
            const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key)!.push(q);
        }

        const keys = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));
        let selected: any[] = [];
        keys.forEach(key => selected.push(grouped.get(key)![0]));

        // Inclure la simulation si demandé
        if (includeSimulation) {
            const { data: lastSimulation, error: simError } = await supabase
                .from("Questionary")
                .select("idQuestionary, dateSended")
                .eq("idUser", userId)
                .eq("isSimulation", true)
                .order("dateSended", { ascending: false })
                .limit(1);

            if (simError) {
                console.error("Error fetching simulation:", simError);
                return jsonError("Erreur lors de la récupération de la simulation", 500);
            }

            if (lastSimulation?.length) {
                const sim = lastSimulation[0];
                if (keys.length === 0) {
                    selected.push(sim);
                } else {
                    const simMonthKey = `${new Date(sim.dateSended).getFullYear()}-${new Date(sim.dateSended).getMonth() + 1}`;
                    const lastMonthKey = keys[0];
                    if (simMonthKey === lastMonthKey) {
                        selected[0] = sim;
                    } else {
                        selected.unshift(sim);
                    }
                }
            }
        }

        const finalQuestionaries = selected.filter(Boolean);

        // Récupérer les données de référence
        const { data: mcAnswers, error: mcError } = await supabase
            .from("MultipleChoicesAnswer")
            .select("idMultipleChoicesAnswer, value");

        if (mcError) {
            console.error("Error fetching MC answers:", mcError);
            return jsonError("Erreur lors de la récupération des réponses", 500);
        }

        const mcMap = new Map(mcAnswers.map(mc => [String(mc.idMultipleChoicesAnswer), mc]));

        const { data: coeficients, error: coefError } = await supabase
            .from("Coeficient")
            .select("idQuestion, value");

        if (coefError) {
            console.error("Error fetching coefficients:", coefError);
            return jsonError("Erreur lors de la récupération des coefficients", 500);
        }

        const coefByQuestion = new Map(coeficients.map(c => [c.idQuestion, Number(c.value ?? 0)]));

        const evolution: { date: string; empreinte: number }[] = [];

        // Calculer l'empreinte pour chaque questionnaire
        for (const q of finalQuestionaries) {
            let total = 0;

            const { data: choices, error: choicesError } = await supabase
                .from("Choice")
                .select("idMultipleChoicesAnswer")
                .eq("idQuestionary", q.idQuestionary);

            if (choicesError) {
                console.error("Error fetching choices:", choicesError);
                continue; // Skip ce questionnaire en cas d'erreur
            }

            (choices ?? []).forEach(choice => {
                const mc = mcMap.get(String(choice.idMultipleChoicesAnswer));
                if (mc && !isNaN(Number(mc.value))) total += Number(mc.value);
            });

            const { data: encodedAnswers, error: encodedError } = await supabase
                .from("EncodedAnswer")
                .select("idQuestion, value")
                .eq("idQuestionary", q.idQuestionary);

            if (encodedError) {
                console.error("Error fetching encoded answers:", encodedError);
                continue; // Skip ce questionnaire en cas d'erreur
            }

            (encodedAnswers ?? []).forEach(ea => {
                const coef = coefByQuestion.get(ea.idQuestion) ?? 0;
                total += Number(ea.value ?? 0) * coef;
            });

            const date = new Date(q.dateSended);
            const mois = date.toLocaleString("fr-FR", { month: "short" });
            evolution.push({
                date: `${mois} ${date.getFullYear()}`,
                empreinte: Number(total.toFixed(2))
            });
        }

        return jsonOk(evolution);

    } catch (error) {
        console.error("Unexpected error:", error);
        return jsonError("Erreur serveur interne: " + error.message, 500);
    }
});