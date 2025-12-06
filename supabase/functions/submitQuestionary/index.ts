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
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { userId, answers, isSimulation = true } = await req.json();

        console.log("📥 Payload reçu:", { userId, answers, isSimulation });

        if (!userId || typeof userId !== "string") {
            return new Response(
                JSON.stringify({ error: "Invalid or missing userId" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (!answers || typeof answers !== "object" || Object.keys(answers).length === 0) {
            return new Response(
                JSON.stringify({ error: "Missing or invalid answers" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const { data: existingUser, error: userError } = await supabase
            .from("User")
            .select("idUser")
            .eq("idUser", userId)
            .single();

        if (userError || !existingUser) {
            const { error: createUserError } = await supabase.from("User").insert({ idUser: userId });
            if (createUserError) {
                return new Response(
                    JSON.stringify({ error: "Impossible de créer l'utilisateur", details: createUserError }),
                    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
        }

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
            return new Response(
                JSON.stringify({ error: "Erreur création questionnaire", details: qError }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const questionaryId = Number(questionary.idQuestionary);

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

        if (choices.length > 0) {
            const { error: choiceError } = await supabase.from("Choice").insert(choices);
            if (choiceError) {
                await rollback(questionaryId);
                return new Response(
                    JSON.stringify({ error: "Erreur insertion Choice", details: choiceError }),
                    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
        }

        if (encodedAnswers.length > 0) {
            const { error: encodedError } = await supabase.from("EncodedAnswer").insert(encodedAnswers);
            if (encodedError) {
                await rollback(questionaryId);
                return new Response(
                    JSON.stringify({ error: "Erreur insertion EncodedAnswer", details: encodedError }),
                    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
        }

        return new Response(JSON.stringify({ success: true, questionaryId }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        console.error("❌ Erreur serveur:", err);
        return new Response(
            JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

async function rollback(questionaryId: number) {
    console.warn("⚠️ Rollback du questionnaire:", questionaryId);
    await supabase.from("Questionary").delete().eq("idQuestionary", questionaryId);
}
