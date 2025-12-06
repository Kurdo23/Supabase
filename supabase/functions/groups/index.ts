import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
    GroupWithRelations,
    CreateGroupBody,
    JoinGroupBody,
    LeaveGroupBody,
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
        .select("idGroup, name, description, logo, isPublic, isCertified, isVisible")
        .order("name", { ascending: true })
        .eq("isSoftDelete", false);

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
        .eq("isSoftDelete", false)
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
    const { name, description, logo, isPublic, isCertified, isVisible, userId } = body;
    if (!name || !userId) return jsonError("Champs requis manquants", 400);

    const { data, error } = await supabase
        .from("Group")
        .insert({
            name,
            description: description ?? null,
            logo: logo ?? null,
            isPublic: isPublic,
            isCertified: isCertified,
            isVisible: isVisible ?? true,
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
        .select("idGroup, isPublic, isSoftDelete")
        .eq("idGroup", idGroup)
        .maybeSingle();

    // si le groupe n'existe pas OU est soft-delete → on considère qu'il n'existe plus
    if (gError || !group || group.isSoftDelete) {
        return jsonError("Communauté introuvable", 404);
    }

    // Vérifier si l'utilisateur est déjà membre
    const { data: existingMember } = await supabase
        .from("GroupMember")
        .select("idUser")
        .eq("idGroup", idGroup)
        .eq("idUser", userId)
        .maybeSingle();

    if (existingMember) {
        return jsonError("Vous êtes déjà membre de cette communauté", 400);
    }

    if (group.isPublic) {
        const { error: insertError } = await supabase.from("GroupMember").insert({
            idGroup,
            idUser: userId,
            isModerator: false,
        });
        if (insertError) return jsonError("Erreur adhésion", 500);
        return jsonOk({ status: "member" });
    }

    // Pour les groupes privés, créer une demande d'adhésion
    // Vérifier si une demande existe déjà
    const { data: existingRequest } = await supabase
        .from("Groupjoinrequest")
        .select("status")
        .eq("idGroup", idGroup)
        .eq("idUser", userId)
        .maybeSingle();

    if (existingRequest) {
        if (existingRequest.status === "pending") {
            return jsonError("Vous avez déjà une demande en attente pour cette communauté", 400);
        }
        if (existingRequest.status === "accepted") {
            return jsonError("Votre demande a déjà été approuvée", 400);
        }
        // Si rejected, on peut créer une nouvelle demande (on écrase l'ancienne)
    }

    // Créer ou mettre à jour la demande
    const { error: requestError } = await supabase
        .from("Groupjoinrequest")
        .upsert({
            idGroup,
            idUser: userId,
            status: "pending",
            requestedat: new Date().toISOString(),
        }, {
            onConflict: "idGroup,idUser"
        });

    if (requestError) {
        console.error("Error creating request:", requestError);
        return jsonError("Erreur lors de la création de la demande", 500);
    }

    return jsonOk({ status: "pending" });
}

async function leaveGroup(idGroup: number, body: LeaveGroupBody): Promise<Response> {
    const { userId, newModeratorId } = body;

    if (!userId) return jsonError("userId requis", 400);

    // Tous les membres du groupe
    const { data: members, error: membersError } = await supabase
        .from("GroupMember")
        .select("idUser, isModerator")
        .eq("idGroup", idGroup);

    if (membersError) return jsonError("Erreur chargement membres", 500);
    if (!members || members.length === 0) {
        // pas de membres -> rien à faire
        return jsonOk({ status: "not_member" });
    }

    const current = members.find((m) => m.idUser === userId);

    if (!current) {
        return jsonError("Vous n'êtes pas membre de cette communauté", 400);
    }

    const isAdmin = current.isModerator === true;
    const otherAdmins = members.filter(
        (m) => m.idUser !== userId && m.isModerator === true,
    );
    const membersCount = members.length;

    // Si c'est le seul membre du groupe -> soft delete du groupe
    if (membersCount === 1) {
        const { error: gmDeleteError } = await supabase
            .from("GroupMember")
            .delete()
            .eq("idGroup", idGroup)
            .eq("idUser", userId);

        if (gmDeleteError) return jsonError("Erreur lors de la sortie du groupe", 500);

        const { error: softDeleteError } = await supabase
            .from("Group")
            .update({ isSoftDelete: true })
            .eq("idGroup", idGroup);

        if (softDeleteError) {
            return jsonError("Sortie effectuée, mais erreur soft delete du groupe", 500);
        }

        return jsonOk({ status: "left_and_soft_deleted" });
    }

    // Règle : dernier admin alors qu'il reste d'autres membres
    if (isAdmin && membersCount > 1 && otherAdmins.length === 0) {
        // Si un nouveau modérateur est spécifié, on le promeut
        if (newModeratorId) {
            const newModerator = members.find((m) => m.idUser === newModeratorId);

            if (!newModerator) {
                return jsonError("Le membre spécifié n'existe pas dans ce groupe", 400);
            }

            if (newModerator.isModerator) {
                return jsonError("Ce membre est déjà modérateur", 400);
            }

            // Promouvoir le nouveau modérateur
            const { error: promoteError } = await supabase
                .from("GroupMember")
                .update({ isModerator: true })
                .eq("idGroup", idGroup)
                .eq("idUser", newModeratorId);

            if (promoteError) {
                return jsonError("Erreur lors de la promotion du nouveau modérateur", 500);
            }

            // On peut maintenant quitter le groupe
            const { error: deleteError } = await supabase
                .from("GroupMember")
                .delete()
                .eq("idGroup", idGroup)
                .eq("idUser", userId);

            if (deleteError) return jsonError("Erreur lors de la sortie du groupe", 500);

            return jsonOk({ status: "left_and_transferred" });
        }

        // Sinon, on refuse
        return jsonError(
            "Vous êtes le dernier administrateur. Nommez un autre admin avant de quitter la communauté.",
            400,
        );
    }

    // Cas classique : on enlève juste le membre
    const { error: deleteError } = await supabase
        .from("GroupMember")
        .delete()
        .eq("idGroup", idGroup)
        .eq("idUser", userId);

    if (deleteError) return jsonError("Erreur lors de la sortie du groupe", 500);

    return jsonOk({ status: "left" });
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

        // POST /groups/:id/leave
        if (req.method === "POST" && rest.length === 2 && rest[1] === "leave") {
            const idGroup = Number(rest[0]);
            if (Number.isNaN(idGroup)) return jsonError("idGroup invalide", 400);
            const body = await req.json();
            return await leaveGroup(idGroup, body);
        }

        return jsonError("Route non trouvée", 404);
    } catch (err) {
        console.error("groups edge function error:", err);
        return jsonError("Erreur interne serveur", 500);
    }
});
