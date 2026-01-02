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
        const { questionaryId } = await req.json();
        console.log("1. QuestionaryId reçu:", questionaryId);

        if (!questionaryId) {
            return jsonError("Missing questionaryId", 400);
        }

        // 1. Vérifier que le questionnaire existe et appartient à l'utilisateur
        const { data: questionary, error: questionaryError } = await supabase
            .from("Questionary")
            .select("idQuestionary, idUser")
            .eq("idQuestionary", questionaryId)
            .single();

        console.log("2. Questionnaire trouvé:", questionary);
        if (questionaryError) {
            console.error("Erreur questionnaire:", questionaryError);
            return jsonError("Questionnaire introuvable", 404);
        }

        // Vérifier que l'utilisateur authentifié est propriétaire du questionnaire
        // ou est admin
        if (questionary.idUser !== authenticatedUserId) {
            const { data: userProfile } = await supabase
                .from("User")
                .select("isadmin")
                .eq("idUser", authenticatedUserId)
                .maybeSingle();

            if (!userProfile?.isadmin) {
                return jsonError("Accès refusé : vous ne pouvez valider que vos propres questionnaires", 403);
            }
        }

        // 2. Traiter les conseils liés aux réponses à choix multiples
        const { data: choices, error: choiceError } = await supabase
            .from("Choice")
            .select(`
                idMultipleChoicesAnswer,
                MultipleChoicesAnswer!inner(
                    idMultipleChoicesAnswer,
                    AdvicesMultipleChoicesAnwser(
                        idAdviceMultipleChoicesAnswer
                    )
                )
            `)
            .eq("idQuestionary", questionaryId);

        console.log("3. Choix de l'utilisateur:", JSON.stringify(choices, null, 2));
        if (choiceError) {
            console.error("Erreur récupération des choix:", choiceError);
            return jsonError("Erreur lors de la récupération des choix", 500);
        }

        let mcAdvicesInserted = 0;
        // Insérer les conseils à choix multiples
        if (choices && choices.length > 0) {
            const mcAdvices = choices
                .filter(choice => choice.MultipleChoicesAnswer?.AdvicesMultipleChoicesAnwser)
                .flatMap(choice => {
                    const advices = choice.MultipleChoicesAnswer.AdvicesMultipleChoicesAnwser;
                    const adviceArray = Array.isArray(advices) ? advices : [advices];

                    return adviceArray
                        .filter(advice => advice !== null)
                        .map(advice => ({
                            idQuestionary: questionaryId,
                            idAdviceMultipleChoicesAnswer: advice.idAdviceMultipleChoicesAnswer
                        }));
                });

            console.log("4. Conseils MC à insérer:", JSON.stringify(mcAdvices, null, 2));

            if (mcAdvices.length > 0) {
                const { data: insertedMc, error: insertMcError } = await supabase
                    .from("UserAdviceMultipleChoicesAnswer")
                    .insert(mcAdvices)
                    .select();

                if (insertMcError) {
                    console.error("Erreur insertion MC:", insertMcError);
                    return jsonError("Erreur lors de l'insertion des conseils à choix multiples", 500);
                }
                mcAdvicesInserted = insertedMc?.length || 0;
                console.log("5. Conseils MC insérés:", mcAdvicesInserted);
            }
        }

        // 3. Traiter les conseils liés aux réponses encodées (questions libres)
        const { data: encodedAnswers, error: encodedError } = await supabase
            .from("EncodedAnswer")
            .select(`
                idQuestion,
                value,
                Question!inner(
                    AdviceEncodedAnswer(
                        idAdviceEncodedAnswer,
                        amountToGet,
                        isGreater
                    )
                )
            `)
            .eq("idQuestionary", questionaryId);

        console.log("6. Réponses encodées:", JSON.stringify(encodedAnswers, null, 2));
        if (encodedError) {
            console.error("Erreur réponses encodées:", encodedError);
            return jsonError("Erreur lors de la récupération des réponses encodées", 500);
        }

        let encodedAdvicesInserted = 0;
        // Filtrer et insérer les conseils encodés selon les conditions
        if (encodedAnswers && encodedAnswers.length > 0) {
            const encodedAdvices = encodedAnswers
                .filter(answer => answer.Question?.AdviceEncodedAnswer)
                .flatMap(answer => {
                    const advices = Array.isArray(answer.Question.AdviceEncodedAnswer)
                        ? answer.Question.AdviceEncodedAnswer
                        : [answer.Question.AdviceEncodedAnswer];

                    console.log(`7. Question ${answer.idQuestion} - Valeur: ${answer.value}`);
                    console.log(`   Conseils disponibles:`, JSON.stringify(advices, null, 2));

                    return advices
                        .filter(advice => {
                            if (!advice) return false;

                            const userValue = answer.value;
                            const threshold = advice.amountToGet;

                            // Vérifier la condition selon isGreater
                            const condition = advice.isGreater
                                ? userValue >= threshold
                                : userValue <= threshold;

                            console.log(`   - Conseil ${advice.idAdviceEncodedAnswer}: valeur=${userValue}, seuil=${threshold}, isGreater=${advice.isGreater}, condition=${condition}`);

                            return condition;
                        })
                        .map(advice => ({
                            idQuestionary: questionaryId,
                            idAdviceEncodedAnswer: advice.idAdviceEncodedAnswer
                        }));
                });

            console.log("8. Conseils encodés à insérer:", JSON.stringify(encodedAdvices, null, 2));

            if (encodedAdvices.length > 0) {
                const { data: insertedEncoded, error: insertEncodedError } = await supabase
                    .from("UserAdviceEncodedAnswer")
                    .insert(encodedAdvices)
                    .select();

                if (insertEncodedError) {
                    console.error("Erreur insertion encodés:", insertEncodedError);
                    return jsonError("Erreur lors de l'insertion des conseils encodés", 500);
                }
                encodedAdvicesInserted = insertedEncoded?.length || 0;
                console.log("9. Conseils encodés insérés:", encodedAdvicesInserted);
            }
        }

        // 4. Marquer le questionnaire comme non-simulation
        const { error: updateError } = await supabase
            .from("Questionary")
            .update({ isSimulation: false })
            .eq("idQuestionary", questionaryId);

        if (updateError) {
            console.error("Erreur update questionnaire:", updateError);
            return jsonError("Erreur lors de la mise à jour du questionnaire", 500);
        }

        console.log("10. Questionnaire mis à jour - Succès!");

        return jsonOk({
            success: true,
            message: "Conseils attribués avec succès",
            details: {
                questionaryId,
                multipleChoiceAdvices: mcAdvicesInserted,
                encodedAdvices: encodedAdvicesInserted,
                totalAdvices: mcAdvicesInserted + encodedAdvicesInserted
            }
        });

    } catch (error) {
        console.error("Erreur générale:", error);
        return jsonError("Erreur serveur interne: " + error.message, 500);
    }
});