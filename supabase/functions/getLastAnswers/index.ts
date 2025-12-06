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
        const { userId } = await req.json();

        if (!userId) {
            return new Response(JSON.stringify({ error: "userId manquant" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const { data: lastQuestionary, error: questionaryError } = await supabase
            .from("Questionary")
            .select("idQuestionary")
            .eq("idUser", userId)
            .eq("isSimulation", false)
            .order("dateSended", { ascending: false })
            .limit(1)
            .single();

        if (questionaryError || !lastQuestionary) {
            return new Response(JSON.stringify({ answers: {} }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const { data: encodedAnswers, error: encodedError } = await supabase
            .from("EncodedAnswer")
            .select("idQuestion, value")
            .eq("idQuestionary", lastQuestionary.idQuestionary);

        if (encodedError) throw encodedError;

        const { data: choices, error: choicesError } = await supabase
            .from("Choice")
            .select("idMultipleChoicesAnswer, MultipleChoicesAnswer!inner(idQuestion)")
            .eq("idQuestionary", lastQuestionary.idQuestionary);

        if (choicesError) throw choicesError;

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

        return new Response(JSON.stringify({ answers }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        console.error("Erreur getLastAnswers:", err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});