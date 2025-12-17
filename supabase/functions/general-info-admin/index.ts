// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import {createClient} from "@supabase/supabase-js";
import {getDashboardSummary} from "./helpers.ts";

console.log("Hello from general-info-mana!")

export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
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

    console.log(req);
    const method = req.method;
    let data;

    try {
        switch (method) {
            case "GET":
                data = await getDashboardSummary(supaClient);
                console.log(" stat data from supabase: " + data.stats.users.total);
                return new Response(
                    JSON.stringify(data),
                    {headers: {...corsHeaders, "Content-Type": "application/json"}},
                );

            default:
                return new Response(
                    JSON.stringify({error: "Method not allowed"}),
                    {
                        headers: {...corsHeaders, "Content-Type": "application/json"},
                        status: 405,
                    },
                )

            }
        }catch (err) {
        console.error("Error:", err);

        return new Response(
            JSON.stringify({ error: err.message }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: err.status || 500,
            },
        );
    }
})
/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/general-info-admin' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
