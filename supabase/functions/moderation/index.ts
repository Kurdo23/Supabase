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
    const { data, error } = await supabase
        .from("GroupRequest")
        .select(`
            idUser,
            requestedAt,
            User (name, lastname, username)
        `)
        .eq("idGroup", idGroup)
        .eq("status", "pending")
        .order("requestedAt", { ascending: true });

    if (error) {
        console.error("Error fetching pending requests:", error);
        return jsonError("Erreur lors du chargement des demandes", 500);
    }

    // Formater les données pour correspondre à l'interface PendingRequest
    const requests: PendingRequest[] = (data ?? []).map((req: any) => ({
        idUser: req.idUser,
        name: req.User?.name ?? null,
        lastname: req.User?.lastname ?? null,
        username: req.User?.username ?? null,
        requestedAt: req.requestedAt,
    }));

    return jsonOk(requests);
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
        .from("GroupRequest")
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

    // 2. Mettre à jour la demande (marquer comme approuvée)
    const { error: updateError } = await supabase
        .from("GroupRequest")
        .update({
            status: "approved",
            processedAt: new Date().toISOString(),
            processedBy: moderatorId,
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
        .from("GroupRequest")
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
        .from("GroupRequest")
        .update({
            status: "rejected",
            processedAt: new Date().toISOString(),
            processedBy: moderatorId,
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

        return jsonError("Route non trouvée", 404);
    } catch (err) {
        console.error("moderation edge function error:", err);
        return jsonError("Erreur interne serveur", 500);
    }
});
