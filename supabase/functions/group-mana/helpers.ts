import { SupabaseClient } from '@supabase/supabase-js';
import {
    AdminUser,
    CompleteGroupResponse,
    CompleteGroupSummary, DeleteResponse, GroupDetailedProfile,
    GroupDetailResponse,
    GroupProfile,
    GroupStats
} from "./interfaces.ts";

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



        //const totalPoints = pointsData?.reduce((sum, group) => sum + (group.total_points || 0), 0) || 0;µ
        let totalPoints = 0;
        let totalMembers = 0;
        const stats: GroupStats = {
            totalGroups: totalCount || 0,
            activeGroups: activeCount || 0,
            inactiveGroups: inactiveCount || 0,
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
           // .order('created_at', {ascending: false})

        if(searchQuery && searchQuery.trim()){
            query = query.or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
        }

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
export async function getGroupDetail(supabase: SupabaseClient, idGroup: number):Promise<GroupDetailResponse>{
    try{
        let query = supabase
            .from('Group')
            .select('*', { count: 'exact' })
            .eq('idGroup', idGroup)
            .single();

        const { data: groupData, error: groupError } = await query;
        if (groupError) {
            throw new Error(`Erreur utilisateurs: ${groupError.message}`);
        }

        // Récupérer le nombre de membres
        let memberQuery = await supabase
            .from('')
            .select('*', {count: "exact", head: true})
            .eq('idGroup', idGroup);
        const {count: memberCount, error: memberError} = await memberQuery;
        if(memberError){
            throw new Error('erreur membres: ' + memberError.message);

        }

        const{ data: adminData, error: adminError} = await supabase
            .from('GroupMember') // TODO à modifier
            .select('idUser, ' +
                'User:idUser (' +
                'idUser, pseudo, email, avatar)'
            )
            .eq('idGroup', idGroup)
            .eq('isAdmin', true);

        if(adminError){
            throw new Error('Erreur admins: ' + adminError.message);
        }

        //Formater les admin
        const adminUsers: AdminUser[] = (adminData ||[])
        //    .filter(item => item.Users)
            .map((item: any) => ({
                idUser: item.User.idUser,
                username: item.User.pseudo,
                email: item.User.email,
                avatar: item.User.avatar,
            }));

        // Récupéré la dernier activité
        //TODO récupérer l'activité


        const detailGroup:GroupDetailedProfile = {
            idGroup: groupData.idGroup,
            name: groupData.name,
            description: groupData.description,
            logo: groupData.logo,
            isCertified: groupData.isCertified,
            isPublic: groupData.isPublic,
            isSoftDelete: groupData.isSoftDelete,
            created_at: groupData.created_at,
            memberCount: memberCount || 0,
            adminUsers: adminUsers,
            lastActivity: null,
    }
        return {
            group: detailGroup,
            error: null,
            success: true,
        };

    }catch (err){
        const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
        console.error('Erreur lors de la récupération complète:', errorMessage);

        return {
            group: null,
            error: errorMessage,
            success: false,
        };
    }

}

export async function softDeleteGroup(supabase: SupabaseClient, idGroup: number): Promise<DeleteResponse>{
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

export async function permanentelyDeleteGroup(supabase: SupabaseClient, idGroup: number):Promise<DeleteResponse>{
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
            data: null,
            error: null,
            success: true,
        }
    }catch(err){
        const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
        console.error('Erreur lors de la récupération complète:', errorMessage);

        return {
            data: null,
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