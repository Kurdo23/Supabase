
// supabase/functions/getComparison/index.ts
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

        // 1️⃣ Récupérer les questionnaires
        const { data: questionaries, error } = await supabase
            .from("Questionary")
            .select("idQuestionary, dateSended, isSimulation")
            .eq("idUser", userId)
            .order("dateSended", { ascending: false });

        if (error) throw error;
        if (!questionaries || questionaries.length === 0) {
            return new Response(JSON.stringify([]), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const current = questionaries[0];
        const previous = questionaries.find((q, index) => index > 0 && q.isSimulation === false);
        if (!previous) {
            return new Response(JSON.stringify([]), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // ✅ Fonction pour calculer la répartition par catégorie
        async function getCategoryTotals(idQuestionary: number) {
            const { data: choices } = await supabase
                .from("Choice")
                .select("idMultipleChoicesAnswer")
                .eq("idQuestionary", idQuestionary);

            const { data: mcAnswers } = await supabase
                .from("MultipleChoicesAnswer")
                .select("idMultipleChoicesAnswer, idQuestion, value");

            const { data: questions } = await supabase
                .from("Question")
                .select("idQuestion, idTypeQuestion");

            const { data: types } = await supabase
                .from("TypeQuestion")
                .select("idTypeQuestion, name");

            const { data: encodedAnswers } = await supabase
                .from("EncodedAnswer")
                .select("idQuestion, value")
                .eq("idQuestionary", idQuestionary);

            const { data: coeficients } = await supabase
                .from("Coeficient")
                .select("idQuestion, value");

            const mcMap = new Map(mcAnswers?.map(mc => [mc.idMultipleChoicesAnswer, mc]));
            const questionToType = new Map(questions?.map(q => [q.idQuestion, q.idTypeQuestion]));
            const coefByQuestion = new Map(coeficients?.map(c => [c.idQuestion, Number(c.value ?? 0)]));

            const totals = new Map<number, number>();

            // Ajouter les choix multiples
            choices?.forEach(choice => {
                const mc = mcMap.get(choice.idMultipleChoicesAnswer);
                if (!mc) return;
                const typeId = questionToType.get(mc.idQuestion);
                if (!typeId) return;
                totals.set(typeId, (totals.get(typeId) ?? 0) + (mc.value ?? 0));
            });

            // Ajouter les réponses libres pondérées
            encodedAnswers?.forEach(ea => {
                const coef = coefByQuestion.get(ea.idQuestion) ?? 0;
                const contrib = Number(ea.value ?? 0) * coef;
                const typeId = questionToType.get(ea.idQuestion);
                if (typeId) {
                    totals.set(typeId, (totals.get(typeId) ?? 0) + contrib);
                }
            });

            return types?.map(t => ({ name: t.name, value: totals.get(t.idTypeQuestion) ?? 0 })) ?? [];
        }

        // 2️⃣ Calculer les deux répartitions
        const currentData = await getCategoryTotals(current.idQuestionary);
        const previousData = await getCategoryTotals(previous.idQuestionary);

        // 3️⃣ Fusionner pour le graphe
        const result = currentData.map(cat => {
            const prev = previousData.find(p => p.name === cat.name)?.value ?? 0;
            return { name: cat.name, actuel: cat.value, precedent: prev };
        });

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
