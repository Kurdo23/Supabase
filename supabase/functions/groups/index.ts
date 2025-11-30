// supabase/functions/groups/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ⚠️ Variables d'environnement à définir dans Supabase
// SUPABASE_URL
// SUPABASE_SERVICE_ROLE_KEY
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

type Group = {
    idGroup: number;
    name: string;
    description: string | null;
    logo: string | null;
    isOpen: boolean;
    isCertified: boolean;
};

type GroupMember = {
    idUser: string;
    isModerator: boolean | null;
};

type GroupWithRelations = Group & {
    members: {
        idUser: string;
        name: string | null;
        lastname: string | null;
        username: string | null;
        isModerator: boolean | null;
    }[];
    challenges: {
        idChallenge: number;
        name: string | null;
        description: string | null;
        startDateTime: string | null;
        endDateTime: string | null;
        objective: number | null;
    }[];
};

type CreateGroupPayload = {
    name: string;
    description?: string;
    logo?: string;
    isOpen: boolean;
    isCertified: boolean;
};

// Pour l’instant: userId dans le body (plus simple à brancher avec ton front)
type CreateGroupBody = CreateGroupPayload & { userId: string };
type JoinGroupBody = { userId: string };

// ---------- Handlers métier ----------

async function listGroups(): Promise<Response> {
    const { data, error } = await supabase
        .from("Group")
        .select("idGroup, name, description, logo, isOpen, isCertified")
        .order("name", { ascending: true });

    if (error) {
        console.error("listGroups error:", error);
        return jsonError("Erreur lors du chargement des communautés", 500);
    }

    return jsonOk(data as Group[]);
}

async function getGroupById(idGroup: number): Promise<Response> {
    const { data, error } = await supabase
        .from("Group")
        .select(
            `
        idGroup,
        name,
        description,
        logo,
        isOpen,
        isCertified,
        GroupMember (
          idUser,
          isModerator,
          User:User (
            name,
            lastname,
            username
          )
        ),
        GroupChallenge (
          Challenge (
            idChallenge,
            name,
            description,
            startDateTime,
            endDateTime,
            objective
          )
        )
      `,
        )
        .eq("idGroup", idGroup)
        .single();

    if (error || !data) {
        console.error("getGroupById error:", error);
        return jsonError("Communauté introuvable", 404);
    }

    const members =
        data.GroupMember?.map((gm: any) => ({
            idUser: gm.idUser as string,
            isModerator: gm.isModerator as boolean | null,
            name: gm.User?.name ?? null,
            lastname: gm.User?.lastname ?? null,
            username: gm.User?.username ?? null,
        })) ?? [];

    const challenges =
        data.GroupChallenge?.map((gc: any) => ({
            idChallenge: gc.Challenge.idChallenge as number,
            name: gc.Challenge.name ?? null,
            description: gc.Challenge.description ?? null,
            startDateTime: gc.Challenge.startDateTime ?? null,
            endDateTime: gc.Challenge.endDateTime ?? null,
            objective: gc.Challenge.objective ?? null,
        })) ?? [];

    const group: GroupWithRelations = {
        idGroup: data.idGroup,
        name: data.name,
        description: data.description,
        logo: data.logo,
        isOpen: data.isOpen,
        isCertified: data.isCertified,
        members,
        challenges,
    };

    return jsonOk(group);
}

async function createGroup(body: CreateGroupBody): Promise<Response> {
    const { name, description, logo, isOpen, isCertified, userId } = body;

    if (!name || !userId) {
        return jsonError("name et userId sont obligatoires", 400);
    }

    const { data, error } = await supabase
        .from("Group")
        .insert({
            name,
            description: description ?? null,
            logo: logo ?? null,
            isOpen,
            isCertified,
        })
        .select("*")
        .single();

    if (error || !data) {
        console.error("createGroup error:", error);
        return jsonError("Erreur lors de la création de la communauté", 500);
    }

    const group = data as Group;

    const { error: gmError } = await supabase.from("GroupMember").insert({
        idGroup: group.idGroup,
        idUser: userId,
        isModerator: true,
    });

    if (gmError) {
        console.error("createGroup - add moderator error:", gmError);
        // On renvoie quand même le groupe, mais avec erreur 500 explicite
        return jsonError(
            "Communauté créée mais erreur lors de l’ajout du modérateur",
            500,
        );
    }

    return jsonOk(group, 201);
}

async function joinGroup(idGroup: number, body: JoinGroupBody): Promise<Response> {
    const { userId } = body;

    if (!userId) {
        return jsonError("userId manquant", 400);
    }

    const { data: group, error: gError } = await supabase
        .from("Group")
        .select("idGroup, isOpen")
        .eq("idGroup", idGroup)
        .maybeSingle();

    if (gError || !group) {
        console.error("joinGroup - group error:", gError);
        return jsonError("Communauté introuvable", 404);
    }

    if (group.isOpen) {
        const { error: insertError } = await supabase.from("GroupMember").insert({
            idGroup,
            idUser: userId,
            isModerator: false,
        });

        if (insertError) {
            console.error("joinGroup - insert member error:", insertError);
            return jsonError("Erreur lors de l’adhésion à la communauté", 500);
        }

        return jsonOk({ status: "member" as const });
    }

    // Groupe privé → pour l’instant, pas de table de demandes, juste "pending"
    return jsonOk({ status: "pending" as const });
}

// ---------- Helpers JSON / routing ----------

function jsonOk(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

function jsonError(message: string, status: number): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const idx = segments.indexOf("groups");
    const rest = idx === -1 ? [] : segments.slice(idx + 1);

    try {
        // GET /groups
        if (req.method === "GET" && rest.length === 0) {
            return await listGroups();
        }

        // GET /groups/:id
        if (req.method === "GET" && rest.length === 1) {
            const idGroup = Number(rest[0]);
            if (Number.isNaN(idGroup)) {
                return jsonError("idGroup invalide", 400);
            }
            return await getGroupById(idGroup);
        }

        // POST /groups
        if (req.method === "POST" && rest.length === 0) {
            const body = (await req.json()) as CreateGroupBody;
            return await createGroup(body);
        }

        // POST /groups/:id/join
        if (req.method === "POST" && rest.length === 2 && rest[1] === "join") {
            const idGroup = Number(rest[0]);
            if (Number.isNaN(idGroup)) {
                return jsonError("idGroup invalide", 400);
            }
            const body = (await req.json()) as JoinGroupBody;
            return await joinGroup(idGroup, body);
        }

        return jsonError("Route non trouvée", 404);
    } catch (err) {
        console.error("groups edge function error:", err);
        return jsonError("Erreur interne du serveur", 500);
    }
});
