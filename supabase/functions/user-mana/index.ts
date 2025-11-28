// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCompleteUsersSummary, getUserDetail, softDelete, permanentlyDelete } from "./helpers.ts";
import { createClient } from "@supabase/supabase-js";
import {corsHeaders} from "../../_shared/cors.ts";


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
  const command = url.pathname.split("/").pop();
  console.log(command);
  const id = command;
  console.log(id);
  let data;
  try {
    switch (method) {
      case "GET":
        if (id !== "user-mana") {
          data = await getUserDetail(supaClient, id);
            return new Response(
                JSON.stringify(data),
                { headers: {...corsHeaders, "Content-Type": "application/json" } },
            );
        } else {
          data = await getCompleteUsersSummary(supaClient);
          console.log(data);
            return new Response(
                JSON.stringify(data),
                { headers: {...corsHeaders, "Content-Type": "application/json" } },
            );
        }
        case "PUT":
            data = await softDelete(supaClient, id);
            return new Response (
                JSON.stringify(data),
            {headers: {...corsHeaders,"Content-Type": "application/json"}},
            );
        case "DELETE":
            data = await permanentlyDelete(supaClient, id);
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
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/user-mana' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
