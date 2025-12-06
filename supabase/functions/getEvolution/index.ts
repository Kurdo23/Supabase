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
        const { userId, includeSimulation = false } = await req.json();
        if (!userId) {
            return new Response(JSON.stringify({ error: "Missing userId" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const { data: realQuestionaries, error: realError } = await supabase
            .from("Questionary")
            .select("idQuestionary, dateSended")
            .eq("idUser", userId)
            .eq("isSimulation", false)
            .order("dateSended", { ascending: false });

        if (realError) throw realError;

        const grouped = new Map<string, any[]>();
        for (const q of realQuestionaries) {
            const d = new Date(q.dateSended);
            const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key)!.push(q);
        }

        const keys = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));
        let selected: any[] = [];
        keys.forEach(key => selected.push(grouped.get(key)![0]));

        if (includeSimulation) {
            const { data: lastSimulation, error: simError } = await supabase
                .from("Questionary")
                .select("idQuestionary, dateSended")
                .eq("idUser", userId)
                .eq("isSimulation", true)
                .order("dateSended", { ascending: false })
                .limit(1);

            if (simError) throw simError;

            if (lastSimulation?.length) {
                const sim = lastSimulation[0];
                if (keys.length === 0) {
                    selected.push(sim);
                } else {
                    const simMonthKey = `${new Date(sim.dateSended).getFullYear()}-${new Date(sim.dateSended).getMonth() + 1}`;
                    const lastMonthKey = keys[0];
                    if (simMonthKey === lastMonthKey) {
                        selected[0] = sim;
                    } else {
                        selected.unshift(sim);
                    }
                }
            }
        }

        const finalQuestionaries = selected.filter(Boolean);

        const { data: mcAnswers, error: mcError } = await supabase
            .from("MultipleChoicesAnswer")
            .select("idMultipleChoicesAnswer, value");
        if (mcError) throw mcError;
        const mcMap = new Map(mcAnswers.map(mc => [String(mc.idMultipleChoicesAnswer), mc]));

        const { data: coeficients, error: coefError } = await supabase
            .from("Coeficient")
            .select("idQuestion, value");
        if (coefError) throw coefError;
        const coefByQuestion = new Map(coeficients.map(c => [c.idQuestion, Number(c.value ?? 0)]));

        const evolution: { date: string; empreinte: number }[] = [];

        for (const q of finalQuestionaries) {
            let total = 0;

            const { data: choices } = await supabase
                .from("Choice")
                .select("idMultipleChoicesAnswer")
                .eq("idQuestionary", q.idQuestionary);

            (choices ?? []).forEach(choice => {
                const mc = mcMap.get(String(choice.idMultipleChoicesAnswer));
                if (mc && !isNaN(Number(mc.value))) total += Number(mc.value);
            });

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
            evolution.push({ date: `${mois} ${date.getFullYear()}`, empreinte: Number(total.toFixed(2)) });
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
