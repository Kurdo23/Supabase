import { SupabaseClient } from '@supabase/supabase-js';

// TODO check for response status to see if they all fit the right kind of response
// ============================================
// FONCTION PRINCIPALE
// ============================================

/**
 * Récupère TOUT en une seule fois pour les groupes :
 * - Les statistiques (total groupes, actifs, inactifs, membres totaux, points totaux)
 * - La liste paginée des groupes avec leurs infos complètes
 * - Les métadonnées de pagination
 *
 * @param supabase - Client Supabase initialisé
 * @param page - Numéro de page (par défaut 1)
 * @param pageSize - Nombre de groupes par page (par défaut 20)
 * @param statusFilter - Filtrer par statut : 'all' | 'active' | 'inactive' (par défaut 'all')
 * @param typeFilter - Filtrer par type : 'all' | 'family' | 'enterprise' | 'association' | 'other' (par défaut 'all')
 * @param searchQuery - Recherche par nom, description ou admin (optionnel)
 * @returns Promise avec statistiques + groupes paginés
 */
export async function getCompleteGroupSummary(
    supabase: SupabaseClient,
    page: number = 1,
    pageSize: number = 20,
    statusFilter: 'all' | 'active' | 'inactive' = 'all',
    typeFilter: 'all' | 'family' | 'enterprise' | 'association' | 'other' = 'all',
    searchQuery?: string
): Promise<CompleteGroupResponse> {
    try {
        // Validation des paramètres
        if (page < 1) {
            throw new Error('Le numéro de page doit être supérieur ou égal à 1');
        }
        if (pageSize < 1 || pageSize > 100) {
            throw new Error('La taille de page doit être entre 1 et 100');
        }

        // ========================================
        // ÉTAPE 1: RÉCUPÉRER LES STATISTIQUES
        // ========================================

        // Total groupes
        const { count: totalCount, error: totalError } = await supabase
            .from('Group')
            .select('*', { count: 'exact', head: true })


        if (totalError) throw new Error(`Erreur total: ${totalError.message}`);

        // Groupes inactif
        const { count: inactiveCount, error: activeError } = await supabase
            .from('Group')
            .select('*', { count: 'exact', head: true })
            .is('isSoftDelete', true)

        if (activeError) throw new Error(`Erreur actifs: ${activeError.message}`);

        // Groupes inactifs
        const activeCount = (totalCount || 0) - ( inactiveCount|| 0);

      /*  // Total membres (somme de tous les member_count)
        const { data: memberData, error: memberError } = await supabase
            .from('GroupMember')
            .select('idUser', {count: 'exact', head: true})
            .eq('idGroup', idGroup)*/

        //if (memberError) throw new Error(`Erreur membres: ${memberError.message}`);

        //const totalMembers = memberData?.reduce((sum, group) => sum + (group.member_count || 0), 0) || 0;

       /* // Total points (somme de tous les total_points)
        const { data: pointsData, error: pointsError } = await supabase
            .from('groups')
            .select('total_points')
            .is('deleted_at', null);*/

        //if (pointsError) throw new Error(`Erreur points: ${pointsError.message}`);

        //const totalPoints = pointsData?.reduce((sum, group) => sum + (group.total_points || 0), 0) || 0;µ
        let totalPoints = 0;
        let totalMembers = 0;
        const stats: GroupStats = {
            totalGroups: totalCount || 0,
            activeGroups: activeCount || 0,
            inactiveGroups: inactiveCount,
            totalMembers,
            totalPoints,
            lastUpdated: new Date().toISOString(),
        };

        // ========================================
        // ÉTAPE 2: RÉCUPÉRER LA LISTE PAGINÉE
        // ========================================

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        // Construction de la requête avec jointure sur les admins
        let query = supabase
            .from('Group')
            .select('*', { count: 'exact' })
            .range(from, to)
            //.order('name', { ascending: true });

        /*// Appliquer le filtre de statut
        if (statusFilter !== 'all') {
            query = query.eq('status', statusFilter);
        }*/

        /*// Appliquer le filtre de type
        if (typeFilter !== 'all') {
            query = query.eq('type', typeFilter);
        }*/

        /*// Appliquer la recherche
        if (searchQuery && searchQuery.trim()) {
            query = query.or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
        }*/

        const { data, error: groupsError, count: groupsCount } = await query;

        if (groupsError) {
            throw new Error(`Erreur groupes: ${groupsError.message}`);
        }

        // Transformer les données pour le format attendu
        const groups: GroupProfile[] = (data || []).map((group: any) => ({
            idGroup: group.idGroup,
            name: group.name,
            description: group.description,
            logo: group.logo,
            isOpen: group.isOpen,
            isCertified: group.isCertified,
            isPublic: group.isPublic,
            isSoftDelete: group.isSoftDelete,
            created_at: group.created_at,
        }));

        // ========================================
        // ÉTAPE 3: CALCULER LES MÉTADONNÉES
        // ========================================

        const relevantCount = groupsCount || 0;
        const totalPages = relevantCount > 0
            ? Math.ceil(relevantCount / pageSize)
            : 1;
        const hasMore = page < totalPages;

        const summary: CompleteGroupSummary = {
            stats,
            groups,
            pagination: {
                currentPage: page,
                pageSize,
                totalCount: relevantCount,
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
        console.error('Erreur lors de la récupération complète des groupes:', errorMessage);

        return {
            summary: null,
            error: errorMessage,
            success: false,
        };
    }
}

/**
 * Récupère TOUS les groupes (toutes les pages) avec les statistiques
 * ⚠️ À utiliser avec précaution si vous avez beaucoup de groupes
 *
 * @param supabase - Client Supabase
 * @param statusFilter - Filtrer par statut
 * @param typeFilter - Filtrer par type
 * @param maxPages - Limite de sécurité (par défaut 100)
 * @returns Promise avec stats + tous les groupes
 */
export async function getAllGroupsWithStats(
    supabase: SupabaseClient,
    statusFilter: 'all' | 'active' | 'inactive' = 'all',
    typeFilter: 'all' | 'family' | 'enterprise' | 'association' | 'other' = 'all',
    maxPages: number = 100
): Promise<CompleteGroupResponse> {
    try {
        const allGroups: GroupProfile[] = [];
        let currentPage = 1;
        let stats: GroupStats | null = null;
        let pagination: CompleteGroupSummary['pagination'] | null = null;

        while (currentPage <= maxPages) {
            const response = await getCompleteGroupSummary(
                supabase,
                currentPage,
                20,
                statusFilter,
                typeFilter
            );

            if (!response.success || !response.summary) {
                throw new Error(response.error || 'Erreur de récupération');
            }

            // Sauvegarder les stats (identiques à chaque page)
            if (currentPage === 1) {
                stats = response.summary.stats;
            }

            // Ajouter les groupes
            allGroups.push(...response.summary.groups);

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
                groups: allGroups,
                pagination: {
                    ...pagination,
                    currentPage: 1,
                    pageSize: allGroups.length,
                    hasMore: false,
                },
            },
            error: null,
            success: true,
        };

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
        console.error('Erreur getAllGroupsWithStats:', errorMessage);

        return {
            summary: null,
            error: errorMessage,
            success: false,
        };
    }
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Formatte les points en format lisible (ex: 141000 → "141k")
 */
export function formatPoints(points: number): string {
    if (points >= 1000000) {
        return `${Math.floor(points / 1000000)}M`;
    }
    if (points >= 1000) {
        return `${Math.floor(points / 1000)}k`;
    }
    return points.toString();
}

/**
 * Retourne le label français du type de groupe
 */
export function getGroupTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        family: 'Famille',
        enterprise: 'Entreprise',
        association: 'Association',
        other: 'Autre',
    };
    return labels[type] || type;
}

/**
 * Retourne l'icône/emoji correspondant au type de groupe
 */
export function getGroupTypeIcon(type: string): string {
    const icons: Record<string, string> = {
        family: '👨‍👩‍👧‍👦',
        enterprise: '🏢',
        association: '🤝',
        other: '👥',
    };
    return icons[type] || '📁';
}

export async function getGroupDetail(supabase: SupabaseClient, idGroup: number):Promise<CompleteResponse>{
    try{
        let query = supabase
            .from('Group')
            .select('*', { count: 'exact' })
            .eq('idGroup', idGroup)
            .single();

        const { data, error: usersError } = await query;
        if (usersError) {
            throw new Error(`Erreur utilisateurs: ${usersError.message}`);
        }

        const group: GroupProfile = data || [];
        return {
            group,
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

export async function softDeleteGroup(supabase: SupabaseClient, idGroup: number): Promise<CompleteResponse>{
    try{
        let query = supabase
            .from('Group')
            .update({isSoftDelete: true}  )
            .eq('idGroup', idGroup)

        const {  error: groupError } = await query;
        if (groupError) {
            throw new Error(`Erreur utilisateurs: ${groupError.message}`);
        }
        const data = {
            status: 200,
            message: "soft delete completed",
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
            data: null,
            error: errorMessage,
            success: false,
        };
    }
}

export async function permanentelyDeleteGroup(supabase: SupabaseClient, idGroup: number):Promise<CompleteResponse>{
    try{
        let query = supabase
            .from('Group')
            .delete()
            .eq('idGroup', idGroup)

        const { error: DeleteError } = await query;
        if (DeleteError) {
            throw new Error(`Erreur utilisateurs: ${DeleteError.message}`);
        }
        let response = {
            status: 200,
            message: "hard delete completed"
        }
        return{
            response,
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

// ============================================
// NOTES IMPORTANTES
// ============================================

/*
STRUCTURE DE TABLE REQUISE (groups):
- uuid: identifiant unique du groupe
- name: nom du groupe
- description: description (nullable)
- avatar: URL de l'avatar du groupe (nullable)
- status: 'active' | 'inactive'
- type: 'family' | 'enterprise' | 'association' | 'other'
- member_count: nombre de membres dans le groupe
- total_points: points totaux accumulés par le groupe
- admin_uuid: UUID de l'administrateur (FK vers profiles)
- deleted_at: timestamp soft delete (NULL si actif)
- created_at: date de création

RELATION AVEC LA TABLE profiles:
- groups.admin_uuid → profiles.uuid (foreign key)

INDEXES RECOMMANDÉS:
CREATE INDEX idx_groups_status ON groups(status);
CREATE INDEX idx_groups_type ON groups(type);
CREATE INDEX idx_groups_admin_uuid ON groups(admin_uuid);
CREATE INDEX idx_groups_deleted_at ON groups(deleted_at);
CREATE INDEX idx_groups_name ON groups(name);

FONCTIONNALITÉS:
✅ Statistiques complètes (total, actifs, inactifs, membres, points)
✅ Pagination native Supabase
✅ Filtrage par statut (actif/inactif)
✅ Filtrage par type (famille/entreprise/association/autre)
✅ Recherche textuelle (nom, description)
✅ Jointure avec la table profiles pour récupérer le nom de l'admin
✅ Composant React complet fourni en exemple
*/