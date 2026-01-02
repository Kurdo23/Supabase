// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import {createClient} from "@supabase/supabase-js";
import {corsHeaders} from "../../_shared/cors.ts";
import {getCompleteGroupSummary, getGroupDetail, permanentelyDeleteGroup, softDeleteGroup} from "./helpers.ts";



console.log("Hello from group-mana!")

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
    const method = req.method;
    const pathParts = url.pathname.split("/").filter(p => p);
    // Le dernier élément du path (peut être "group-mana" ou un ID)
    const lastPathPart = pathParts[pathParts.length - 1];

    // Vérifier si c'est un ID numérique
    const isNumericId = !isNaN(Number(lastPathPart));
    const groupId = isNumericId ? Number(lastPathPart) : null;

    console.log('Path parts:', pathParts);
    console.log('Group ID:', groupId);
    let data;
    try {
        switch (method) {
            case "GET":
                if (groupId !== null) {
                    console.log('Fetching group details for ID:', groupId);
                    data = await getGroupDetail(supaClient, groupId);
                    return new Response(
                        JSON.stringify(data),
                        { headers: {...corsHeaders, "Content-Type": "application/json" } },

                    );
                } else {
                    console.log('Fetching group summary');
                    const page = parseInt(url.searchParams.get('page') || '1');
                    const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
                    const searchQuery = url.searchParams.get('search') || undefined;

                    console.log('Pagination params:', { page, pageSize, searchQuery });

                    const summaryData = await getCompleteGroupSummary(
                        supaClient,
                        page,
                        pageSize,
                        searchQuery
                    );
                    return new Response(
                        JSON.stringify(summaryData),
                        { headers: {...corsHeaders, "Content-Type": "application/json" } },
                    );
                }
            case "PUT":
                data = await softDeleteGroup(supaClient, groupId || 0);
                return new Response (
                    JSON.stringify(data),
                    {headers: {...corsHeaders, "Content-Type": "application/json"}},
                );
            case "DELETE":
                data = await permanentelyDeleteGroup(supaClient, groupId || 0);
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
            JSON.stringify({ error: err instanceof Error ? err.message: 'Erreur' }),
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

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/group-mana' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
