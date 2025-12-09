import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const { questionaryId } = await req.json();
        console.log("1. QuestionaryId reçu:", questionaryId);

        if (!questionaryId) {
            return new Response(JSON.stringify({ error: "Missing questionaryId" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 1. Vérifier que le questionnaire existe
        const { data: questionary, error: questionaryError } = await supabase
            .from("Questionary")
            .select("idQuestionary, idUser")
            .eq("idQuestionary", questionaryId)
            .single();

        console.log("2. Questionnaire trouvé:", questionary);
        if (questionaryError) {
            console.error("Erreur questionnaire:", questionaryError);
            throw questionaryError;
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
            throw choiceError;
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
                    throw insertMcError;
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
            throw encodedError;
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
                    throw insertEncodedError;
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
            throw updateError;
        }

        console.log("10. Questionnaire mis à jour - Succès!");

        return new Response(JSON.stringify({
            success: true,
            message: "Conseils attribués avec succès",
            details: {
                questionaryId,
                multipleChoiceAdvices: mcAdvicesInserted,
                encodedAdvices: encodedAdvicesInserted,
                totalAdvices: mcAdvicesInserted + encodedAdvicesInserted
            }
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        console.error("Erreur générale:", err);
        return new Response(JSON.stringify({
            error: err.message,
            stack: err.stack
        }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});