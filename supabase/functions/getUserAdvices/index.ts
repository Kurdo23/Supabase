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

        // Récupérer les conseils pour les réponses encodées
        const { data: userEncodedAdvices, error: encodedError } = await supabase
            .from("UserAdviceEncodedAnswer")
            .select(`
                id,
                created_at,
                idAdviceEncodedAnswer,
                AdviceEncodedAnswer:idAdviceEncodedAnswer (
                    idAdviceEncodedAnswer,
                    name,
                    content,
                    difficulty,
                    amountToGet,
                    isGreater,
                    idQuestion,
                    Question:idQuestion (
                        idQuestion,
                        description,
                        TypeQuestion:idTypeQuestion (
                            name
                        )
                    )
                )
            `)
            .eq("idUser", userId);

        if (encodedError) throw encodedError;

        // Récupérer les conseils pour les réponses à choix multiples
        const { data: userMultipleChoiceAdvices, error: multipleChoiceError } = await supabase
            .from("UserAdviceMultipleChoicesAnswer")
            .select(`
                id,
                created_at,
                idAdviceMultipleChoicesAnswer,
                AdvicesMultipleChoicesAnwser:idAdviceMultipleChoicesAnswer (
                    idAdviceMultipleChoicesAnswer,
                    name,
                    content,
                    difficulty,
                    idMultipleChoiceAnswer,
                    MultipleChoicesAnswer:idMultipleChoiceAnswer (
                        idMultipleChoicesAnswer,
                        name,
                        value,
                        Question:idQuestion (
                            idQuestion,
                            description,
                            TypeQuestion:idTypeQuestion (
                                name
                            )
                        )
                    )
                )
            `)
            .eq("idUser", userId);

        if (multipleChoiceError) throw multipleChoiceError;

        // Formater les conseils encodés
        const encodedAdvices = (userEncodedAdvices || []).map(ua => ({
            id: ua.id,
            created_at: ua.created_at,
            type: "encoded",
            adviceId: ua.AdviceEncodedAnswer?.idAdviceEncodedAnswer,
            name: ua.AdviceEncodedAnswer?.name,
            content: ua.AdviceEncodedAnswer?.content,
            difficulty: ua.AdviceEncodedAnswer?.difficulty,
            amountToGet: ua.AdviceEncodedAnswer?.amountToGet,
            isGreater: ua.AdviceEncodedAnswer?.isGreater,
            question: {
                id: ua.AdviceEncodedAnswer?.Question?.idQuestion,
                description: ua.AdviceEncodedAnswer?.Question?.description,
                category: ua.AdviceEncodedAnswer?.Question?.TypeQuestion?.name,
            }
        }));

        // Formater les conseils à choix multiples
        const multipleChoiceAdvices = (userMultipleChoiceAdvices || []).map(ua => ({
            id: ua.id,
            created_at: ua.created_at,
            type: "multiple_choice",
            adviceId: ua.AdvicesMultipleChoicesAnwser?.idAdviceMultipleChoicesAnswer,
            name: ua.AdvicesMultipleChoicesAnwser?.name,
            content: ua.AdvicesMultipleChoicesAnwser?.content,
            difficulty: ua.AdvicesMultipleChoicesAnwser?.difficulty,
            multipleChoice: {
                id: ua.AdvicesMultipleChoicesAnwser?.MultipleChoicesAnswer?.idMultipleChoicesAnswer,
                name: ua.AdvicesMultipleChoicesAnwser?.MultipleChoicesAnswer?.name,
                value: ua.AdvicesMultipleChoicesAnwser?.MultipleChoicesAnswer?.value,
            },
            question: {
                id: ua.AdvicesMultipleChoicesAnwser?.MultipleChoicesAnswer?.Question?.idQuestion,
                description: ua.AdvicesMultipleChoicesAnwser?.MultipleChoicesAnswer?.Question?.description,
                category: ua.AdvicesMultipleChoicesAnwser?.MultipleChoicesAnswer?.Question?.TypeQuestion?.name,
            }
        }));

        // Combiner tous les conseils et trier par date de création
        const allAdvices = [...encodedAdvices, ...multipleChoiceAdvices]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        return new Response(JSON.stringify({
            advices: allAdvices,
            total: allAdvices.length,
            encodedCount: encodedAdvices.length,
            multipleChoiceCount: multipleChoiceAdvices.length,
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});