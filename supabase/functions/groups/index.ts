import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
    GroupWithRelations,
    CreateGroupBody,
    JoinGroupBody,
} from "./interface.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json"
};

function jsonOk(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: corsHeaders,
    });
}
function jsonError(message: string, status = 400): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: corsHeaders,
    });
}

async function listGroups(): Promise<Response> {
    const { data, error } = await supabase
        .from("Group")
        .select("idGroup, name, description, logo, isPublic, isCertified")
        .order("name", { ascending: true });

    if (error) return jsonError("Erreur chargement groupes", 500);
    return jsonOk(data);
}

async function getGroupById(idGroup: number): Promise<Response> {
    const { data, error } = await supabase
        .from("Group")
        .select(`
      idGroup, name, description, logo, isPublic, isCertified,
      GroupMember (
        idUser,
        isModerator,
        User:User (name, lastname, username)
      ),
      GroupChallenge (
        Challenge (
          idChallenge, name, description, startDateTime, endDateTime, objective
        )
      )
    `)
        .eq("idGroup", idGroup)
        .single();

    if (error || !data) return jsonError("Communauté introuvable", 404);

    const members =
        data.GroupMember?.map((gm: any) => ({
            idUser: gm.idUser as string,
            isModerator: gm.isModerator ?? null,
            name: gm.User?.name ?? null,
            lastname: gm.User?.lastname ?? null,
            username: gm.User?.username ?? null,
        })) ?? [];
    const challenges =
        data.GroupChallenge?.map((gc: any) => ({
            idChallenge: gc.Challenge.idChallenge,
            name: gc.Challenge.name,
            description: gc.Challenge.description,
            startDateTime: gc.Challenge.startDateTime,
            endDateTime: gc.Challenge.endDateTime,
            objective: gc.Challenge.objective,
        })) ?? [];

    const group: GroupWithRelations = {
        idGroup: data.idGroup,
        name: data.name,
        description: data.description,
        logo: data.logo,
        isPublic: data.isPublic,
        isCertified: data.isCertified,
        members,
        challenges,
    };
    return jsonOk(group);
}

async function createGroup(body: CreateGroupBody): Promise<Response> {
    const { name, description, logo, isPublic, isCertified, userId } = body;
    if (!name || !userId) return jsonError("Champs requis manquants", 400);

    const { data, error } = await supabase
        .from("Group")
        .insert({
            name,
            description: description ?? null,
            logo: logo ?? null,
            isPublic: isPublic,
            isCertified: isCertified,
            isSoftDelete : false,
            created_at: new Date().toISOString(),
        })
        .select("*")
        .single();

    if (error || !data) return jsonError("Erreur création communauté", 500);

    const { error: gmError } = await supabase.from("GroupMember").insert({
        idGroup: data.idGroup,
        idUser: userId,
        isModerator: true,
    });
    if (gmError) return jsonError("Créée mais erreur ajout modérateur", 500);

    return jsonOk(data, 201);
}

async function joinGroup(idGroup: number, body: JoinGroupBody): Promise<Response> {
    const { userId } = body;

    if (!userId) return jsonError("userId requis", 400);

    const { data: group, error: gError } = await supabase
        .from("Group")
        .select("idGroup, isPublic")
        .eq("idGroup", idGroup)
        .maybeSingle();

    if (gError || !group) return jsonError("Communauté introuvable", 404);

    if (group.isPublic) {
        const { error: insertError } = await supabase.from("GroupMember").insert({
            idGroup,
            idUser: userId,
            isModerator: false,
        });
        if (insertError) return jsonError("Erreur adhésion", 500);
        return jsonOk({ status: "member" });
    }

    return jsonOk({ status: "pending" });
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const idx = segments.indexOf("groups");
    const rest = idx === -1 ? [] : segments.slice(idx + 1);

    try {
        // GET /groups
        if (req.method === "GET" && rest.length === 0) return await listGroups();
        // GET /groups/:id
        if (req.method === "GET" && rest.length === 1) {
            const idGroup = Number(rest[0]);
            if (Number.isNaN(idGroup)) return jsonError("idGroup invalide", 400);
            return await getGroupById(idGroup);
        }
        // POST /groups
        if (req.method === "POST" && rest.length === 0) {
            const body = await req.json();
            return await createGroup(body);
        }
        // POST /groups/:id/join
        if (req.method === "POST" && rest.length === 2 && rest[1] === "join") {
            const idGroup = Number(rest[0]);
            if (Number.isNaN(idGroup)) return jsonError("idGroup invalide", 400);
            const body = await req.json();
            return await joinGroup(idGroup, body);
        }
        return jsonError("Route non trouvée", 404);
    } catch (err) {
        console.error("groups edge function error:", err);
        return jsonError("Erreur interne serveur", 500);
    }
});
