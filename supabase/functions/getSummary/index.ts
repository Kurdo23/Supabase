
// supabase/functions/getSummary/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ✅ Headers CORS communs
const corsHeaders = {
    "Access-Control-Allow-Origin": "*", // ou ton domaine spécifique
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
    // ✅ Réponse pour les pré-requêtes OPTIONS
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

        // 1️⃣ Questionnaire le plus récent
        const { data: questionary, error: qError } = await supabase
            .from("Questionary")
            .select("idQuestionary, dateSended")
            .eq("idUser", userId)
            .order("dateSended", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (qError || !questionary) throw qError ?? new Error("Questionnaire introuvable");

        // 2️⃣ Choices
        const { data: choices } = await supabase
            .from("Choice")
            .select("idChoice, idMultipleChoicesAnswer, idQuestionary")
            .eq("idQuestionary", questionary.idQuestionary);

        // 3️⃣ MultipleChoicesAnswer
        const { data: mcAnswers } = await supabase
            .from("MultipleChoicesAnswer")
            .select("idMultipleChoicesAnswer, idQuestion, value");

        const mcMap = new Map(mcAnswers.map(mc => [String(mc.idMultipleChoicesAnswer), mc]));

        // 4️⃣ Questions & Types
        const { data: questions } = await supabase.from("Question").select("idQuestion, idTypeQuestion");
        const { data: types } = await supabase.from("TypeQuestion").select("idTypeQuestion, name");

        const questionToType = new Map(questions.map(q => [q.idQuestion, q.idTypeQuestion]));
        const totalsByTypeId = new Map<number, number>();

        (choices ?? []).forEach(choice => {
            const mc = mcMap.get(String(choice.idMultipleChoicesAnswer));
            if (!mc) return;
            const typeId = questionToType.get(mc.idQuestion);
            if (!typeId) return;
            totalsByTypeId.set(typeId, (totalsByTypeId.get(typeId) ?? 0) + Number(mc.value ?? 0));
        });

        // 5️⃣ EncodedAnswer + Coeficient
        const { data: encodedAnswers } = await supabase
            .from("EncodedAnswer")
            .select("idQuestion, value")
            .eq("idQuestionary", questionary.idQuestionary);

        const { data: coeficients } = await supabase.from("Coeficient").select("idQuestion, value");
        const coefByQuestion = new Map(coeficients.map(c => [c.idQuestion, Number(c.value ?? 0)]));

        (encodedAnswers ?? []).forEach(ea => {
            const coef = coefByQuestion.get(ea.idQuestion) ?? 0;
            const contrib = Number(ea.value ?? 0) * coef;
            const typeId = questionToType.get(ea.idQuestion);
            if (typeId) {
                totalsByTypeId.set(typeId, (totalsByTypeId.get(typeId) ?? 0) + contrib);
            }
        });

        // ✅ Résultat
        const result = types.map(t => ({
            name: t.name,
            value: totalsByTypeId.get(t.idTypeQuestion) ?? 0,
        }));

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
