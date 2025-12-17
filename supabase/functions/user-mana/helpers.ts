import { SupabaseClient } from '@supabase/supabase-js';

// TODO check for response status to see if they all fit the right kind of response
/**
 * Récupère TOUT en une seule fois :
 * - Les statistiques (total, actifs, inactifs, suspendus)
 * - La liste paginée des utilisateurs
 * - Les métadonnées de pagination
 *
 * @param supabase - Client Supabase initialisé
 * @param page - Numéro de page (par défaut 1)
 * @param pageSize - Nombre d'utilisateurs par page (par défaut 20)
 * @param includeDeleted - Inclure les utilisateurs suspendus dans la liste (par défaut false)
 * @returns Promise avec statistiques + utilisateurs paginés
 */
export async function getCompleteUsersSummary(
    supabase: SupabaseClient,
    page: number = 1,
    pageSize: number = 20,
    includeDeleted: boolean = true
): Promise<CompleteResponse> {
    try {
        // Validation des paramètres
        if (page < 1) {
            throw new Error('Le numéro de page doit être supérieur ou égal à 1');
        }
        if (pageSize < 1 || pageSize > 100) {
            throw new Error('La taille de page doit être entre 1 et 100');
        }

        // Calculer le début du mois courant pour les stats
        const now = new Date();
        const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
        const startOfMonthISO = startOfMonth.toISOString();

        // ========================================
        // ÉTAPE 1: RÉCUPÉRER LES STATISTIQUES
        // ========================================

        // Total (non supprimés)
        const { count: totalCount, error: totalError } = await supabase
            .from('User')
            .select('*', { count: 'exact', head: true })
            //.is('isSoftDelete', false);

        if (totalError) throw new Error(`Erreur total: ${totalError.message}`);

        // Actifs (connectés ce mois)
        const { count: activeCount, error: activeError } = await supabase
            .from('User')
            .select('*', { count: 'exact', head: true })
            .is('isSoftDelete', false)
            .gte('last_sign_in_at', startOfMonthISO);

        if (activeError) throw new Error(`Erreur actifs: ${activeError.message}`);

        // Suspendus (soft deleted)
        const { count: suspendedCount, error: suspendedError } = await supabase
            .from('User')
            .select('*', { count: 'exact', head: true })
            .not('isSoftDelete', 'is', false);

        if (suspendedError) throw new Error(`Erreur suspendus: ${suspendedError.message}`);

        // Inactifs (total - actifs)
        const inactiveCount = (totalCount || 0) - (activeCount || 0);

        const stats: UserStats = {
            total: totalCount || 0,
            active: activeCount || 0,
            inactive: inactiveCount,
            suspended: suspendedCount || 0,
            lastUpdated: new Date().toISOString(),
        };

        // ========================================
        // ÉTAPE 2: RÉCUPÉRER LA LISTE PAGINÉE
        // ========================================

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = supabase
            .from('User')
            .select('idUser, username, email, isSoftDelete', { count: 'exact' })
            .range(from, to)
            //.order('name', { ascending: true });

        // Filtrer les supprimés si demandé
        if (!includeDeleted) {
            query = query.is('isSoftDelete', true);
        }

        const { data, error: usersError, count: usersCount } = await query;

        if (usersError) {
            throw new Error(`Erreur utilisateurs: ${usersError.message}`);
        }

        // Nettoyer les données (enlever deleted_at de l'objet retourné)
        const users: UserProfile[] = (data || []).map(({...user }) => user);

        // ========================================
        // ÉTAPE 3: CALCULER LES MÉTADONNÉES
        // ========================================

        const relevantCount = includeDeleted
            ? (totalCount || 0) + (suspendedCount || 0)
            : (totalCount || 0);

        const totalPages = relevantCount > 0
            ? Math.ceil(relevantCount / pageSize)
            : 1;

        const hasMore = page < totalPages;

        const summary: CompleteSummary = {
            stats,
            users,
            pagination: {
                currentPage: page,
                pageSize,
                totalCount: usersCount || 0,
                totalPages,
                hasMore,
            },
        };

        return {
            summary,
            error: null,
            success: true,
        };

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
        console.error('Erreur lors de la récupération complète:', errorMessage);

        return {
            summary: null,
            error: errorMessage,
            success: false,
        };
    }
}

/**
 * Récupère TOUS les utilisateurs (toutes les pages) avec les statistiques
 * ⚠️ À utiliser avec précaution si vous avez beaucoup d'utilisateurs
 *
 * @param supabase - Client Supabase
 * @param includeDeleted - Inclure les utilisateurs suspendus (par défaut false)
 * @param maxPages - Limite de sécurité (par défaut 100)
 * @returns Promise avec stats + tous les utilisateurs
 */
export async function getAllUsersWithStats(
    supabase: SupabaseClient,
    includeDeleted: boolean = false,
    maxPages: number = 100
): Promise<CompleteResponse> {
    try {
        const allUsers: UserProfile[] = [];
        let currentPage = 1;
        let stats: UserStats | null = null;
        let pagination: CompleteSummary['pagination'] | null = null;

        while (currentPage <= maxPages) {
            const response = await getCompleteUsersSummary(
                supabase,
                currentPage,
                20,
                includeDeleted
            );

            if (!response.success || !response.summary) {
                throw new Error(response.error || 'Erreur de récupération');
            }

            // Sauvegarder les stats (identiques à chaque page)
            if (currentPage === 1) {
                stats = response.summary.stats;
            }

            // Ajouter les utilisateurs
            allUsers.push(...response.summary.users);

            // Sauvegarder les infos de pagination
            pagination = response.summary.pagination;

            // Arrêter s'il n'y a plus de pages
            if (!response.summary.pagination.hasMore) {
                break;
            }

            currentPage++;
        }

        if (!stats || !pagination) {
            throw new Error('Impossible de récupérer les données');
        }

        return {
            summary: {
                stats,
                users: allUsers,
                pagination: {
                    ...pagination,
                    currentPage: 1,
                    pageSize: allUsers.length,
                    hasMore: false,
                },
            },
            error: null,
            success: true,
        };

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
        console.error('Erreur getAllUsersWithStats:', errorMessage);

        return {
            summary: null,
            error: errorMessage,
            success: false,
        };
    }
}

/**
 * Récupère toutes les info de l'utilisateur sur base de son id pour pouvoir display toutes les données
 * @param supabase - Client supabase
 * @param idUser - id de l'utilisateur
 */
export async function getUserDetail(supabase: SupabaseClient, idUser: string):Promise<CompleteResponse>{
    try{
        let query = supabase
            .from('User')
            .select('*', { count: 'exact' })
            .eq('idUser', idUser)

        const { data, error: usersError, count: usersCount } = await query;
        if (usersError) {
            throw new Error(`Erreur utilisateurs: ${usersError.message}`);
        }

        const user: UserDetail = data || [];
        return {
            user,
            error: null,
            success: true,
        };

    }catch (err){
        const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
        console.error('Erreur lors de la récupération complète:', errorMessage);

        return {
            summary: null,
            error: errorMessage,
            success: false,
        };
    }

}

export async function softDelete(supabase: SupabaseClient, idUser:string):Promise<CompleteResponse>{
    try{
        let query = supabase
            .from('User')
            .update({isSoftDelete: true}  )
            .eq('idUser', idUser)

        const { data, error: usersError, count: usersCount } = await query;
        if (usersError) {
            throw new Error(`Erreur utilisateurs: ${usersError.message}`);
        }

        return{
            data,
            error: null,
            success: true,
        }
    }catch (err){
        const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
        console.error('Erreur lors de la récupération complète:', errorMessage);

        return {
            summary: null,
            error: errorMessage,
            success: false,
        };
    }
}

export async function permanentlyDelete(supabase: SupabaseClient, idUser: string): Promise<CompleteResponse>{
    try{
        let query = supabase
            .from('User')
            .delete()
            .eq('idUser', idUser)

        const { data, error: usersError, count: usersCount } = await query;
        if (usersError) {
            throw new Error(`Erreur utilisateurs: ${usersError.message}`);
        }

        return{
            data,
            error: null,
            success: true,
        }
    }catch(err){
        const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
        console.error('Erreur lors de la récupération complète:', errorMessage);

        return {
            summary: null,
            error: errorMessage,
            success: false,
        };
    }
}
// TODO add avatar to the mix once it's available