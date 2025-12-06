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
        const { data, error } = await supabase
            .from("Question")
            .select(`
        idQuestion,
        description,
        TypeQuestion!inner(name),
        MultipleChoicesAnswer(idMultipleChoicesAnswer, name, value),
        Coeficient(id, name, value),
        questiondependency:questiondependency!questiondependency_question_fkey(
          idparentquestion,
          freetextcondition(expectedValue),
          multiplechoicecondition(expectedchoice)
        )
      `);

        if (error) throw error;

        const uniqueCategories = Array.from(
            new Set(data.map((q: any) => q.TypeQuestion?.name ?? "Autres"))
        );

        return new Response(JSON.stringify({ questions: data, categories: uniqueCategories }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});