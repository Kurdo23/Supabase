import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ================= ENV =================
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl!, supabaseKey!);

// ================= CORS =================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

// ================= Helper =================
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathSegments = url.pathname.split("/").filter(Boolean);

  try {
    // ================= GET /challenges =================
    if (
        req.method === "GET" &&
        pathSegments[0] === "challenges" &&
        pathSegments.length === 1
    ) {
      const { data, error } = await supabase
          .from("Challenge")
          .select("*")
          .order("createdAt", { ascending: false });

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      return jsonResponse(data);
    }

    // ================= GET /challenges/:idChallenge =================
    if (
        req.method === "GET" &&
        pathSegments[0] === "challenges" &&
        pathSegments.length === 2
    ) {
      const idChallenge = pathSegments[1];

      const { data, error } = await supabase
          .from("Challenge")
          .select("*")
          .eq("idChallenge", idChallenge)
          .single();

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      return jsonResponse(data);
    }

    // ================= POST /challenges/add =================
    if (
        req.method === "POST" &&
        pathSegments[0] === "challenges" &&
        pathSegments[1] === "add"
    ) {
      const payload = await req.json();

      const {
        name,
        description,
        isGlobal,
        startDateTime,
        endDateTime,
        objective,
        isDraft,
        isActive,
        goal,
        idGroup,
      } = payload;

      if (!name) {
        return jsonResponse(
            { success: false, error: "Le champ 'name' est obligatoire" },
            400
        );
      }

      const { data, error } = await supabase
          .from("Challenge")
          .insert({
            name,
            description,
            isGlobal,
            startDateTime,
            endDateTime,
            objective,
            isDraft,
            isActive,
            goal,
            idGroup,
          })
          .select()
          .single();

      if (error) {
        return jsonResponse(
            { success: false, error: error.message },
            500
        );
      }

      return jsonResponse({ success: true, challenge: data }, 201);
    }

    // ================= PUT /challenges/:idChallenge =================
    if (
        req.method === "PUT" &&
        pathSegments[0] === "challenges" &&
        pathSegments.length === 2
    ) {
      const idChallenge = pathSegments[1];
      const body = await req.json();

      const {
        name,
        description,
        isGlobal,
        startDateTime,
        endDateTime,
        objective,
        isDraft,
        isActive,
        goal,
        idGroup,
      } = body;

      const { data, error } = await supabase
          .from("Challenge")
          .update({
            ...(name !== undefined && { name }),
            ...(description !== undefined && { description }),
            ...(isGlobal !== undefined && { isGlobal }),
            ...(startDateTime !== undefined && { startDateTime }),
            ...(endDateTime !== undefined && { endDateTime }),
            ...(objective !== undefined && { objective }),
            ...(isDraft !== undefined && { isDraft }),
            ...(isActive !== undefined && { isActive }),
            ...(goal !== undefined && { goal }),
            ...(idGroup !== undefined && { idGroup }),
            updatedAt: new Date().toISOString(),
          })
          .eq("idChallenge", idChallenge)
          .select()
          .single();

      if (error) {
        return jsonResponse(
            { success: false, error: error.message },
            500
        );
      }

      return jsonResponse({ success: true, challenge: data });
    }

    // ================= DELETE /challenges/:idChallenge =================
    if (
        req.method === "DELETE" &&
        pathSegments[0] === "challenges" &&
        pathSegments.length === 2
    ) {
      const idChallenge = pathSegments[1];

      const { error } = await supabase
          .from("Challenge")
          .delete()
          .eq("idChallenge", idChallenge);

      if (error) {
        return jsonResponse(
            { success: false, error: error.message },
            500
        );
      }

      return jsonResponse({ success: true });
    }

    // ================= NOT FOUND =================
    return jsonResponse({ error: "Route non trouvée" }, 404);
  } catch (err) {
    console.error("challenges edge function error:", err);
    return jsonResponse(
        {
          error:
              err instanceof Error
                  ? err.message
                  : "Erreur serveur dans la fonction challenges",
        },
        500
    );
  }
});
