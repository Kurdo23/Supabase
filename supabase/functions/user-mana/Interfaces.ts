interface UserProfile {
    idUser: string;
    username: string;
    email: string;
    avatar: string | null;
    isSoftDelete: boolean;
}

interface UserDetail {
    idUser: string,
    username: string;
    email: string;
    avatar : string | null;
    name: string;
    lastname: string;
    xp: string;
    isSoftDelete: boolean;
    lasSignInAt: string;
}

interface UserStats {
    total: number;
    active: number;
    inactive: number;
    suspended: number;
    lastUpdated: string;
}

interface PaginatedUsers {
    data: UserProfile[];
    page: number;
    pageSize: number;
    totalCount: number | null;
    hasMore: boolean;
}

interface CompleteSummary {
    stats: UserStats;
    users: UserProfile[];
    pagination: {
        currentPage: number;
        pageSize: number;
        totalCount: number;
        totalPages: number;
        hasMore: boolean;
    };
}

interface CompleteResponse {
    summary: CompleteSummary | null;
    error: string | null;
    success: boolean;
}