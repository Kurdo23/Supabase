
// supabase/functions/submitQuestionary/index.ts
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

        if (!userId || !answers) {
            return new Response(JSON.stringify({ error: "Missing userId or answers" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // ✅ Commence la transaction (via RPC ou logique manuelle)
        // Supabase Edge Functions n'ont pas de transaction native, mais on peut simuler rollback
        // en supprimant le questionnaire si une insertion échoue.

        // 1️⃣ Créer le questionnaire
        const { data: questionary, error: qError } = await supabase
            .from("Questionary")
            .insert({
                idUser: userId,
                dateSended: new Date().toISOString(),
                isSimulation,
            })
            .select("idQuestionary")
            .single();

        if (qError || !questionary) throw qError ?? new Error("Impossible de créer le questionnaire.");
        const questionaryId = questionary.idQuestionary;

        // 2️⃣ Préparer les réponses
        const encodedAnswers: { idQuestion: number; idQuestionary: number; value: string | number }[] = [];
        const choices: { idMultipleChoicesAnswer: number; idQuestionary: number }[] = [];

        for (const [idQuestion, { value, isMultipleChoice }] of Object.entries(answers)) {
            if (isMultipleChoice) {
                choices.push({
                    idMultipleChoicesAnswer: Number(value),
                    idQuestionary: questionaryId,
                });
            } else {
                const finalValue = isNaN(Number(value)) ? value : Number(value);
                encodedAnswers.push({
                    idQuestion: Number(idQuestion),
                    idQuestionary: questionaryId,
                    value: finalValue,
                });
            }
        }

        // 3️⃣ Insérer dans Choice
        if (choices.length > 0) {
            const { error: choiceError } = await supabase.from("Choice").insert(choices);
            if (choiceError) {
                await rollback(questionaryId);
                throw choiceError;
            }
        }

        // 4️⃣ Insérer dans EncodedAnswer
        if (encodedAnswers.length > 0) {
            const { error: encodedError } = await supabase.from("EncodedAnswer").insert(encodedAnswers);
            if (encodedError) {
                await rollback(questionaryId);
                throw encodedError;
            }
        }

        return new Response(JSON.stringify({ success: true, questionaryId }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});

// ✅ Fonction rollback en cas d'erreur
async function rollback(questionaryId: number) {
    await supabase.from("Questionary").delete().eq("idQuestionary", questionaryId);
}
