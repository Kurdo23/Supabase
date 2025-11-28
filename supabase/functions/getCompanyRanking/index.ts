
// supabase/functions/getCompanyRanking/index.ts
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
        // 1️⃣ Récupérer toutes les entreprises certifiées
        const { data: groups, error } = await supabase
            .from("Group")
            .select("idGroup, name, isCertified")
            .eq("isCertified", true);

        if (error) throw error;
        if (!groups || groups.length === 0) {
            return new Response(JSON.stringify([]), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const companies: { id: string; name: string; totalCarbon: number }[] = [];

        for (const g of groups) {
            // 2️⃣ Récupérer les membres du groupe
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
                    // Ignore erreur pour un membre
                }
            }

            companies.push({
                id: g.idGroup,
                name: g.name,
                totalCarbon,
            });
        }

        return new Response(JSON.stringify(companies), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});

// ✅ Fonction utilitaire pour calculer l'empreinte carbone d'un utilisateur
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

    // Choix multiples
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

    // Réponses libres
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
