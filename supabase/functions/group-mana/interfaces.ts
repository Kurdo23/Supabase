import {SupabaseClient} from "@supabase/supabase-js";

export interface GroupProfile {
    idGroup: number;
    name: string;
    description: string;
    logo: string;
    isCertified: boolean;
    isPublic: boolean;
    isSoftDelete: boolean;
    created_at: string;
}

export interface GroupDetailedProfile extends GroupProfile{
    memberCount: number;
    adminUsers: AdminUser[];
    lastActivity: string |null;
}

export interface AdminUser{
    idUser: string;
    username: string;
    email: string;
    avatar?: string;
}
export interface GroupStats {
    totalGroups: number;
    activeGroups: number;
    inactiveGroups: number | 0;
    totalMembers: number;
    totalPoints: number;
    lastUpdated: string;
}

export interface CompleteGroupSummary {
    stats: GroupStats;
    groups: GroupProfile[];
    pagination: {
        currentPage: number;
        pageSize: number;
        totalCount: number;
        totalPages: number;
        hasMore: boolean;
    };
}

export interface CompleteGroupResponse {
    summary: CompleteGroupSummary | null;
    error: string | null;
    success: boolean;
}

export interface GroupDetailResponse{
    group: GroupDetailedProfile | null;
    error: string | null;
    success: boolean;
}

export interface DeleteResponse{
    data: {
        status: number;
        message: string;
    } | null;
    error: string | null;
    success: boolean;
}