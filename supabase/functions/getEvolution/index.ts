
// supabase/functions/getEvolution/index.ts
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
        const { userId } = await req.json();
        if (!userId) {
            return new Response(JSON.stringify({ error: "Missing userId" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 1️⃣ Questionnaires
        const { data: questionaries, error: qError } = await supabase
            .from("Questionary")
            .select("idQuestionary, dateSended")
            .eq("idUser", userId)
            .order("dateSended", { ascending: true });

        if (qError) throw qError;
        if (!questionaries?.length) {
            return new Response(JSON.stringify([]), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 2️⃣ MultipleChoicesAnswer
        const { data: mcAnswers, error: mcError } = await supabase
            .from("MultipleChoicesAnswer")
            .select("idMultipleChoicesAnswer, idQuestion, value");
        if (mcError) throw mcError;
        const mcMap = new Map(mcAnswers.map(mc => [String(mc.idMultipleChoicesAnswer), mc]));

        // 3️⃣ Coefficients
        const { data: coeficients, error: coefError } = await supabase
            .from("Coeficient")
            .select("idQuestion, value");
        if (coefError) throw coefError;
        const coefByQuestion = new Map(coeficients.map(c => [c.idQuestion, Number(c.value ?? 0)]));

        const evolution: { date: string; empreinte: number }[] = [];

        for (const q of questionaries) {
            let total = 0;

            // Choix multiples
            const { data: choices } = await supabase
                .from("Choice")
                .select("idChoice, idMultipleChoicesAnswer")
                .eq("idQuestionary", q.idQuestionary);

            (choices ?? []).forEach(choice => {
                const mc = mcMap.get(String(choice.idMultipleChoicesAnswer));
                if (mc && !isNaN(Number(mc.value))) {
                    total += Number(mc.value);
                }
            });

            // Réponses libres
            const { data: encodedAnswers } = await supabase
                .from("EncodedAnswer")
                .select("idQuestion, value")
                .eq("idQuestionary", q.idQuestionary);

            (encodedAnswers ?? []).forEach(ea => {
                const coef = coefByQuestion.get(ea.idQuestion) ?? 0;
                total += Number(ea.value ?? 0) * coef;
            });

            const date = new Date(q.dateSended);
            const mois = date.toLocaleString("fr-FR", { month: "short" });
            const label = `${mois} ${date.getFullYear()}`;

            evolution.push({ date: label, empreinte: Number(total.toFixed(2)) });
        }

        return new Response(JSON.stringify(evolution), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
