import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!; // ✅ Utiliser ANON_KEY
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
        // Récupérer les paramètres de pagination et de tri
        const { offset = 0, limit = 20, sortBy = "co2" } = await req.json();

        // Récupérer TOUS les utilisateurs pour pouvoir les trier correctement
        const { data: allUsers, error: userError } = await supabase
            .from("User")
            .select("idUser, username, xp");

        if (userError) throw userError;

        const userRanks: any[] = [];

        // Calculer les données pour tous les utilisateurs
        for (const u of allUsers ?? []) {
            if (!u.idUser) continue;

            const { data: questionnaires, error: qError } = await supabase
                .from("Questionary")
                .select("idQuestionary, dateSended")
                .eq("idUser", u.idUser)
                .order("dateSended", { ascending: false })
                .limit(2);
            if (qError) throw qError;

            let monthly_avg: number | null = null;
            let previous_month_avg: number | null = null;
            let effort: number | null = null;

            if (questionnaires && questionnaires.length > 0) {
                monthly_avg = await computeCarbon(questionnaires[0].idQuestionary);
                if (questionnaires.length > 1) {
                    previous_month_avg = await computeCarbon(questionnaires[1].idQuestionary);
                    effort = monthly_avg - previous_month_avg;
                } else {
                    previous_month_avg = 0;
                    effort = 0;
                }
            }

            userRanks.push({
                id: u.idUser,
                username: u.username ?? "(Sans username)",
                xp: u.xp ?? 0,
                monthly_avg,
                previous_month_avg,
                effort,
            });
        }

        // Trier selon le critère demandé
        if (sortBy === "co2") {
            userRanks.sort((a, b) => (a.monthly_avg ?? Infinity) - (b.monthly_avg ?? Infinity));
        } else if (sortBy === "effort") {
            userRanks.sort((a, b) => (b.effort ?? 0) - (a.effort ?? 0));
        }

        // Appliquer la pagination après le tri
        const paginatedUsers = userRanks.slice(offset, offset + limit);
        const hasMore = offset + limit < userRanks.length;

        return new Response(JSON.stringify({ users: paginatedUsers, hasMore }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});

async function computeCarbon(questionaryId: number): Promise<number> {
    let total = 0;

    const { data: choices } = await supabase
        .from("Choice")
        .select("idChoice, idMultipleChoicesAnswer")
        .eq("idQuestionary", questionaryId);

    const { data: mcAnswersRaw } = await supabase
        .from("MultipleChoicesAnswer")
        .select("idMultipleChoicesAnswer, idQuestion, value");

    const mcMap = new Map(mcAnswersRaw.map(mc => [String(mc.idMultipleChoicesAnswer), mc]));

    const { data: questions } = await supabase.from("Question").select("idQuestion, idTypeQuestion");
    const questionToType = new Map(questions.map(q => [q.idQuestion, q.idTypeQuestion]));

    const totalsByTypeId = new Map<number, number>();

    (choices ?? []).forEach(c => {
        const mc = mcMap.get(String(c.idMultipleChoicesAnswer));
        if (!mc) return;
        const typeId = questionToType.get(mc.idQuestion);
        if (!typeId) return;
        const value = Number(mc.value ?? 0);
        totalsByTypeId.set(typeId, (totalsByTypeId.get(typeId) ?? 0) + value);
    });

    const { data: encodedAnswers } = await supabase
        .from("EncodedAnswer")
        .select("idQuestion, value")
        .eq("idQuestionary", questionaryId);

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

    totalsByTypeId.forEach(val => (total += val));
    return total;
}