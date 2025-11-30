import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

type RespondBody = {
    idGroup: number;
    idUser: string;
    decision: "accepted" | "rejected";
};

Deno.serve(async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return new Response(
                JSON.stringify({ error: "Missing or invalid Authorization header" }),
                {
                    status: 401,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }
        const token = authHeader.replace("Bearer ", "");

        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: { Authorization: `Bearer ${token}` },
            },
        });

        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return new Response(
                JSON.stringify({ error: "Unable to get authenticated user" }),
                {
                    status: 401,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        const body = (await req.json()) as RespondBody;
        const { idGroup, idUser, decision } = body;

        if (!idGroup || !idUser || !["accepted", "rejected"].includes(decision)) {
            return new Response(
                JSON.stringify({ error: "Invalid body (idGroup/idUser/decision)" }),
                {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        // vérifier que l'utilisateur courant est modérateur de ce groupe
        const { data: gm, error: gmError } = await supabase
            .from("GroupMember")
            .select("idGroup")
            .eq("idGroup", idGroup)
            .eq("idUser", user.id)
            .eq("isModerator", true)
            .maybeSingle();

        if (gmError || !gm) {
            return new Response(
                JSON.stringify({ error: "Not allowed (not a moderator)" }),
                {
                    status: 403,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        // maj de la demande
        const { error: updateError } = await supabase
            .from("GroupJoinRequest")
            .update({ status: decision })
            .match({ idGroup, idUser });

        if (updateError) {
            return new Response(
                JSON.stringify({ error: "Error updating join request" }),
                {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        // si accepted → ajout dans GroupMember
        if (decision === "accepted") {
            const { error: insertError } = await supabase
                .from("GroupMember")
                .insert({
                    idGroup,
                    idUser,
                    isModerator: false,
                });

            if (insertError) {
                return new Response(
                    JSON.stringify({ error: "Error inserting new member" }),
                    {
                        status: 500,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    }
                );
            }
        }

        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        const message =
            err instanceof Error
                ? err.message
                : "Unknown error in respondToJoinRequest";

        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/respondToJoinRequest' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
