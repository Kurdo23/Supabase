import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

type JoinGroupBody = {
    idGroup: number;
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
        // Authentification
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
                headers: {
                    Authorization: `Bearer ${token}`,
                },
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

        const body = (await req.json()) as JoinGroupBody;
        if (!body?.idGroup) {
            return new Response(
                JSON.stringify({ error: "Missing idGroup in body" }),
                {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        const idGroup = body.idGroup;

        // 2️⃣ Récupérer le groupe
        const { data: group, error: groupError } = await supabase
            .from("Group")
            .select("idGroup, isOpen")
            .eq("idGroup", idGroup)
            .maybeSingle();

        if (groupError || !group) {
            return new Response(
                JSON.stringify({ error: "Group not found" }),
                {
                    status: 404,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        // 3️⃣ Vérifier si déjà membre
        const { data: existingMember, error: memberError } = await supabase
            .from("GroupMember")
            .select("idGroup, idUser")
            .eq("idGroup", idGroup)
            .eq("idUser", user.id)
            .maybeSingle();

        if (memberError) {
            return new Response(
                JSON.stringify({ error: "Error checking membership" }),
                {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        if (existingMember) {
            return new Response(
                JSON.stringify({ status: "member" as const }),
                {
                    status: 200,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        if (group.isOpen) {
            // 4️⃣ Groupe public → ajout direct
            const { error: insertError } = await supabase.from("GroupMember").insert({
                idGroup,
                idUser: user.id,
                isModerator: false,
            });

            if (insertError) {
                return new Response(
                    JSON.stringify({ error: "Error joining open group" }),
                    {
                        status: 500,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    }
                );
            }

            return new Response(JSON.stringify({ status: "member" as const }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        } else {
            // 5️⃣ Groupe privé → demande d’adhésion
            const { data: existingRequest, error: reqError } = await supabase
                .from("GroupJoinRequest")
                .select("idGroup, idUser, status")
                .eq("idGroup", idGroup)
                .eq("idUser", user.id)
                .maybeSingle();

            if (reqError) {
                return new Response(
                    JSON.stringify({ error: "Error checking join request" }),
                    {
                        status: 500,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    }
                );
            }

            if (!existingRequest) {
                const { error: insertReqError } = await supabase
                    .from("GroupJoinRequest")
                    .insert({
                        idGroup,
                        idUser: user.id,
                        status: "pending",
                    });

                if (insertReqError) {
                    return new Response(
                        JSON.stringify({ error: "Error creating join request" }),
                        {
                            status: 500,
                            headers: { ...corsHeaders, "Content-Type": "application/json" },
                        }
                    );
                }
            }

            return new Response(JSON.stringify({ status: "pending" as const }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Unknown error in joinGroup";

        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/JoinGroup' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/