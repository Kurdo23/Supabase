import {SupabaseClient} from "@supabase/supabase-js";

interface GroupProfile {
    uuid: string;
    name: string;
    description: string | null;
    avatar: string | null;
    status: 'active' | 'inactive';
    type: 'family' | 'enterprise' | 'association' | 'other';
    member_count: number;
    total_points: number;
    admin_name: string;
    admin_uuid: string;
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