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
        // Récupérer les paramètres de pagination
        const { offset = 0, limit = 20 } = await req.json();

        // Récupérer TOUS les groupes certifiés
        const { data: groups, error } = await supabase
            .from("Group")
            .select("idGroup, name, isCertified")
            .eq("isCertified", true);

        if (error) throw error;
        if (!groups || groups.length === 0) {
            return new Response(JSON.stringify({ companies: [], hasMore: false }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const companies: { id: string; name: string; totalCarbon: number }[] = [];

        // Calculer le total de carbone pour chaque entreprise
        for (const g of groups) {
            const { data: members, error: memberError } = await supabase
                .from("GroupMember")
                .select("idUser")
                .eq("idGroup", g.idGroup);

            if (memberError) continue;

            let totalCarbon = 0;

            for (const m of members ?? []) {
                if (!m.idUser || m.idUser === "null") continue;
                try {
                    const userCarbon = await computeUserCarbon(m.idUser);
                    totalCarbon += userCarbon;
                } catch (_) {
                }
            }

            companies.push({
                id: g.idGroup,
                name: g.name,
                totalCarbon,
            });
        }

        // Trier par totalCarbon (du plus bas au plus élevé)
        companies.sort((a, b) => a.totalCarbon - b.totalCarbon);

        // Appliquer la pagination après le tri
        const paginatedCompanies = companies.slice(offset, offset + limit);
        const hasMore = offset + limit < companies.length;

        return new Response(JSON.stringify({ companies: paginatedCompanies, hasMore }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});

async function computeUserCarbon(userId: string): Promise<number> {
    const { data: questionary } = await supabase
        .from("Questionary")
        .select("idQuestionary")
        .eq("idUser", userId)
        .order("dateSended", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!questionary) return 0;
    const questionaryId = questionary.idQuestionary;
    let total = 0;

    const { data: choices } = await supabase
        .from("Choice")
        .select("idMultipleChoicesAnswer")
        .eq("idQuestionary", questionaryId);

    const { data: mcAnswers } = await supabase
        .from("MultipleChoicesAnswer")
        .select("idMultipleChoicesAnswer, value");

    const mcMap = new Map(mcAnswers.map(mc => [mc.idMultipleChoicesAnswer, Number(mc.value ?? 0)]));

    (choices ?? []).forEach(c => {
        const val = mcMap.get(c.idMultipleChoicesAnswer);
        if (val) total += val;
    });

    const { data: encodedAnswers } = await supabase
        .from("EncodedAnswer")
        .select("idQuestion, value")
        .eq("idQuestionary", questionaryId);

    const { data: coeficients } = await supabase.from("Coeficient").select("idQuestion, value");
    const coefByQuestion = new Map(coeficients.map(c => [c.idQuestion, Number(c.value ?? 0)]));

    (encodedAnswers ?? []).forEach(ea => {
        const coef = coefByQuestion.get(ea.idQuestion) ?? 0;
        total += Number(ea.value ?? 0) * coef;
    });

    return total;
}