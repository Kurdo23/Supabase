import {SupabaseClient} from "@supabase/supabase-js";

interface GroupProfile {
    idGroup: number;
    name: string;
    description: string;
    logo: string;
    isOpen: boolean;
    isCertified: boolean;
    isPublic: boolean;
    isSoftDelete: boolean;
    created_at: string;
}

interface GroupStats {
    totalGroups: number;
    activeGroups: number;
    inactiveGroups: number;
    totalMembers: number;
    totalPoints: number;
    lastUpdated: string;
}

interface PaginatedGroups {
    data: GroupProfile[];
    page: number;
    pageSize: number;
    totalCount: number | null;
    hasMore: boolean;
}

interface CompleteGroupSummary {
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

interface CompleteGroupResponse {
    summary: CompleteGroupSummary | null;
    error: string | null;
    success: boolean;
}

