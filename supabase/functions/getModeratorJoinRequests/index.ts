import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

type JoinRequestRow = {
    idGroup: number;
    idUser: string;
    requestedAt: string | null;
    status: string;
    Group: {
        idGroup: number;
        name: string;
        description: string | null;
        logo: string | null;
        isPublic: boolean;
        isCertified: boolean;
    };
    User: {
        idUser: string;
        name: string | null;
        lastname: string | null;
        username: string | null;
    };
};

Deno.serve(async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "GET") {
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

        // 1️⃣ Groupes où l'utilisateur est modérateur
        const { data: modGroups, error: modError } = await supabase
            .from("GroupMember")
            .select("idGroup")
            .eq("idUser", user.id)
            .eq("isModerator", true);

        if (modError) {
            return new Response(
                JSON.stringify({ error: "Error loading moderator groups" }),
                {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        const groupIds = (modGroups ?? []).map((g) => g.idGroup);
        if (groupIds.length === 0) {
            return new Response(JSON.stringify([]), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 2️⃣ Demandes en attente pour ces groupes
        const { data, error: reqError } = await supabase
            .from("GroupJoinRequest")
            .select(
                `
        idGroup,
        idUser,
        requestedAt,
        status,
        Group:Group (
          idGroup,
          name,
          description,
          logo,
          isPublic,
          isCertified
        ),
        User:User (
          idUser,
          name,
          lastname,
          username
        )
      `
            )
            .eq("status", "pending")
            .in("idGroup", groupIds);

        if (reqError) {
            return new Response(
                JSON.stringify({ error: "Error loading join requests" }),
                {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        const rows = (data ?? []) as JoinRequestRow[];

        const result = rows.map((row) => ({
            idGroup: row.idGroup,
            idUser: row.idUser,
            requestedAt: row.requestedAt,
            status: row.status as "pending",
            group: row.Group,
            user: row.User,
        }));

        return new Response(JSON.stringify(result), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        const message =
            err instanceof Error
                ? err.message
                : "Unknown error in getModeratorJoinRequests";

        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/getModeratorJoinResquests' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
