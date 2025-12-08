import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Notification } from "./interface.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
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
 * GET /notifications
 * Récupère toutes les notifications de l'utilisateur connecté
 */
async function getNotifications(userId: string): Promise<Response> {
    const { data, error } = await supabase
        .from("Notification")
        .select("*")
        .eq("idUser", userId)
        .order("createdAt", { ascending: false });

    if (error) {
        console.error("Error fetching notifications:", error);
        return jsonError("Erreur lors du chargement des notifications", 500);
    }

    // Formater les données
    const notifications: Notification[] = (data ?? []).map((notif: any) => ({
        id: notif.id,
        idUser: notif.idUser,
        type: notif.type,
        title: notif.title,
        message: notif.message ?? "",
        data: notif.data ?? {},
        isRead: notif.isRead ?? false,
        createdAt: notif.createdAt,
    }));

    return jsonOk(notifications);
}

/**
 * PATCH /notifications/:id/read
 * Marque une notification comme lue
 */
async function markAsRead(notificationId: string, userId: string): Promise<Response> {
    // Vérifier que la notification appartient à l'utilisateur
    const { data: notification, error: fetchError } = await supabase
        .from("Notification")
        .select("idUser")
        .eq("id", notificationId)
        .maybeSingle();

    if (fetchError || !notification) {
        return jsonError("Notification introuvable", 404);
    }

    if (notification.idUser !== userId) {
        return jsonError("Accès refusé", 403);
    }

    // Mettre à jour
    const { error: updateError } = await supabase
        .from("Notification")
        .update({ isRead: true })
        .eq("id", notificationId);

    if (updateError) {
        console.error("Error marking as read:", updateError);
        return jsonError("Erreur lors de la mise à jour", 500);
    }

    return jsonOk({ success: true });
}

/**
 * POST /notifications/invitations/:idGroup/accept
 * Accepte une invitation à rejoindre un groupe
 */
async function acceptInvitation(idGroup: number, userId: string): Promise<Response> {
    // 1. Vérifier qu'une invitation existe pour cet utilisateur
    const { data: invitation, error: invitError } = await supabase
        .from("GroupJoinRequest")
        .select("*")
        .eq("idGroup", idGroup)
        .eq("idUser", userId)
        .eq("type", "invitation")
        .eq("status", "pending")
        .maybeSingle();

    if (invitError || !invitation) {
        return jsonError("Invitation introuvable", 404);
    }

    // 2. Vérifier que l'utilisateur n'est pas déjà membre
    const { data: existingMember } = await supabase
        .from("GroupMember")
        .select("idUser")
        .eq("idGroup", idGroup)
        .eq("idUser", userId)
        .maybeSingle();

    if (existingMember) {
        return jsonError("Vous êtes déjà membre de ce groupe", 400);
    }

    // 3. Ajouter l'utilisateur comme membre
    const { error: insertError } = await supabase
        .from("GroupMember")
        .insert({
            idGroup,
            idUser: userId,
            isModerator: false,
        });

    if (insertError) {
        console.error("Error adding member:", insertError);
        return jsonError("Erreur lors de l'ajout au groupe", 500);
    }

    // 4. Mettre à jour le statut de l'invitation
    await supabase
        .from("GroupJoinRequest")
        .update({ status: "accepted" })
        .eq("idGroup", idGroup)
        .eq("idUser", userId);

    // 5. Supprimer la notification d'invitation
    await supabase
        .from("Notification")
        .delete()
        .eq("idUser", userId)
        .eq("type", "group_invitation")
        .eq("data->>idGroup", idGroup.toString());

    return jsonOk({ success: true });
}

/**
 * POST /notifications/invitations/:idGroup/decline
 * Refuse une invitation à rejoindre un groupe
 */
async function declineInvitation(idGroup: number, userId: string): Promise<Response> {
    // 1. Vérifier qu'une invitation existe
    const { data: invitation, error: invitError } = await supabase
        .from("GroupJoinRequest")
        .select("*")
        .eq("idGroup", idGroup)
        .eq("idUser", userId)
        .eq("type", "invitation")
        .eq("status", "pending")
        .maybeSingle();

    if (invitError || !invitation) {
        return jsonError("Invitation introuvable", 404);
    }

    // 2. Mettre à jour le statut de l'invitation
    const { error: updateError } = await supabase
        .from("GroupJoinRequest")
        .update({ status: "rejected" })
        .eq("idGroup", idGroup)
        .eq("idUser", userId);

    if (updateError) {
        console.error("Error declining invitation:", updateError);
        return jsonError("Erreur lors du refus", 500);
    }

    // 3. Supprimer la notification
    await supabase
        .from("Notification")
        .delete()
        .eq("idUser", userId)
        .eq("type", "group_invitation")
        .eq("data->>idGroup", idGroup.toString());

    return jsonOk({ success: true });
}

/**
 * Fonction principale qui route les requêtes
 */
Deno.serve(async (req: Request): Promise<Response> => {
    // Handle CORS
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // Authentification
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return jsonError("Missing or invalid Authorization header", 401);
        }

        const token = authHeader.replace("Bearer ", "");

        // Créer un client avec l'ANON_KEY et le token utilisateur pour l'auth
        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: {
                    Authorization: authHeader,
                },
            },
        });

        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
        if (authError || !user) {
            return jsonError("Utilisateur non authentifié", 401);
        }

        const userId = user.id;
        const url = new URL(req.url);
        let path = url.pathname;

        // Normaliser le chemin en enlevant le préfixe de la fonction si présent
        // Ex: /notification/notifications -> /notifications
        const segments = path.split("/").filter(Boolean);
        if (segments[0] === "notification" || segments[0] === "notifications") {
            path = "/" + segments.slice(1).join("/");
        }

        console.log(`[${req.method}] Original path: ${url.pathname}, Normalized: ${path}`);

        // Router les requêtes
        if (req.method === "GET" && (path === "/notifications" || path === "" || path === "/")) {
            return await getNotifications(userId);
        }

        // PATCH /notification/:id/read
        const readMatch = path.match(/^\/([\w-]+)\/read$/);
        if (req.method === "PATCH" && readMatch) {
            const notificationId = readMatch[1];
            return await markAsRead(notificationId, userId);
        }

        // POST /notification/invitations/:idGroup/accept
        const acceptMatch = path.match(/^\/invitations\/(\d+)\/accept$/);
        if (req.method === "POST" && acceptMatch) {
            const idGroup = parseInt(acceptMatch[1]);
            return await acceptInvitation(idGroup, userId);
        }

        // POST /notification/invitations/:idGroup/decline
        const declineMatch = path.match(/^\/invitations\/(\d+)\/decline$/);
        if (req.method === "POST" && declineMatch) {
            const idGroup = parseInt(declineMatch[1]);
            return await declineInvitation(idGroup, userId);
        }

        return jsonError("Route not found: " + path, 404);

    } catch (error) {
        console.error("Unexpected error:", error);
        return jsonError("Internal server error", 500);
    }
});