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
            return new Response(JSON.stringify({ error: "Missing userId" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const { data: questionary } = await supabase
            .from("Questionary")
            .select("idQuestionary")
            .eq("idUser", userId)
            .order("dateSended", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!questionary) return new Response(JSON.stringify([]), { headers: corsHeaders });

        const questionaryId = questionary.idQuestionary;

        const { data: questions } = await supabase
            .from("Question")
            .select("idQuestion, description, MultipleChoicesAnswer(idMultipleChoicesAnswer, name)")
            .order("idQuestion");

        const { data: choices } = await supabase
            .from("Choice")
            .select("idMultipleChoicesAnswer")
            .eq("idQuestionary", questionaryId);

        const { data: encodedAnswers } = await supabase
            .from("EncodedAnswer")
            .select("idQuestion, value")
            .eq("idQuestionary", questionaryId);

        const summary = (questions ?? []).map((q) => {
            const choice = choices?.find((c) =>
                q.MultipleChoicesAnswer?.some((m) => m.idMultipleChoicesAnswer === c.idMultipleChoicesAnswer)
            );
            if (choice) {
                const selected = q.MultipleChoicesAnswer?.find(
                    (m) => m.idMultipleChoicesAnswer === choice.idMultipleChoicesAnswer
                );
                return { question: q.description, answer: selected?.name ?? "Non répondu" };
            }
            const encoded = encodedAnswers?.find((ea) => ea.idQuestion === q.idQuestion);
            if (encoded) return { question: q.description, answer: String(encoded.value) };
            return { question: q.description, answer: "Non répondu" };
        });

        return new Response(JSON.stringify(summary), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
