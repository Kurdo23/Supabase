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

function jsonError(message: string, status = 400, details?: unknown): Response {
    return new Response(JSON.stringify({ error: message, details }), {
        status,
        headers: corsHeaders,
    });
}

async function rollback(questionaryId: number) {
    console.warn("⚠️ Rollback du questionnaire:", questionaryId);
    await supabase.from("Questionary").delete().eq("idQuestionary", questionaryId);
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
        const { userId, answers, isSimulation = true } = await req.json();

        console.log("🔥 Payload reçu:", { userId, answers, isSimulation });

        // Validation des paramètres
        if (!userId || typeof userId !== "string") {
            return jsonError("Invalid or missing userId", 400);
        }

        if (!answers || typeof answers !== "object" || Object.keys(answers).length === 0) {
            return jsonError("Missing or invalid answers", 400);
        }

        // Vérifier que l'utilisateur authentifié soumet ses propres données
        // ou est admin
        if (userId !== authenticatedUserId) {
            const { data: userProfile } = await supabase
                .from("User")
                .select("isadmin")
                .eq("idUser", authenticatedUserId)
                .maybeSingle();

            if (!userProfile?.isadmin) {
                return jsonError("Accès refusé : vous ne pouvez soumettre que vos propres questionnaires", 403);
            }
        }

        // Vérifier si l'utilisateur existe, sinon le créer
        const { data: existingUser, error: userError } = await supabase
            .from("User")
            .select("idUser")
            .eq("idUser", userId)
            .maybeSingle();

        if (!existingUser) {
            const { error: createUserError } = await supabase.from("User").insert({ idUser: userId });
            if (createUserError) {
                console.error("Erreur création utilisateur:", createUserError);
                return jsonError("Impossible de créer l'utilisateur", 500, createUserError);
            }
            console.log("✅ Utilisateur créé:", userId);
        }

        // Créer le questionnaire
        const { data: questionary, error: qError } = await supabase
            .from("Questionary")
            .insert({
                idUser: userId,
                dateSended: new Date().toISOString(),
                isSimulation,
            })
            .select("idQuestionary")
            .single();

        if (qError || !questionary) {
            console.error("Erreur création questionnaire:", qError);
            return jsonError("Erreur création questionnaire", 500, qError);
        }

        const questionaryId = Number(questionary.idQuestionary);
        console.log("✅ Questionnaire créé:", questionaryId);

        // Préparer les réponses
        const encodedAnswers: { idQuestion: number; idQuestionary: number; value: string | number }[] = [];
        const choices: { idMultipleChoicesAnswer: number; idQuestionary: number }[] = [];

        for (const [idQuestion, { value, isMultipleChoice }] of Object.entries(answers)) {
            const questionIdNum = Number(idQuestion);
            if (isMultipleChoice) {
                choices.push({
                    idMultipleChoicesAnswer: Number(value),
                    idQuestionary: questionaryId,
                });
            } else {
                const finalValue = isNaN(Number(value)) ? value : Number(value);
                encodedAnswers.push({
                    idQuestion: questionIdNum,
                    idQuestionary: questionaryId,
                    value: finalValue,
                });
            }
        }

        // Insérer les choix multiples
        if (choices.length > 0) {
            const { error: choiceError } = await supabase.from("Choice").insert(choices);
            if (choiceError) {
                console.error("Erreur insertion Choice:", choiceError);
                await rollback(questionaryId);
                return jsonError("Erreur insertion Choice", 500, choiceError);
            }
            console.log(`✅ ${choices.length} choix insérés`);
        }

        // Insérer les réponses encodées
        if (encodedAnswers.length > 0) {
            const { error: encodedError } = await supabase.from("EncodedAnswer").insert(encodedAnswers);
            if (encodedError) {
                console.error("Erreur insertion EncodedAnswer:", encodedError);
                await rollback(questionaryId);
                return jsonError("Erreur insertion EncodedAnswer", 500, encodedError);
            }
            console.log(`✅ ${encodedAnswers.length} réponses encodées insérées`);
        }

        return jsonOk({
            success: true,
            questionaryId,
            message: "Questionnaire soumis avec succès"
        });

    } catch (error) {
        console.error("❌ Erreur serveur:", error);
        return jsonError(
            "Erreur serveur interne: " + (error instanceof Error ? error.message : String(error)),
            500
        );
    }
});