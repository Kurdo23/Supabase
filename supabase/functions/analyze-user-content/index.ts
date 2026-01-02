import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Récupération des variables d'environnement
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const perspectiveApiKey = Deno.env.get("PERSPECTIVE_API_KEY");

// Création du client Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// En-têtes CORS
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

// URL de l'API Perspective
const PERSPECTIVE_API_URL = "https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze";
const TOXICITY_THRESHOLD = 0.50; // Seuil de 50%

// Interface pour la requête
interface AnalyzeRequest {
    userId: string;
    name: string;
    lastname?: string;
    username?: string;
}

// Interface pour la réponse Perspective
interface PerspectiveScore {
    summaryScore: {
        value: number;
    };
}

interface PerspectiveResponse {
    attributeScores: {
        TOXICITY?: PerspectiveScore;
        SEVERE_TOXICITY?: PerspectiveScore;
        IDENTITY_ATTACK?: PerspectiveScore;
        INSULT?: PerspectiveScore;
        PROFANITY?: PerspectiveScore;
        THREAT?: PerspectiveScore;
    };
}

// Edge Function
Deno.serve(async (req) => {
    // Gérer les requêtes OPTIONS pour le pré-vol CORS
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // Vérifier la clé API Perspective
        if (!perspectiveApiKey) {
            return new Response(
                JSON.stringify({ error: "Configuration API manquante" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Récupérer les données de la requête
        const { userId, name, lastname, username }: AnalyzeRequest = await req.json();

        if (!userId || !name) {
            return new Response(
                JSON.stringify({ error: "Paramètres userId et name requis" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Rate limiting : Vérifier si une analyse a été faite récemment pour cet utilisateur
        // Ne prendre en compte que les signalements non-ignorés (pending ou reviewed)
        const { data: recentReport } = await supabase
            .from("user_reports")
            .select("created_at, status")
            .eq("user_id", userId)
            .in("status", ["pending", "reviewed"])
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

        if (recentReport) {
            const lastAnalysisTime = new Date(recentReport.created_at).getTime();
            const now = Date.now();
            const timeDiff = now - lastAnalysisTime;

            // Si dernière analyse < 30 secondes, refuser
            if (timeDiff < 30000) {
                return new Response(
                    JSON.stringify({
                        error: "Rate limit exceeded",
                        message: "Une analyse a déjà été effectuée récemment"
                    }),
                    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
        }

        // Vérifier si un signalement identique a été ignoré récemment
        // Si oui, ne pas créer de nouveau signalement
        const { data: dismissedReport } = await supabase
            .from("user_reports")
            .select("id, reviewed_at")
            .eq("user_id", userId)
            .eq("status", "dismissed")
            .order("reviewed_at", { ascending: false })
            .limit(1)
            .single();

        // Si un signalement a été ignoré il y a moins de 7 jours, ne pas recréer de signalement
        if (dismissedReport && dismissedReport.reviewed_at) {
            const dismissedTime = new Date(dismissedReport.reviewed_at).getTime();
            const now = Date.now();
            const timeDiff = now - dismissedTime;
            const sevenDays = 7 * 24 * 60 * 60 * 1000;

            if (timeDiff < sevenDays) {
                return new Response(
                    JSON.stringify({
                        success: true,
                        reportCreated: false,
                        message: "Contenu précédemment examiné et jugé acceptable"
                    }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
        }

        // Concaténer le contenu à analyser (max 500 caractères)
        const textToAnalyze = [name, lastname, username]
            .filter(Boolean)
            .join(" ")
            .substring(0, 500);

        if (!textToAnalyze.trim()) {
            return new Response(
                JSON.stringify({ error: "Aucun contenu à analyser" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Appel à l'API Perspective
        const perspectiveResponse = await fetch(
            `${PERSPECTIVE_API_URL}?key=${perspectiveApiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    comment: { text: textToAnalyze },
                    languages: ["fr", "en"],
                    requestedAttributes: {
                        TOXICITY: {},
                        SEVERE_TOXICITY: {},
                        IDENTITY_ATTACK: {},
                        INSULT: {},
                        PROFANITY: {},
                        THREAT: {},
                    },
                }),
            }
        );

        if (!perspectiveResponse.ok) {
            return new Response(
                JSON.stringify({ error: "Erreur lors de l'analyse du contenu" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const perspectiveData: PerspectiveResponse = await perspectiveResponse.json();
        const scores = perspectiveData.attributeScores;

        // Extraire les scores
        const toxicityScore = scores.TOXICITY?.summaryScore?.value || 0;
        const severeToxicityScore = scores.SEVERE_TOXICITY?.summaryScore?.value;
        const identityAttackScore = scores.IDENTITY_ATTACK?.summaryScore?.value;
        const insultScore = scores.INSULT?.summaryScore?.value;
        const profanityScore = scores.PROFANITY?.summaryScore?.value;
        const threatScore = scores.THREAT?.summaryScore?.value;

        // Si le score dépasse le seuil, créer un signalement
        let reportCreated = false;
        if (toxicityScore >= TOXICITY_THRESHOLD) {

            // Vérification finale juste avant l'insert pour éviter les race conditions
            // Vérifier s'il existe déjà un signalement actif (pending/reviewed) pour cet utilisateur
            const { data: existingActiveReport } = await supabase
                .from("user_reports")
                .select("id")
                .eq("user_id", userId)
                .in("status", ["pending", "reviewed"])
                .limit(1)
                .single();

            // Si un signalement actif existe déjà, ne pas en créer un nouveau
            if (existingActiveReport) {
                console.log(`[analyze-user-content] Signalement actif existant pour userId ${userId}, skip création`);
                reportCreated = false;
            } else {
                // Aucun signalement actif, on peut créer
                const { error: insertError } = await supabase
                    .from("user_reports")
                    .insert({
                        user_id: userId,
                        analyzed_content: textToAnalyze,
                        name: name,
                        lastname: lastname || null,
                        username: username || null,
                        toxicity_score: toxicityScore,
                        severe_toxicity_score: severeToxicityScore,
                        identity_attack_score: identityAttackScore,
                        insult_score: insultScore,
                        profanity_score: profanityScore,
                        threat_score: threatScore,
                        status: "pending",
                    });

                if (insertError) {
                    console.error(`[analyze-user-content] Erreur insertion:`, insertError);
                    // Ne pas retourner d'erreur car l'analyse a réussi
                } else {
                    reportCreated = true;
                    console.log(`[analyze-user-content] Signalement créé pour userId ${userId}`);
                }
            }
        }

        // Retourner les résultats
        return new Response(
            JSON.stringify({
                success: true,
                reportCreated: reportCreated,
                scores: {
                    toxicity: toxicityScore,
                    severeToxicity: severeToxicityScore,
                    identityAttack: identityAttackScore,
                    insult: insultScore,
                    profanity: profanityScore,
                    threat: threatScore,
                },
                message: reportCreated
                    ? "Contenu signalé pour modération"
                    : "Contenu analysé, aucun problème détecté",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (err) {
        return new Response(
            JSON.stringify({ error: "Erreur serveur lors de l'analyse" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
