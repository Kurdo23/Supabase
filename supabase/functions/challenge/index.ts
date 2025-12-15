import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
    ChallengeWithStats,
    ChallengeLeaderboardEntry,
    CreateChallengeBody,
    UpdateChallengeBody,
    ValidateChallengeBody,
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

// Helper pour calculer le statut d'un défi
function getChallengeStatus(startDateTime: string, endDateTime: string): 'upcoming' | 'active' | 'completed' {
    const now = new Date();
    const start = new Date(startDateTime);
    const end = new Date(endDateTime);

    if (now < start) return 'upcoming';
    if (now > end) return 'completed';
    return 'active';
}

// Helper pour calculer les jours restants
function getDaysRemaining(endDateTime: string): number | null {
    const now = new Date();
    const end = new Date(endDateTime);

    if (now > end) return null;

    const diff = end.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// Vérifier si un utilisateur est modérateur d'un groupe
async function isModerator(idGroup: number, userId: string): Promise<boolean> {
    const { data } = await supabase
        .from("GroupMember")
        .select("isModerator")
        .eq("idGroup", idGroup)
        .eq("idUser", userId)
        .single();

    return data?.isModerator === true;
}

// GET /groups/:id/challenges - Lister les défis d'un groupe
async function listGroupChallenges(idGroup: number, userId?: string): Promise<Response> {
    // Récupérer tous les défis actifs du groupe via GroupChallenge
    const { data: groupChallenges, error } = await supabase
        .from("GroupChallenge")
        .select(`
            Challenge (
                idChallenge,
                name,
                description,
                startDateTime,
                endDateTime,
                objective,
                isActive,
                createdAt,
                updatedAt,
                idGroup
            )
        `)
        .eq("idGroup", idGroup);

    if (error) {
        console.error("Error loading challenges:", error);
        return jsonError("Erreur chargement défis", 500);
    }
    if (!groupChallenges) return jsonOk([]);

    // Filtrer les défis actifs
    const challenges = groupChallenges
        .map((gc: any) => gc.Challenge)
        .filter((c: any) => c && c.isActive);

    // Pour chaque défi, calculer les stats
    const challengesWithStats: ChallengeWithStats[] = await Promise.all(
        challenges.map(async (challenge: any) => {
            // Compter les participants et validations
            const { data: participations } = await supabase
                .from("userchallenge")
                .select("idUser, isValidated, completedDate")
                .eq("idChallenge", challenge.idChallenge);

            const totalParticipants = participations?.length || 0;
            const totalValidated = participations?.filter(p => p.isValidated).length || 0;
            const validationRate = totalParticipants > 0
                ? Math.round((totalValidated / totalParticipants) * 100)
                : 0;

            // Récupérer les 3 derniers validateurs
            const { data: recentValidators } = await supabase
                .from("userchallenge")
                .select(`
                    idUser,
                    completedDate,
                    User:User (name, lastname, username)
                `)
                .eq("idChallenge", challenge.idChallenge)
                .eq("isValidated", true)
                .order("completedDate", { ascending: false })
                .limit(3);

            const recentValidatorsList = recentValidators?.map(v => ({
                idUser: v.idUser,
                name: v.User?.name || null,
                lastname: v.User?.lastname || null,
                username: v.User?.username || null,
                completedDate: v.completedDate,
            })) || [];

            // Participation de l'utilisateur courant
            let userParticipation = null;
            if (userId) {
                const userPart = participations?.find(p => p.idUser === userId);
                if (userPart) {
                    userParticipation = {
                        isParticipating: true,
                        isValidated: userPart.isValidated,
                        completedDate: userPart.completedDate,
                    };
                }
            }

            // Vérifier si l'utilisateur est modérateur du groupe
            let userIsModerator = false;
            if (userId) {
                userIsModerator = await isModerator(challenge.idGroup, userId);
            }

            const status = getChallengeStatus(challenge.startDateTime, challenge.endDateTime);
            const daysRemaining = status === 'active' ? getDaysRemaining(challenge.endDateTime) : null;

            return {
                ...challenge,
                totalParticipants,
                totalValidated,
                validationRate,
                status,
                daysRemaining,
                userParticipation,
                userIsModerator,
                recentValidators: recentValidatorsList,
            };
        })
    );

    return jsonOk(challengesWithStats);
}

// GET /challenges/:id - Détails d'un défi
async function getChallengeById(idChallenge: number, userId?: string): Promise<Response> {
    const { data: challenge, error } = await supabase
        .from("Challenge")
        .select("*")
        .eq("idChallenge", idChallenge)
        .eq("isActive", true)
        .single();

    if (error || !challenge) return jsonError("Défi introuvable", 404);

    // Statistiques
    const { data: participations } = await supabase
        .from("userchallenge")
        .select("idUser, isValidated, completedDate")
        .eq("idChallenge", idChallenge);

    const totalParticipants = participations?.length || 0;
    const totalValidated = participations?.filter(p => p.isValidated).length || 0;
    const validationRate = totalParticipants > 0
        ? Math.round((totalValidated / totalParticipants) * 100)
        : 0;

    // Validateurs récents
    const { data: recentValidators } = await supabase
        .from("userchallenge")
        .select(`
            idUser,
            completedDate,
            User:User (name, lastname, username)
        `)
        .eq("idChallenge", idChallenge)
        .eq("isValidated", true)
        .order("completedDate", { ascending: false })
        .limit(3);

    const recentValidatorsList = recentValidators?.map(v => ({
        idUser: v.idUser,
        name: v.User?.name || null,
        lastname: v.User?.lastname || null,
        username: v.User?.username || null,
        completedDate: v.completedDate,
    })) || [];

    // Participation utilisateur
    let userParticipation = null;
    if (userId) {
        const userPart = participations?.find(p => p.idUser === userId);
        if (userPart) {
            userParticipation = {
                isParticipating: true,
                isValidated: userPart.isValidated,
                completedDate: userPart.completedDate,
            };
        }
    }

    // Vérifier si l'utilisateur est modérateur du groupe
    let userIsModerator = false;
    if (userId) {
        userIsModerator = await isModerator(challenge.idGroup, userId);
    }

    const status = getChallengeStatus(challenge.startDateTime, challenge.endDateTime);
    const daysRemaining = status === 'active' ? getDaysRemaining(challenge.endDateTime) : null;

    const challengeWithStats: ChallengeWithStats = {
        ...challenge,
        totalParticipants,
        totalValidated,
        validationRate,
        status,
        daysRemaining,
        userParticipation,
        userIsModerator,
        recentValidators: recentValidatorsList,
    };

    return jsonOk(challengeWithStats);
}

// POST /groups/:id/challenges - Créer un défi
async function createChallenge(idGroup: number, body: CreateChallengeBody): Promise<Response> {
    const { name, description, startDateTime, endDateTime, objective, moderatorId } = body;

    // Validation
    if (!name || !startDateTime || !endDateTime || !objective || !moderatorId) {
        return jsonError("Champs requis manquants", 400);
    }

    // Vérifier que l'utilisateur est modérateur
    const isModeratorCheck = await isModerator(idGroup, moderatorId);
    if (!isModeratorCheck) {
        return jsonError("Vous n'êtes pas autorisé à créer un défi pour ce groupe", 403);
    }

    // Validation des dates
    if (new Date(endDateTime) <= new Date(startDateTime)) {
        return jsonError("La date de fin doit être après la date de début", 400);
    }

    // Validation de l'objectif
    if (objective < 1 || objective > 100) {
        return jsonError("L'objectif doit être entre 1 et 100%", 400);
    }

    // Créer le défi
    const { data: challenge, error: createError } = await supabase
        .from("Challenge")
        .insert({
            name,
            description: description || null,
            startDateTime,
            endDateTime,
            objective,
            isActive: true,
            idGroup: idGroup,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        })
        .select()
        .single();

    if (createError || !challenge) {
        console.error("Error creating challenge:", createError);
        return jsonError("Erreur lors de la création du défi", 500);
    }

    // Créer le lien dans GroupChallenge
    await supabase
        .from("GroupChallenge")
        .insert({
            idGroup,
            idChallenge: challenge.idChallenge,
        });

    // Créer automatiquement les participations pour tous les membres du groupe
    const { data: members } = await supabase
        .from("GroupMember")
        .select("idUser")
        .eq("idGroup", idGroup);

    if (members && members.length > 0) {
        const participations = members.map(member => ({
            idChallenge: challenge.idChallenge,
            idUser: member.idUser,
            idGroup,
            joinedAt: new Date().toISOString(),
            isValidated: false,
            completedDate: null,
        }));

        await supabase
            .from("userchallenge")
            .insert(participations);
    }

    return jsonOk(challenge, 201);
}

// PUT /challenges/:id - Modifier un défi
async function updateChallenge(idChallenge: number, body: UpdateChallengeBody): Promise<Response> {
    const { moderatorId, ...updates } = body;

    if (!moderatorId) {
        return jsonError("moderatorId requis", 400);
    }

    // Récupérer le défi pour vérifier le groupe
    const { data: challenge } = await supabase
        .from("Challenge")
        .select("idGroup")
        .eq("idChallenge", idChallenge)
        .eq("isActive", true)
        .single();

    if (!challenge) return jsonError("Défi introuvable", 404);

    // Vérifier que l'utilisateur est modérateur
    const isModeratorCheck = await isModerator(challenge.idGroup, moderatorId);
    if (!isModeratorCheck) {
        return jsonError("Vous n'êtes pas autorisé à modifier ce défi", 403);
    }

    // Validation des dates si fournies
    if (updates.startDateTime && updates.endDateTime) {
        if (new Date(updates.endDateTime) <= new Date(updates.startDateTime)) {
            return jsonError("La date de fin doit être après la date de début", 400);
        }
    }

    // Validation de l'objectif si fourni
    if (updates.objective !== undefined && (updates.objective < 1 || updates.objective > 100)) {
        return jsonError("L'objectif doit être entre 1 et 100%", 400);
    }

    // Mettre à jour le défi
    const { data: updatedChallenge, error: updateError } = await supabase
        .from("Challenge")
        .update({
            ...updates,
            updatedAt: new Date().toISOString(),
        })
        .eq("idChallenge", idChallenge)
        .select()
        .single();

    if (updateError || !updatedChallenge) {
        console.error("Error updating challenge:", updateError);
        return jsonError("Erreur lors de la modification du défi", 500);
    }

    return jsonOk(updatedChallenge);
}

// DELETE /challenges/:id - Supprimer un défi (soft delete)
async function deleteChallenge(idChallenge: number, moderatorId: string): Promise<Response> {
    if (!moderatorId) {
        return jsonError("moderatorId requis", 400);
    }

    // Récupérer le défi pour vérifier le groupe
    const { data: challenge } = await supabase
        .from("Challenge")
        .select("idGroup")
        .eq("idChallenge", idChallenge)
        .eq("isActive", true)
        .single();

    if (!challenge) return jsonError("Défi introuvable", 404);

    // Vérifier que l'utilisateur est modérateur
    const isModeratorCheck = await isModerator(challenge.idGroup, moderatorId);
    if (!isModeratorCheck) {
        return jsonError("Vous n'êtes pas autorisé à supprimer ce défi", 403);
    }

    // Soft delete : mettre isActive à false
    const { error: deleteError } = await supabase
        .from("Challenge")
        .update({ isActive: false, updatedAt: new Date().toISOString() })
        .eq("idChallenge", idChallenge);

    if (deleteError) {
        console.error("Error deleting challenge:", deleteError);
        return jsonError("Erreur lors de la suppression du défi", 500);
    }

    return jsonOk({ status: "deleted" });
}

// POST /challenges/:id/validate - Valider un défi
async function validateChallenge(idChallenge: number, body: ValidateChallengeBody): Promise<Response> {
    const { userId} = body;

    if (!userId) {
        return jsonError("userId requis", 400);
    }

    // Vérifier que le défi existe et est actif
    const { data: challenge } = await supabase
        .from("Challenge")
        .select("idGroup, startDateTime, endDateTime")
        .eq("idChallenge", idChallenge)
        .eq("isActive", true)
        .single();

    if (!challenge) return jsonError("Défi introuvable", 404);

    // Vérifier que le défi est actif (entre les dates)
    const status = getChallengeStatus(challenge.startDateTime, challenge.endDateTime);
    if (status !== 'active') {
        return jsonError("Ce défi n'est pas actif", 400);
    }

    // Vérifier que l'utilisateur est membre du groupe
    const { data: member } = await supabase
        .from("GroupMember")
        .select("idUser")
        .eq("idGroup", challenge.idGroup)
        .eq("idUser", userId)
        .single();

    if (!member) {
        return jsonError("Vous devez être membre du groupe pour valider ce défi", 403);
    }

    // Vérifier que l'utilisateur n'a pas déjà validé
    const { data: participation } = await supabase
        .from("userchallenge")
        .select("isValidated")
        .eq("idChallenge", idChallenge)
        .eq("idUser", userId)
        .single();

    if (!participation) {
        // Créer la participation si elle n'existe pas (nouveau membre)
        const { error: insertError } = await supabase
            .from("userchallenge")
            .insert({
                idChallenge,
                idUser: userId,
                idGroup: challenge.idGroup,
                joinedAt: new Date().toISOString(),
                isValidated: true,
                completedDate: new Date().toISOString(),
            });

        if (insertError) {
            console.error("Error creating participation:", insertError);
            return jsonError("Erreur lors de la validation", 500);
        }
    } else {
        if (participation.isValidated) {
            return jsonError("Vous avez déjà validé ce défi", 400);
        }

        // Mettre à jour la participation
        const { error: updateError } = await supabase
            .from("userchallenge")
            .update({
                isValidated: true,
                completedDate: new Date().toISOString(),
            })
            .eq("idChallenge", idChallenge)
            .eq("idUser", userId);

        if (updateError) {
            console.error("Error updating participation:", updateError);
            return jsonError("Erreur lors de la validation", 500);
        }
    }

    return jsonOk({ status: "validated" });
}

// GET /groups/:id/challenges/leaderboard - Classement du groupe
async function getLeaderboard(idGroup: number): Promise<Response> {
    // Récupérer toutes les participations du groupe avec comptage
    const { data: participations, error } = await supabase
        .from("userchallenge")
        .select(`
            idUser,
            isValidated,
            completedDate,
            User:User (name, lastname, username)
        `)
        .eq("idGroup", idGroup)
        .eq("isValidated", true);

    if (error) {
        console.error("Error fetching leaderboard:", error);
        return jsonError("Erreur lors du chargement du classement", 500);
    }

    if (!participations || participations.length === 0) {
        return jsonOk([]);
    }

    // Grouper par utilisateur et compter
    const userStats = new Map<string, {
        idUser: string;
        name: string | null;
        lastname: string | null;
        username: string | null;
        totalChallengesCompleted: number;
        lastValidationDate: string | null;
    }>();

    participations.forEach(p => {
        const existing = userStats.get(p.idUser);
        if (existing) {
            existing.totalChallengesCompleted++;
            if (p.completedDate && (!existing.lastValidationDate || p.completedDate > existing.lastValidationDate)) {
                existing.lastValidationDate = p.completedDate;
            }
        } else {
            userStats.set(p.idUser, {
                idUser: p.idUser,
                name: p.User?.name || null,
                lastname: p.User?.lastname || null,
                username: p.User?.username || null,
                totalChallengesCompleted: 1,
                lastValidationDate: p.completedDate,
            });
        }
    });

    // Convertir en tableau et trier
    const leaderboard = Array.from(userStats.values())
        .sort((a, b) => {
            if (a.totalChallengesCompleted !== b.totalChallengesCompleted) {
                return b.totalChallengesCompleted - a.totalChallengesCompleted;
            }
            // En cas d'égalité, celui qui a validé le plus récemment est devant
            if (a.lastValidationDate && b.lastValidationDate) {
                return b.lastValidationDate.localeCompare(a.lastValidationDate);
            }
            return 0;
        })
        .map((user, index) => ({
            rank: index + 1,
            ...user,
            currentStreak: 0, // TODO: implémenter le calcul de streak si besoin
        } as ChallengeLeaderboardEntry));

    return jsonOk(leaderboard);
}

// Routage principal
Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);

    // Extraire le token d'authentification pour récupérer l'userId
    const authHeader = req.headers.get("authorization");
    let currentUserId: string | undefined;
    if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        try {
            const { data: { user } } = await supabase.auth.getUser(token);
            currentUserId = user?.id;
        } catch (e) {
            console.error("Error getting user from token:", e);
        }
    }

    try {
        // Trouver l'index de "groups" ou "challenges" dans les segments
        const groupsIdx = segments.indexOf("groups");
        const challengesIdx = segments.indexOf("challenges");

        // GET /groups/:id/challenges
        if (req.method === "GET" && groupsIdx !== -1) {
            const restAfterGroups = segments.slice(groupsIdx + 1);
            if (restAfterGroups.length === 2 && restAfterGroups[1] === "challenges") {
                const idGroup = Number(restAfterGroups[0]);
                if (Number.isNaN(idGroup)) return jsonError("idGroup invalide", 400);
                return await listGroupChallenges(idGroup, currentUserId);
            }
            // GET /groups/:id/challenges/leaderboard
            if (restAfterGroups.length === 3 && restAfterGroups[1] === "challenges" && restAfterGroups[2] === "leaderboard") {
                const idGroup = Number(restAfterGroups[0]);
                if (Number.isNaN(idGroup)) return jsonError("idGroup invalide", 400);
                return await getLeaderboard(idGroup);
            }
        }

        // POST /groups/:id/challenges
        if (req.method === "POST" && groupsIdx !== -1) {
            const restAfterGroups = segments.slice(groupsIdx + 1);
            if (restAfterGroups.length === 2 && restAfterGroups[1] === "challenges") {
                const idGroup = Number(restAfterGroups[0]);
                if (Number.isNaN(idGroup)) return jsonError("idGroup invalide", 400);
                const body = await req.json();
                return await createChallenge(idGroup, body);
            }
        }

        // Routes pour /challenges/:id
        if (challengesIdx !== -1) {
            const restAfterChallenges = segments.slice(challengesIdx + 1);

            // GET /challenges/:id
            if (req.method === "GET" && restAfterChallenges.length === 1) {
                const idChallenge = Number(restAfterChallenges[0]);
                if (Number.isNaN(idChallenge)) return jsonError("idChallenge invalide", 400);
                return await getChallengeById(idChallenge, currentUserId);
            }

            // PUT /challenges/:id
            if (req.method === "PUT" && restAfterChallenges.length === 1) {
                const idChallenge = Number(restAfterChallenges[0]);
                if (Number.isNaN(idChallenge)) return jsonError("idChallenge invalide", 400);
                const body = await req.json();
                return await updateChallenge(idChallenge, body);
            }

            // DELETE /challenges/:id
            if (req.method === "DELETE" && restAfterChallenges.length === 1) {
                const idChallenge = Number(restAfterChallenges[0]);
                if (Number.isNaN(idChallenge)) return jsonError("idChallenge invalide", 400);
                const body = await req.json();
                return await deleteChallenge(idChallenge, body.moderatorId);
            }

            // POST /challenges/:id/validate
            if (req.method === "POST" && restAfterChallenges.length === 2 && restAfterChallenges[1] === "validate") {
                const idChallenge = Number(restAfterChallenges[0]);
                if (Number.isNaN(idChallenge)) return jsonError("idChallenge invalide", 400);
                const body = await req.json();
                return await validateChallenge(idChallenge, body);
            }
        }

        return jsonError("Route non trouvée", 404);
    } catch (err) {
        console.error("challenge edge function error:", err);
        return jsonError("Erreur interne serveur", 500);
    }
});
