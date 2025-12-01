import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Récupère toutes les statistiques du dashboard admin
 *
 * Statistiques utilisateurs :
 * - Total d'utilisateurs
 * - Utilisateurs actifs aujourd'hui
 * - Nouveaux utilisateurs ce mois-ci
 * - Utilisateurs actifs (connectés ce mois)
 * - Utilisateurs inactifs
 * - Nouveaux utilisateurs
 * - Utilisateurs par mois (inscrits)
 *
 * Statistiques challenges :
 * - Liste des challenges non-brouillon avec leur nombre de participants
 *
 * @param supabase - Client Supabase initialisé
 * @returns Promise avec toutes les statistiques
 */
export async function getDashboardStats(
    supabase: SupabaseClient
): Promise<DashboardResponse> {
    try {
        // ========================================
        // DATES DE RÉFÉRENCE
        // ========================================

        const now = new Date();

        // Début du jour actuel (UTC)
        const startOfToday = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate()
        ));

        // Début du mois actuel (UTC)
        const startOfMonth = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            1
        ));

        const startOfTodayISO = startOfToday.toISOString();
        const startOfMonthISO = startOfMonth.toISOString();

        // ========================================
        // STATISTIQUES UTILISATEURS
        // ========================================

        // Total utilisateurs (non supprimés)
        const { count: totalUsers, error: totalError } = await supabase
            .from('User')
            .select('*', { count: 'exact', head: true })

        if (totalError) throw new Error(`Erreur total utilisateurs: ${totalError.message}`);

        // Utilisateurs actifs aujourd'hui (connectés aujourd'hui)
        const { count: activeToday, error: activeTodayError } = await supabase
            .from('User')
            .select('*', { count: 'exact', head: true })
            .is('isSoftDelete', false)
            .gte('last_sign_in_at', startOfTodayISO);

        if (activeTodayError) throw new Error(`Erreur actifs aujourd'hui: ${activeTodayError.message}`);

        // Nouveaux utilisateurs ce mois (créés ce mois)
        const { count: newThisMonth, error: newThisMonthError } = await supabase
            .from('User')
            .select('*', { count: 'exact', head: true })
            .is('isSoftDelete', false)
            .gte('dateinscription', startOfMonthISO);

        if (newThisMonthError) throw new Error(`Erreur nouveaux ce mois: ${newThisMonthError.message}`);

        // Utilisateurs actifs (connectés ce mois)
        const { count: activeUsers, error: activeError } = await supabase
            .from('User')
            .select('*', { count: 'exact', head: true })
            .is('isSoftDelete', false)
            .gte('last_sign_in_at', startOfMonthISO);

        if (activeError) throw new Error(`Erreur utilisateurs actifs: ${activeError.message}`);

        // Calculer les utilisateurs inactifs
        const {count: inactiveUsers, error: inactiveError} = await supabase
            .from('User')
            .select('*', {count: 'exact', head: true})
            .is('isSoftDelete', true);

        // ========================================
        // UTILISATEURS PAR MOIS
        // ========================================

        // Récupérer tous les utilisateurs avec leur date de création
        const { data: allUsers, error: allUsersError } = await supabase
            .from('User')
            .select('dateinscription')
            .is('isSoftDelete', false)
            .order('dateinscription', { ascending: true });

        if (allUsersError) throw new Error(`Erreur récupération utilisateurs: ${allUsersError.message}`);

        // Grouper par mois
        const usersByMonth = groupUsersByMonth(allUsers || []);

        // ========================================
        // STATISTIQUES CHALLENGES
        // ========================================

        // Récupérer les challenges non-brouillon
        const { data: challenges, error: challengesError } = await supabase
            .from('Challenge')
            .select('idChallenge, name')
            .is('isDraft', false);

        if (challengesError) throw new Error(`Erreur récupération challenges: ${challengesError.message}`);

        // Pour chaque challenge, compter les participants
        const challengesWithParticipants = await Promise.all(
            (challenges || []).map(async (challenge) => {

                const { count: participantCount, error: participantError } = await supabase
                    .from('userchallenge')
                    .select('iduser', { count: 'exact', head: true })
                    .eq('idchallenge', challenge.idChallenge);

                if (participantError) {

                    console.warn(`Erreur comptage participants pour challenge ${challenge.idChallenge}:`, participantError);
                    return {
                        name: challenge.name,
                        participantCount: 0,
                        idChallenge: challenge.idChallenge,
                    };
                }

                return {
                    name: challenge.name,
                    participantCount: participantCount || 0,
                    idChallenge: challenge.idChallenge,
                };
            })
        );

        // ========================================
        // CONSTRUIRE LA RÉPONSE
        // ========================================

        const stats: DashboardStats = {
            users: {
                total: totalUsers || 0,
                activeToday: activeToday || 0,
                newThisMonth: newThisMonth || 0,
                active: activeUsers || 0,
                inactive: inactiveUsers,
                newUsers: newThisMonth || 0, // Alias pour clarté
            },
            challenges: challengesWithParticipants.sort((a, b) => b.participantCount - a.participantCount),
            usersByMonth,
            lastUpdated: new Date().toISOString(),
        };

        return {
            stats,
            error: null,
            success: true,
        };

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
        console.error('Erreur lors de la récupération des statistiques dashboard:', errorMessage);

        return {
            stats: null,
            error: errorMessage,
            success: false,
        };
    }
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Groupe les utilisateurs par mois d'inscription
 */
function groupUsersByMonth(users: { dateinscription: string }[]): {
    month: string;
    year: number;
    count: number;
}[] {
    if (!users || users.length === 0) {
        return [];
    }

    const monthMap = new Map<string, { year: number; month: number; count: number }>();

    users.forEach(user => {
        if (!user.dateinscription) return;

        const date = new Date(user.dateinscription);
        const year = date.getUTCFullYear();
        const month = date.getUTCMonth() + 1; // 1-12
        const key = `${year}-${month.toString().padStart(2, '0')}`;

        if (monthMap.has(key)) {
            const existing = monthMap.get(key)!;
            existing.count++;
        } else {
            monthMap.set(key, { year, month, count: 1 });
        }
    });

    // Convertir en tableau et trier par date (année puis mois)
    return Array.from(monthMap.values())
        .sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            return a.month - b.month;
        })
        .map(item => ({
            month: getMonthName(item.month),
            year: item.year,
            count: item.count,
        }));
}

/**
 * Retourne le nom du mois en français
 */
function getMonthName(month: number): string {
    const months = [
        'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    return months[month - 1] || 'Inconnu';
}

/**
 * Retourne le numéro du mois à partir du nom
 */
function getMonthNumber(monthName: string): number {
    const months = [
        'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    return months.indexOf(monthName) + 1;
}

/**
 * Formate un nombre en format lisible (ex: 1000 → "1k")
 */
export function formatNumber(num: number): string {
    if (num >= 1000000) {
        return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
        return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
}
