// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import {createClient} from "@supabase/supabase-js";
import {corsHeaders} from "../../_shared/cors.ts";
import {addChall, deleteChallenge, getChallSummary, updateChallenge} from "./helpers.ts";


console.log("Hello from challenge-mana!")


Deno.serve(async (req) => {
    console.info('Request received:', req.method, req.url)

    const supaClient = createClient(
        Deno.env.get("SUPABASE_URL"),
        Deno.env.get("SUPABASE_ANON_KEY"),
    );

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }


    const url = new URL(req.url);
    console.log("Url pathname: " + url.pathname);
    const method = req.method;
    const searchParam = url.searchParams.get('id') || null;
    let body;
    if(req.method === 'POST'){
        body =  req.json() || null;
        console.log("Le body de la requête si dispo: " + body);
    }

    let data;
    try {
        switch (method) {
            case "GET":
                data = await getChallSummary(supaClient);
                return new Response(
                    JSON.stringify(data),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
                );
            case "POST":
                data = await addChall(supaClient, body);
                    return new Response(
                        JSON.stringify(data),
                        {headers: {...corsHeaders, "Content-Type": "application/json"}},
                    )
            case "PUT":
                data = await updateChallenge(supaClient, searchParam);
                return new Response (
                    JSON.stringify(data),
                    {headers: {...corsHeaders, "Content-Type": "application/json"}},
                );
            case "DELETE":
                 data = await deleteChallenge(supaClient, searchParam);
                 return new Response(
                    JSON.stringify(data),
                     {headers: {...corsHeaders, "Content-Type": "application/json"}},
                 );
            default:
                return new Response(
                    JSON.stringify({ error: "Method not allowed" }),
                    {
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                        status: 405,
                    },
                )
        }

    }
    catch (err) {
        console.error("Error:", err);

        return new Response(
            JSON.stringify({ error: err.message }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
            },
        );
    }
})
/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/challenge-mana' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
