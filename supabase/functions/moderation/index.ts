import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
    PendingRequest,
    ApproveMemberBody,
    RejectMemberBody,
    KickMemberBody,
    ToggleModeratorBody,
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

/**
 * Vérifie que l'utilisateur est bien modérateur du groupe
 */
async function checkIsModerator(idGroup: number, moderatorId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from("GroupMember")
        .select("isModerator")
        .eq("idGroup", idGroup)
        .eq("idUser", moderatorId)
        .maybeSingle();

    if (error || !data) return false;
    return data.isModerator === true;
}

/**
 * GET /moderation/groups/:id/pending-requests
 * Liste des demandes d'adhésion en attente
 */
async function getPendingRequests(idGroup: number): Promise<Response> {
    // Récupérer les demandes en attente
    const { data: requests, error: requestError } = await supabase
        .from("GroupJoinRequest")
        .select("idUser, requestedat, type")
        .eq("idGroup", idGroup)
        .eq("status", "pending")
        .eq("type", "request")
        .order("requestedat", { ascending: true });

    if (requestError) {
        console.error("Error fetching pending requests:", requestError);
        return jsonError("Erreur lors du chargement des demandes", 500);
    }

    if (!requests || requests.length === 0) {
        return jsonOk([]);
    }

    // Récupérer les infos des utilisateurs
    const userIds = requests.map(r => r.idUser);
    const { data: users, error: userError } = await supabase
        .from("User")
        .select("idUser, name, lastname, username")
        .in("idUser", userIds);

    if (userError) {
        console.error("Error fetching users:", userError);
        // On continue sans les infos utilisateurs
    }

    // Combiner les données
    const formattedRequests: PendingRequest[] = requests.map((req: any) => {
        const user = users?.find(u => u.idUser === req.idUser);
        return {
            idUser: req.idUser,
            name: user?.name ?? null,
            lastname: user?.lastname ?? null,
            username: user?.username ?? null,
            requestedAt: req.requestedat,
        };
    });

    return jsonOk(formattedRequests);
}

/**
 * GET /moderation/groups/:id/search-users?q=query
 * Recherche des utilisateurs qui ne sont pas déjà membres du groupe
 */
async function searchUsers(idGroup: number, query: string): Promise<Response> {
    if (!query || query.trim().length < 2) {
        return jsonOk([]);
    }

    const searchTerm = `%${query.toLowerCase()}%`;

    // 1. Récupérer les IDs des membres actuels du groupe
    const { data: members, error: membersError } = await supabase
        .from("GroupMember")
        .select("idUser")
        .eq("idGroup", idGroup);

    if (membersError) {
        console.error("Error fetching members:", membersError);
        return jsonError("Erreur lors de la recherche", 500);
    }

    const memberIds = members?.map(m => m.idUser) ?? [];

    // 2. Rechercher les utilisateurs qui ne sont PAS déjà membres
    const { data, error } = await supabase
        .from("User")
        .select("idUser, name, lastname, username, email")
        .or(`username.ilike.${searchTerm},email.ilike.${searchTerm}`)
        .limit(50); // On prend plus et on filtre après

    if (error) {
        console.error("Error searching users:", error);
        return jsonError("Erreur lors de la recherche", 500);
    }

    // 3. Filtrer les membres existants
    const filteredUsers = (data ?? [])
        .filter(user => !memberIds.includes(user.idUser))
        .slice(0, 10);

    return jsonOk(filteredUsers);
}

/**
 * POST /moderation/groups/:id/invite-user
 * Invite un utilisateur à rejoindre le groupe
 */
async function inviteUserToGroup(idGroup: number, body: { userId: string; invitedBy: string }): Promise<Response> {
    const { userId, invitedBy } = body;

    if (!userId || !invitedBy) {
        return jsonError("userId et invitedBy requis", 400);
    }

    // Vérifier que celui qui invite est modérateur
    const isMod = await checkIsModerator(idGroup, invitedBy);
    if (!isMod) {
        return jsonError("Vous devez être modérateur pour inviter", 403);
    }

    // Vérifier que l'utilisateur n'est pas déjà membre
    const { data: existingMember } = await supabase
        .from("GroupMember")
        .select("idUser")
        .eq("idGroup", idGroup)
        .eq("idUser", userId)
        .maybeSingle();

    if (existingMember) {
        return jsonError("Cet utilisateur est déjà membre", 400);
    }

    // Vérifier s'il y a déjà une invitation en attente
    const { data: existingInvitation, error: checkError } = await supabase
        .from("GroupJoinRequest")
        .select("*")
        .eq("idGroup", idGroup)
        .eq("idUser", userId)
        .eq("status", "pending")
        .eq("type", "invitation")
        .maybeSingle();

    if (existingInvitation) {
        // Il y a déjà une invitation en attente
        return jsonError("Une invitation a déjà été envoyée à cet utilisateur", 400);
    }

    // Si l'utilisateur a fait une demande (type=request) qui est en attente,
    // on la transforme en invitation acceptée directement
    const { data: existingRequest } = await supabase
        .from("GroupJoinRequest")
        .select("*")
        .eq("idGroup", idGroup)
        .eq("idUser", userId)
        .eq("status", "pending")
        .eq("type", "request")
        .maybeSingle();

    if (existingRequest) {
        // L'utilisateur a déjà demandé à rejoindre, on accepte directement sa demande
        // 1. Ajouter comme membre
        const { error: insertError } = await supabase
            .from("GroupMember")
            .insert({
                idGroup,
                idUser: userId,
                isModerator: false,
            });

        if (insertError) {
            console.error("Error inserting member:", insertError);
            return jsonError("Erreur lors de l'ajout du membre", 500);
        }

        // 2. Mettre à jour la demande
        await supabase
            .from("GroupJoinRequest")
            .update({ status: "accepted" })
            .eq("idGroup", idGroup)
            .eq("idUser", userId);

        return jsonOk({ success: true, autoAccepted: true });
    }

    // Supprimer les anciennes entrées (accepted/rejected)
    const { error: deleteError } = await supabase
        .from("GroupJoinRequest")
        .delete()
        .eq("idGroup", idGroup)
        .eq("idUser", userId);

    // On continue même s'il y a une erreur de suppression

    // 1. Créer l'invitation dans GroupJoinRequest (si aucune demande n'existe)
    const { error: inviteError } = await supabase
        .from("GroupJoinRequest")
        .insert({
            idGroup,
            idUser: userId,
            status: "pending",
            type: "invitation",
            invitedBy,
        });

    if (inviteError) {
        console.error("Error creating invitation:", inviteError);
        return jsonError("Erreur lors de la création de l'invitation", 500);
    }

    // 2. Créer la notification pour l'utilisateur invité
    const { data: groupData } = await supabase
        .from("Group")
        .select("name")
        .eq("idGroup", idGroup)
        .single();

    const { data: inviterData } = await supabase
        .from("User")
        .select("name, lastname, username")
        .eq("idUser", invitedBy)
        .single();

    const groupName = groupData?.name ?? "un groupe";
    const inviterName = inviterData
        ? `${inviterData.name ?? ""} ${inviterData.lastname ?? ""}`.trim() || inviterData.username || "Un administrateur"
        : "Un administrateur";

    const { error: notifError } = await supabase
        .from("Notification")
        .insert({
            idUser: userId,
            type: "group_invitation",
            title: `Invitation à rejoindre ${groupName}`,
            message: `${inviterName} vous invite à rejoindre cette communauté`,
            data: {
                idGroup,
                groupName,
                invitedBy,
                inviterName,
            },
        });

    if (notifError) {
        console.error("Error creating notification:", notifError);
        // On ne retourne pas d'erreur car l'invitation est créée
    }

    return jsonOk({ success: true });
}

/**
 * POST /moderation/groups/:id/approve-member
 * Approuver une demande d'adhésion
 */
async function approveMember(idGroup: number, body: ApproveMemberBody): Promise<Response> {
    const { userId, moderatorId } = body;

    if (!userId || !moderatorId) {
        return jsonError("userId et moderatorId requis", 400);
    }

    // Vérifier que l'utilisateur qui fait l'action est modérateur
    const isMod = await checkIsModerator(idGroup, moderatorId);
    if (!isMod) {
        return jsonError("Vous devez être modérateur pour effectuer cette action", 403);
    }

    // Vérifier que la demande existe et est en attente
    const { data: request, error: requestError } = await supabase
        .from("GroupJoinRequest")
        .select("status")
        .eq("idGroup", idGroup)
        .eq("idUser", userId)
        .maybeSingle();

    if (requestError || !request) {
        return jsonError("Demande introuvable", 404);
    }

    if (request.status !== "pending") {
        return jsonError("Cette demande a déjà été traitée", 400);
    }

    // Vérifier que l'utilisateur n'est pas déjà membre
    const { data: existingMember } = await supabase
        .from("GroupMember")
        .select("idUser")
        .eq("idGroup", idGroup)
        .eq("idUser", userId)
        .maybeSingle();

    if (existingMember) {
        return jsonError("L'utilisateur est déjà membre", 400);
    }

    // 1. Ajouter l'utilisateur comme membre
    const { error: insertError } = await supabase
        .from("GroupMember")
        .insert({
            idGroup,
            idUser: userId,
            isModerator: false,
        });

    if (insertError) {
        console.error("Error inserting member:", insertError);
        return jsonError("Erreur lors de l'ajout du membre", 500);
    }

    // 2. Mettre à jour la demande (marquer comme acceptée)
    const { error: updateError } = await supabase
        .from("GroupJoinRequest")
        .update({
            status: "accepted",
        })
        .eq("idGroup", idGroup)
        .eq("idUser", userId);

    if (updateError) {
        console.error("Error updating request:", updateError);
        // On ne retourne pas d'erreur car le membre est déjà ajouté
    }

    return jsonOk({ success: true });
}

/**
 * POST /moderation/groups/:id/reject-member
 * Rejeter une demande d'adhésion
 */
async function rejectMember(idGroup: number, body: RejectMemberBody): Promise<Response> {
    const { userId, moderatorId } = body;

    if (!userId || !moderatorId) {
        return jsonError("userId et moderatorId requis", 400);
    }

    const isMod = await checkIsModerator(idGroup, moderatorId);
    if (!isMod) {
        return jsonError("Vous devez être modérateur pour effectuer cette action", 403);
    }

    // Vérifier que la demande existe et est en attente
    const { data: request, error: requestError } = await supabase
        .from("GroupJoinRequest")
        .select("status")
        .eq("idGroup", idGroup)
        .eq("idUser", userId)
        .maybeSingle();

    if (requestError || !request) {
        return jsonError("Demande introuvable", 404);
    }

    if (request.status !== "pending") {
        return jsonError("Cette demande a déjà été traitée", 400);
    }

    // Mettre à jour la demande (marquer comme rejetée)
    const { error: updateError } = await supabase
        .from("GroupJoinRequest")
        .update({
            status: "rejected",
        })
        .eq("idGroup", idGroup)
        .eq("idUser", userId);

    if (updateError) {
        console.error("Error updating request:", updateError);
        return jsonError("Erreur lors du rejet de la demande", 500);
    }

    return jsonOk({ success: true });
}

/**
 * POST /moderation/groups/:id/kick-member
 * Expulser un membre du groupe
 */
async function kickMember(idGroup: number, body: KickMemberBody): Promise<Response> {
    const { userId, moderatorId } = body;

    if (!userId || !moderatorId) {
        return jsonError("userId et moderatorId requis", 400);
    }

    const isMod = await checkIsModerator(idGroup, moderatorId);
    if (!isMod) {
        return jsonError("Vous devez être modérateur pour effectuer cette action", 403);
    }

    // Vérifier que l'utilisateur à expulser n'est pas le dernier admin
    const { data: members } = await supabase
        .from("GroupMember")
        .select("idUser, isModerator")
        .eq("idGroup", idGroup);

    const targetMember = members?.find(m => m.idUser === userId);
    if (!targetMember) {
        return jsonError("Membre introuvable", 404);
    }

    // Si c'est un admin, vérifier qu'il n'est pas le seul
    if (targetMember.isModerator) {
        const admins = members?.filter(m => m.isModerator) ?? [];
        if (admins.length <= 1) {
            return jsonError("Impossible d'expulser le dernier administrateur", 400);
        }
    }

    // Expulser le membre
    const { error } = await supabase
        .from("GroupMember")
        .delete()
        .eq("idGroup", idGroup)
        .eq("idUser", userId);

    if (error) {
        return jsonError("Erreur lors de l'expulsion", 500);
    }

    return jsonOk({ success: true });
}

/**
 * POST /moderation/groups/:id/toggle-moderator
 * Promouvoir ou rétrograder un membre
 */
async function toggleModerator(idGroup: number, body: ToggleModeratorBody): Promise<Response> {
    const { userId, isModerator, moderatorId } = body;

    if (!userId || !moderatorId || typeof isModerator !== "boolean") {
        return jsonError("userId, isModerator et moderatorId requis", 400);
    }

    const isMod = await checkIsModerator(idGroup, moderatorId);
    if (!isMod) {
        return jsonError("Vous devez être modérateur pour effectuer cette action", 403);
    }

    // Si on rétrograde un admin, vérifier qu'il n'est pas le seul
    if (!isModerator) {
        const { data: members } = await supabase
            .from("GroupMember")
            .select("idUser, isModerator")
            .eq("idGroup", idGroup);

        const admins = members?.filter(m => m.isModerator) ?? [];
        if (admins.length <= 1) {
            return jsonError("Impossible de rétrograder le dernier administrateur", 400);
        }
    }

    // Mettre à jour le statut
    const { error } = await supabase
        .from("GroupMember")
        .update({ isModerator })
        .eq("idGroup", idGroup)
        .eq("idUser", userId);

    if (error) {
        return jsonError("Erreur lors du changement de rôle", 500);
    }

    return jsonOk({ success: true });
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);

    // URL format: /moderation/groups/:id/...
    const idx = segments.indexOf("moderation");
    if (idx === -1 || segments[idx + 1] !== "groups") {
        return jsonError("Route non trouvée", 404);
    }

    const rest = segments.slice(idx + 2); // Après "moderation/groups/"

    try {
        // GET /moderation/groups/:id/pending-requests
        if (req.method === "GET" && rest.length === 2 && rest[1] === "pending-requests") {
            const idGroup = Number(rest[0]);
            if (Number.isNaN(idGroup)) return jsonError("idGroup invalide", 400);
            return await getPendingRequests(idGroup);
        }

        // POST /moderation/groups/:id/approve-member
        if (req.method === "POST" && rest.length === 2 && rest[1] === "approve-member") {
            const idGroup = Number(rest[0]);
            if (Number.isNaN(idGroup)) return jsonError("idGroup invalide", 400);
            const body = await req.json();
            return await approveMember(idGroup, body);
        }

        // POST /moderation/groups/:id/reject-member
        if (req.method === "POST" && rest.length === 2 && rest[1] === "reject-member") {
            const idGroup = Number(rest[0]);
            if (Number.isNaN(idGroup)) return jsonError("idGroup invalide", 400);
            const body = await req.json();
            return await rejectMember(idGroup, body);
        }

        // POST /moderation/groups/:id/kick-member
        if (req.method === "POST" && rest.length === 2 && rest[1] === "kick-member") {
            const idGroup = Number(rest[0]);
            if (Number.isNaN(idGroup)) return jsonError("idGroup invalide", 400);
            const body = await req.json();
            return await kickMember(idGroup, body);
        }

        // POST /moderation/groups/:id/toggle-moderator
        if (req.method === "POST" && rest.length === 2 && rest[1] === "toggle-moderator") {
            const idGroup = Number(rest[0]);
            if (Number.isNaN(idGroup)) return jsonError("idGroup invalide", 400);
            const body = await req.json();
            return await toggleModerator(idGroup, body);
        }

        // GET /moderation/groups/:id/search-users
        if (req.method === "GET" && rest.length === 2 && rest[1] === "search-users") {
            const idGroup = Number(rest[0]);
            if (Number.isNaN(idGroup)) return jsonError("idGroup invalide", 400);
            const query = url.searchParams.get("q") ?? "";
            return await searchUsers(idGroup, query);
        }

        // POST /moderation/groups/:id/invite-user
        if (req.method === "POST" && rest.length === 2 && rest[1] === "invite-user") {
            const idGroup = Number(rest[0]);
            if (Number.isNaN(idGroup)) return jsonError("idGroup invalide", 400);
            const body = await req.json();
            return await inviteUserToGroup(idGroup, body);
        }

        return jsonError("Route non trouvée", 404);
    } catch (err) {
        console.error("moderation edge function error:", err);
        return jsonError("Erreur interne serveur", 500);
    }
});
